import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GivewayScheduler } from './giveway-scheduler.service';
import { GiveawayService } from './giveaway.service';
import { GiveawayController } from './giveaway.controller';
import { DatabaseModule } from '../mongoose-module/database.module';
import { ProfileService } from '../services/profile.service';
import { SecretConfigService } from '../secrets/secrets.service';
import { BabyOpsApi } from '../services/baby-ops.service';

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule],
  providers: [
    GiveawayService,
    GivewayScheduler,
    ProfileService,
    SecretConfigService,
    BabyOpsApi,
  ],
  controllers: [GiveawayController],
})
export class GiveawayModule {}
