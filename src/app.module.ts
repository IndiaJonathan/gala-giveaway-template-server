import { Module } from '@nestjs/common';
import { WalletController } from './controllers/wallet.controller';
import { BabyOpsApi } from './services/baby-ops.service';
import { AppController } from './app.controller';
import { DatabaseService } from './services/mongo';
import { GiveawayService } from './giveway-module/giveaway.service';
import { ProfileController } from './controllers/profile.controller';
import { ProfileService } from './services/profile.service';
import { SecretConfigModule } from './secrets/secrets.module';
import { GiveawayModule } from './giveway-module/giveaway.module';
import { DatabaseModule } from './mongoose-module/database.module';
import { StartupService } from './services/startup';
import { SignatureService } from './signature.service';

@Module({
  imports: [GiveawayModule, SecretConfigModule, DatabaseModule],
  controllers: [AppController, WalletController, ProfileController],
  providers: [
    BabyOpsApi,
    SignatureService,
    DatabaseService,
    GiveawayService,
    ProfileService,
    StartupService,
  ],
})
export class AppModule {}
