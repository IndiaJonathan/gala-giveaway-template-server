import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  SigningClient,
  WalletUtils,
  PublicKeyApi,
  GalaChainResponseError,
} from '@gala-chain/connect';
import { SecretConfigService } from '../secrets/secrets.service';
import { Wallet } from 'ethers';

@Injectable()
export class StartupService implements OnModuleInit {
  private adminWallet: Wallet;
  private publicKeyEndpoint: string;

  constructor(private secretsService: SecretConfigService) {}
  async onModuleInit() {
    const registrationEndpoint = await this.secretsService.getSecret(
      'REGISTRATION_ENDPOINT',
    );
    const privateKey = await this.secretsService.getSecret(
      'GIVEAWAY_PRIVATE_KEY',
    );
    this.adminWallet = new Wallet(privateKey);
    const client = new SigningClient(privateKey);
    this.publicKeyEndpoint = await this.secretsService.getSecret(
      'PUBLIC_KEY_API_ENDPOINT',
    );

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
