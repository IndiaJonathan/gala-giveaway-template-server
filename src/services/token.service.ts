// src/services/token.service.ts
import { Injectable, OnModuleInit } from '@nestjs/common';
import {
  TokenApi,
  SigningClient,
  WalletUtils,
  PublicKeyApi,
} from '@gala-chain/connect';
import { SecretConfigService } from './secrets.service';
import { GrantAllowanceParams } from '@gala-chain/api';
import { Wallet } from 'ethers';

@Injectable()
export class BabyOpsApi implements OnModuleInit {
  private tokenApi: TokenApi;
  private publicKeyApi: PublicKeyApi;
  public client: SigningClient;
  private adminWallet: Wallet;

  constructor(private secretsService: SecretConfigService) { }
  async onModuleInit() {
    const registrationEndpoint = await this.secretsService.getSecret(
      'REGISTRATION_ENDPOINT',
    );
    const privateKey = await this.secretsService.getSecret(
      'GIVEAWAY_PRIVATE_KEY',
    );
    this.adminWallet = new Wallet(privateKey);
    this.client = new SigningClient(privateKey);
    const tokenApiEndpoint =
      await this.secretsService.getSecret('TOKEN_API_ENDPOINT');
    const publicKeyEndpoint = await this.secretsService.getSecret(
      'PUBLIC_KEY_API_ENDPOINT',
    );
    this.tokenApi = new TokenApi(tokenApiEndpoint, this.client);
    this.publicKeyApi = new PublicKeyApi(publicKeyEndpoint, this.client);

    try {
      const profile = await this.publicKeyApi.GetMyProfile();
      if (profile.Data) {
        console.log(`Profile found: ${profile.Data.alias}`);
      } else {
        const registerWallet = await WalletUtils.registerWallet(
          registrationEndpoint,
          this.adminWallet.signingKey.publicKey,
        );
        console.log(registerWallet);
      }
    } catch (e) {
      console.warn(e);
      const registerWallet = await WalletUtils.registerWallet(
        registrationEndpoint,
        this.adminWallet.signingKey.publicKey,
      );
      console.log(registerWallet);
    }
  }

  getAdminWalletInfo() {
    return {
      publicKey: this.adminWallet.signingKey.publicKey,
      gc_address: this.getGCAddress(this.adminWallet.address),
    };
  }

  getGCAddress(address: string) {
    return address.replace('0x', 'eth|');
  }

  async fetchBalances(ownerAddress: string) {
    return this.tokenApi.FetchBalances({ owner: ownerAddress });
  }

  async createRandomWallet(registrationEndpoint: string) {
    return WalletUtils.createAndRegisterRandomWallet(registrationEndpoint);
  }

  async grantAllowance(allowanceParams: GrantAllowanceParams) {
    return this.tokenApi.GrantAllowance(allowanceParams);
  }
}
