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

    console.log(`Found: ${giveaways.length} giveaways ready for distribution`);
  }
}
