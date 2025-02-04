import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { GivewayScheduler } from './giveway-scheduler.service';
import { GiveawayService } from './giveaway.service';
import { GiveawayController } from './giveaway.controller';
import { DatabaseModule } from '../database-module/database.module';
import { ProfileService } from '../profile-module/profile.service';
import { SecretConfigModule } from '../secrets/secrets.module';
import { Web3Module } from '../web3-module/web3.module';

@Module({
  imports: [
    ScheduleModule.forRoot(),
    DatabaseModule,
    SecretConfigModule,
    Web3Module,
  ],
  providers: [GiveawayService, GivewayScheduler, ProfileService],
  controllers: [GiveawayController],
  exports: [GiveawayService],
})
export class GiveawayModule {}
