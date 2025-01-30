import { Module } from '@nestjs/common';
import { GalachainApi } from './web3-module/galachain.api';
import { AppController } from './app.controller';
import { SecretConfigModule } from './secrets/secrets.module';
import { GiveawayModule } from './giveway-module/giveaway.module';
import { DatabaseModule } from './database-module/database.module';
import { StartupService } from './services/startup';
import { SignatureService } from './signature.service';
import { GalaConnectApiService } from './web3-module/connect.api';
import { ProfileModule } from './profile-module/profile.module';
import { Web3Module } from './web3-module/web3.module';

@Module({
  imports: [
    GiveawayModule,
    ProfileModule,
    SecretConfigModule,
    DatabaseModule,
    Web3Module,
  ],
  controllers: [AppController],
  providers: [
    GalaConnectApiService,
    GalachainApi,
    SignatureService,
    StartupService,
  ],
})
export class AppModule {}
