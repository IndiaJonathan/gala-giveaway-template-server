import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GivewayScheduler } from './giveway-scheduler.service';
import { GiveawayService } from './giveaway.service';
import { GiveawayController } from './giveaway.controller';
import { DatabaseModule } from '../mongoose-module/database.module';
import { ProfileService } from '../services/profile.service';
import { BabyOpsApi } from '../services/baby-ops.service';
import { SecretConfigModule } from '../secrets/secrets.module';

@Module({
  imports: [ScheduleModule.forRoot(), DatabaseModule, SecretConfigModule],
  providers: [GiveawayService, GivewayScheduler, ProfileService, BabyOpsApi],
  controllers: [GiveawayController],
})
export class GiveawayModule {}
