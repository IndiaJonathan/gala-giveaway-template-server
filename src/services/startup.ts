import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  SigningClient,
  WalletUtils,
  PublicKeyApi,
  GalaChainResponseError,
} from '@gala-chain/connect';
import { Wallet } from 'ethers';
import { APP_SECRETS } from '../secrets/secrets.module';

@Injectable()
export class StartupService implements OnModuleInit {
  private adminWallet: Wallet;
  private publicKeyEndpoint: string;

  constructor(@Inject(APP_SECRETS) private secrets: Record<string, any>) {}
  async onModuleInit() {
    const registrationEndpoint = await this.secrets['REGISTRATION_ENDPOINT'];
    const privateKey = await this.secrets['GIVEAWAY_PRIVATE_KEY'];
    this.adminWallet = new Wallet(privateKey);
    const client = new SigningClient(privateKey);
    this.publicKeyEndpoint = await this.secrets['PUBLIC_KEY_API_ENDPOINT'];

    const publicKeyApi = new PublicKeyApi(this.publicKeyEndpoint, client);

    try {
      const profile = await publicKeyApi.GetMyProfile();
      if (profile.Data) {
        console.log(`Profile found: ${profile.Data.alias}`);
      } else {
        const registerWallet = await WalletUtils.registerWallet(
          registrationEndpoint,
          this.adminWallet.signingKey.publicKey,
        );
        console.warn(registerWallet);
      }
    } catch (e) {
      if (e instanceof GalaChainResponseError) {
        if (e.ErrorCode === 400) {
          //Not signed up, sign up
          const registerWallet = await WalletUtils.registerWallet(
            registrationEndpoint,
            this.adminWallet.signingKey.publicKey,
          );
          console.warn(registerWallet);
        }
      } else {
        console.error(e);
      }
    }
  }
}
