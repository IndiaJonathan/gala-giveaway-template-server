import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GiveawayService } from './giveaway.service';
import { ProfileService } from '../services/profile.service';
import { SigningClient, TokenApi } from '@gala-chain/connect';
import { SecretConfigService } from '../secrets/secrets.service';

@Injectable()
export class GivewayScheduler {
  constructor(
    private giveawayService: GiveawayService,
    private profileService: ProfileService,
    private secretsService: SecretConfigService,
  ) {}

  @Cron('0 * * * * *') // This cron expression runs every minute on the 0th second
  async handleCron() {
    const giveaways = await this.giveawayService.findReadyForDistribution();
    if (!giveaways.length) {
      return;
    }

    const tokenApiEndpoint =
      await this.secretsService.getSecret('TOKEN_API_ENDPOINT');

    for (let index = 0; index < giveaways.length; index++) {
      const giveaway = giveaways[index];
      const creatorProfile = await this.profileService.findProfile(
        giveaway.creator,
      );
      const decryptedKey = await creatorProfile.decryptPrivateKey(
        this.secretsService,
      );
      const giveawayWalletSigner = new SigningClient(decryptedKey);
      const tokenApi = new TokenApi(tokenApiEndpoint, giveawayWalletSigner);

      let winners = giveaway.winners;
      if (!giveaway.winners || !giveaway.winners.length) {
        console.log(`Determining winners...`);
        winners = this.giveawayService.determineWinners(giveaway);
        giveaway.winners = winners;
        console.log(`Determined ${giveaway.winners} winners`);
      }
      await giveaway.save();
      let hasErrors = false;
      try {
        for (let index = 0; index < winners.length; index++) {
          const winner = winners[index];
          if (winner.isDistributed) continue;
          try {
            const mintResult = await tokenApi.MintToken({
              owner: winner.gcAddress,
              quantity: winner.winAmount,
              tokenClass: giveaway.giveawayToken,
            });
            if ((mintResult as any).Status === 1) {
              winner.isDistributed = true;
              winner.error = null;
            } else {
              winner.error =
                mintResult.message || 'Unable to mint to user, unknown error';
              hasErrors = true;
            }
          } catch (transferError) {
            console.error(
              `Transfer error for winner: ${winner.gcAddress}, ${JSON.stringify(transferError)}`,
            );
            winner.error = JSON.stringify(transferError);
          }
        }
        if (!hasErrors) {
          giveaway.distributed = true;
          console.log(`Giveway done!`);
        } else {
          console.log('Giveaway had errors, will retry later');
        }
      } catch (e) {
        console.error(e);
      } finally {
        await giveaway.save();
      }
    }
  }
}
