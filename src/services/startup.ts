import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { Wallet } from 'ethers';
import { APP_SECRETS } from '../secrets/secrets.module';
import { ProfileService } from './profile.service';

@Injectable()
export class StartupService implements OnModuleInit {
  private adminWallet: Wallet;

  constructor(
    @Inject(APP_SECRETS) private secrets: Record<string, any>,
    private profileService: ProfileService,
  ) {}
  async onModuleInit() {
    const privateKey = await this.secrets['GIVEAWAY_PRIVATE_KEY'];
    this.adminWallet = new Wallet(privateKey);

    this.profileService.checkAndRegisterProfile(
      this.adminWallet.signingKey.privateKey,
    );
  }
}
