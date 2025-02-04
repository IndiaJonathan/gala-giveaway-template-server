import { Inject, Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GiveawayService } from './giveaway.service';
import { ProfileService } from '../profile-module/profile.service';
import {
  GalaChainResponseError,
  SigningClient,
  TokenApi,
  WalletUtils,
} from '@gala-chain/connect';
import { APP_SECRETS } from '../secrets/secrets.module';
import { GiveawayDocument, GiveawayStatus } from '../schemas/giveaway.schema';
import { GalachainApi } from '../web3-module/galachain.api';
import { GiveawayTokenType } from '../dtos/giveaway.dto';

@Injectable()
export class GivewayScheduler {
  constructor(
    private giveawayService: GiveawayService,
    private galachainApi: GalachainApi,
    private profileService: ProfileService,
    @Inject(APP_SECRETS) private secrets: Record<string, any>,
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
      const decryptedKey =
        await creatorProfile.decryptPrivateKey(encryptionKey);
      await this.profileService.checkAndRegisterProfile(decryptedKey);
      const giveawayWalletSigner = new SigningClient(decryptedKey);

      let winners = giveaway.winners;
      if (!giveaway.winners || !giveaway.winners.length) {
        console.log(`Determining winners...`);
        winners = this.giveawayService.determineWinners(giveaway);
        giveaway.winners = winners;
        console.log(`Determined ${giveaway.winners} winners`);
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
          if (giveaway.giveawayTokenType === GiveawayTokenType.ALLOWANCE) {
            const mintResult = await this.galachainApi.batchMintToken(
              {
                mintDtos: mappedWinners as any,
              },
              giveawayWalletSigner,
            );
            if (mintResult.Status === 1) {
              giveaway.giveawayStatus = GiveawayStatus.Completed;
              console.log(`Giveway done!`);
            } else {
              giveaway.giveawayErrors.push((mintResult as any).message);
              console.log(
                `Giveaway had errors, will retry later. Error: ${(mintResult as any).message}`,
              );
            }
          } else if (giveaway.giveawayTokenType === GiveawayTokenType.BALANCE) {
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

                  return { success: true, result: transferResult };
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
                if (transferResult.result.Data.length > 1) {
                  console.error(
                    'Multiple txs found!!!!',
                    `${JSON.stringify(transferResult)}`,
                  );
                }
                owner = transferResult.result.Data[0].owner;
              } else {
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
          giveaway.giveawayErrors.push(JSON.stringify(e));
          if (giveaway.giveawayErrors.length > 5) {
            //5 or more errors, just call it
            giveaway.giveawayStatus = GiveawayStatus.Errored;
          }
          await giveaway.save();
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
  throw error;
}

function getUserFromMessage(message: string) {
  // Regex to match the specific message format and extract the user ID
  const userRegex = /User (\w+) is not registered\./;
  const match = message.match(userRegex);

  // Return the extracted user ID if the message matches, otherwise null
  return match ? match[1] : null;
}
