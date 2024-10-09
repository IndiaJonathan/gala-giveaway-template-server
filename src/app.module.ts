import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TelegramController } from './controllers/telegram.controller';
import { WalletController } from './controllers/wallet.controller';
import { SecretConfigService } from './services/secrets.service';
import { BabyOpsApi } from './services/token.service';
import { AppController } from './app.controller';
import { DatabaseService } from './services/mongo';
import { GiveawayController } from './controllers/giveaway.controller';
import { GiveawayService } from './services/giveaway.service';

@Module({
  imports: [ConfigModule.forRoot()],
  controllers: [
    AppController,
    WalletController,
    TelegramController,
    GiveawayController,
  ],
  providers: [
    SecretConfigService,
    BabyOpsApi,
    DatabaseService,
    GiveawayService,
  ],
})
export class AppModule {}
