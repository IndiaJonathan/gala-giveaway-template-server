import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GiveawayService } from './giveaway.service';
import { ProfileService } from '../profile-module/profile.service';
import {
  GalaChainResponseError,
  SigningClient,
  WalletUtils,
} from '@gala-chain/connect';
import { APP_SECRETS } from '../secrets/secrets.module';
import { GiveawayDocument, GiveawayStatus } from '../schemas/giveaway.schema';
import { GalachainApi } from '../web3-module/galachain.api';
import { GiveawayTokenType } from '../dtos/giveaway.dto';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import { WinDocument } from '../schemas/ClaimableWin.schema';
import { GalaChainResponseType } from '@gala-chain/api';

@Injectable()
export class GivewayScheduler {
  constructor(
    private giveawayService: GiveawayService,
    private galachainApi: GalachainApi,
    private profileService: ProfileService,
    @Inject(APP_SECRETS) private secrets: Record<string, any>,
    @InjectModel('Win')
    private readonly winModel: Model<WinDocument>,
  ) {}

  @Cron('0 * * * * *') // This cron expression runs every minute on the 0th second
  async handleCron() {
    const giveaways = await this.giveawayService.findReadyForDistribution();
    if (!giveaways.length) {
      return;
    }

    const encryptionKey = this.secrets['ENCRYPTION_KEY'];

    for (let index = 0; index < giveaways.length; index++) {
      const giveaway = giveaways[index];
      const creatorProfile = await this.profileService.findProfile(
        giveaway.creator,
      );
      if (!creatorProfile) {
        console.error(
          `Creator profile not found for giveaway: ${giveaway._id as any}`,
        );
        await handleGiveawayError(giveaway, 'Creator profile not found');
        continue;
      }
      const decryptedKey =
        await creatorProfile.decryptPrivateKey(encryptionKey);
      await this.profileService.checkAndRegisterProfile(decryptedKey);
      const giveawayWalletSigner = new SigningClient(decryptedKey);

      let winners = giveaway.winners;
      if (!giveaway.winners || !giveaway.winners.length) {
        console.log(`Determining winners...`);
        winners = this.giveawayService.determineWinners(giveaway);
        giveaway.winners = winners;
        console.log(`Determined ${giveaway.winners.length} winners`);

        // Create initial win entries for each winner right after determining winners
        // But skip for giveaways that require burn tokens to claim, as those will be created later
        if (winners.length > 0 && !giveaway.requireBurnTokenToClaim) {
          for (const winner of winners) {
            const winEntry = new this.winModel({
              giveaway: giveaway.id,
              amountWon: winner.winAmount,
              gcAddress: winner.gcAddress,
              claimed: false, // Initially set to false
              giveawayType: giveaway.giveawayType,
              timeWon: new Date(),
              // No winningInfo or paymentSent yet
            });
            await winEntry.save();
          }
        }
      }
      if (winners.length === 0) {
        giveaway.giveawayStatus = GiveawayStatus.Cancelled;
        await giveaway.save();
        continue;
      } else {
        await giveaway.save();
      }
      try {
        const mappedWinners = winners.map((winner) => ({
          owner: winner.gcAddress,
          quantity: winner.winAmount,
          tokenClass: giveaway.giveawayToken,
        }));
        if (giveaway.requireBurnTokenToClaim) {
          await this.giveawayService.createWinClaimsFromWinners(
            giveaway.id,
            winners,
          );
          giveaway.giveawayStatus = GiveawayStatus.Completed;
          await giveaway.save();
          console.log(`Burn Giveaway done!`);
        } else {
          //Mint directly
          if (
            giveaway.giveawayTokenType.toString() ===
            GiveawayTokenType.ALLOWANCE.toString()
          ) {
            const mintResult = await this.galachainApi.batchMintToken(
              {
                mintDtos: mappedWinners as any,
              },
              giveawayWalletSigner,
            );
            if (mintResult.Status === GalaChainResponseType.Success) {
              giveaway.giveawayStatus = GiveawayStatus.Completed;
              console.log(`Giveway done!`);

              // Update existing win entries for each winner
              for (const winner of winners) {
                const winEntry = await this.winModel.findOne({
                  giveaway: giveaway.id,
                  gcAddress: winner.gcAddress,
                });

                if (winEntry) {
                  winEntry.claimed = true;
                  winEntry.timeClaimed = new Date();
                  winEntry.winningInfo = JSON.stringify(mintResult);
                  winEntry.paymentSent = new Date();
                  await winEntry.save();
                }
              }
            } else {
              giveaway.giveawayErrors.push((mintResult as any).message);
              console.log(
                `Giveaway had errors, will retry later. Error: ${(mintResult as any).message}`,
              );
            }
          } else if (
            giveaway.giveawayTokenType.toString() ===
            GiveawayTokenType.BALANCE.toString()
          ) {
            const transfers = await Promise.all(
              mappedWinners.map(async (winner) => {
                try {
                  const transferResult = await this.galachainApi.transferToken(
                    {
                      quantity: winner.quantity as any,
                      to: winner.owner,
                      tokenInstance: {
                        ...winner.tokenClass,
                        instance: '0' as any,
                      },
                    },
                    giveawayWalletSigner,
                  );

                  return {
                    success: true,
                    result: transferResult,
                    owner: winner.owner,
                    quantity: winner.quantity,
                  };
                } catch (error) {
                  return {
                    success: false,
                    error: error.message || JSON.stringify(error),
                    owner: winner.owner,
                  };
                }
              }),
            );

            for (const transferResult of transfers) {
              let owner: string;
              if (transferResult.success) {
                owner = transferResult.owner;

              }
              const index = giveaway.winners.findIndex(
                (winner) => winner.gcAddress === owner,
              );
              if (index === -1) {
                await throwAndLogGiveawayError(
                  giveaway,
                  `Unable to find gcAddress for winner. Winner: ${owner}`,
                );
              }

              if (transferResult.error) {
                giveaway.winners[index].error = transferResult.error;
              } else {
                giveaway.winners[index].completed = true;

                // Update existing win entry after successful transfer
                if (transferResult.success) {
                  const winEntry = await this.winModel.findOne({
                    giveaway: giveaway.id,
                    gcAddress: owner,
                  });

                  if (winEntry) {
                    winEntry.claimed = true;
                    winEntry.timeClaimed = new Date();
                    winEntry.winningInfo = JSON.stringify(
                      transferResult.result,
                    );
                    winEntry.quantity = transferResult.quantity;
                    winEntry.paymentSent = new Date();
                    await winEntry.save();
                  } else {
                    await throwAndLogGiveawayError(
                      giveaway,
                      `Unable to find win entry for winner. Winner: ${owner}`,
                    );
                  }
                }
              }
            }

            const completed = giveaway.winners.every(
              (winner) => winner.completed,
            );
            if (completed) {
              giveaway.giveawayStatus = GiveawayStatus.Completed;
            }
          } else {
            giveaway.giveawayErrors.push(
              `Unknown giveawayTokenType: ${giveaway.giveawayTokenType}`,
            );
            giveaway.giveawayStatus = GiveawayStatus.Errored;
          }
          await giveaway.save();
        }
      } catch (e) {
        if (e instanceof GalaChainResponseError) {
          await handleGiveawayError(giveaway, e);
          const user = getUserFromMessage(e.Message);
          if (!user) {
            console.error(e);
          } else {
            const registrationURL = await this.secrets['REGISTRATION_ENDPOINT'];
            console.log(
              `Wallet not registered, attempting registration for wallet: eth|${user}`,
            );
            //Has user, attempt to register
            const response = await WalletUtils.registerWallet(
              registrationURL,
              'eth|' + user,
            );
            console.log(`Response: ${response}`);
          }
        } else {
          console.error(e);
          await handleGiveawayError(giveaway, e);
        }
      } finally {
        await giveaway.save();
      }
    }
  }
}

async function throwAndLogGiveawayError(
  giveaway: GiveawayDocument,
  error: string,
) {
  giveaway.giveawayErrors.push(error);
  await giveaway.save();
  throw new Error(error);
}

/**
 * Handles errors for giveaways by adding the error to the giveaway's error list,
 * checking if the errors are above the threshold (5), and setting the status to Errored if so.
 * @param giveaway The giveaway document to add the error to
 * @param error The error message or object to add
 * @param saveImmediately Whether to save the giveaway document immediately (default: true)
 * @returns The updated giveaway document
 */
async function handleGiveawayError(
  giveaway: GiveawayDocument,
  error: string | Error | GalaChainResponseError<any>,
  saveImmediately = true,
): Promise<GiveawayDocument> {
  let errorMessage: string;

  if (error instanceof Error) {
    errorMessage = error.message || JSON.stringify(error);
  } else if (typeof error === 'string') {
    errorMessage = error;
  } else {
    errorMessage = JSON.stringify(error);
  }

  giveaway.giveawayErrors.push(errorMessage);

  if (giveaway.giveawayErrors.length > 5) {
    giveaway.giveawayStatus = GiveawayStatus.Errored;
    console.error(
      `Giveaway: ${giveaway._id as any} has errored out after ${giveaway.giveawayErrors.length} errors!!!`,
    );
  }

  if (saveImmediately) {
    await giveaway.save();
  }

  return giveaway;
}

function getUserFromMessage(message: string) {
  // Regex to match the specific message format and extract the user ID
  const userRegex = /User (\w+) is not registered\./;
  const match = message.match(userRegex);

  // Return the extracted user ID if the message matches, otherwise null
  return match ? match[1] : null;
}
