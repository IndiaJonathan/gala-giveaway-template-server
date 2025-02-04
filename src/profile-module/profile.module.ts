import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database-module/database.module';
import { ProfileService } from './profile.service';
import { SecretConfigModule } from '../secrets/secrets.module';
import { ProfileController } from './profile.controller';
import { Web3Module } from '../web3-module/web3.module';
import { GiveawayModule } from '../giveway-module/giveaway.module';

@Module({
  imports: [DatabaseModule, SecretConfigModule, Web3Module, GiveawayModule],
  providers: [ProfileService],
  controllers: [ProfileController],
  exports: [ProfileService],
})
export class ProfileModule {}
