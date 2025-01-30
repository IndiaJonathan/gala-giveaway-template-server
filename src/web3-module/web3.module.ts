import { Module } from '@nestjs/common';
import { DatabaseModule } from '../database-module/database.module';
import { SecretConfigModule } from '../secrets/secrets.module';
import { GalaConnectApiService } from './connect.api';
import { WalletService } from './wallet.service';
import { GalachainApi } from './galachain.api';
import { WalletController } from './wallet.controller';

@Module({
  imports: [DatabaseModule, SecretConfigModule],
  providers: [GalaConnectApiService, WalletService, GalachainApi],
  controllers: [WalletController],
  exports: [GalachainApi, WalletService],
})
export class Web3Module {}
