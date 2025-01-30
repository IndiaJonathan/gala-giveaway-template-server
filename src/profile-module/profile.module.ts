import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database-module/database.module';
import { ProfileService } from './profile.service';
import { SecretConfigModule } from '../secrets/secrets.module';
import { GalaConnectApiService } from '../web3-module/connect.api';
import { ProfileController } from './profile.controller';

@Module({
  imports: [DatabaseModule, SecretConfigModule],
  providers: [ProfileService, GalaConnectApiService],
  controllers: [ProfileController],
})
export class ProfileModule {}
