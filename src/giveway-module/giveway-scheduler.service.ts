import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { GiveawayService } from './giveaway.service';

@Injectable()
export class GivewayScheduler {
  constructor(private giveawayService: GiveawayService) {}

  @Cron('0 * * * * *') // This cron expression runs every minute on the 0th second
  async handleCron() {
    const giveaways = await this.giveawayService.findReadyForDistribution();
    if (!giveaways.length) {
      return;
    }

    for (let index = 0; index < giveaways.length; index++) {
      const giveaway = giveaways[index];
      const winners = this.giveawayService.determineWinners(giveaway);
      giveaway.winners = winners;
      await giveaway.save();
    }

    console.log(`Found: ${giveaways.length} giveaways ready for distribution`);
  }
}
