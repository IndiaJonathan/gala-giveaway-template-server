import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  TokenApi,
  SigningClient,
  WalletUtils,
  PresignedClient,
  BurnTokensRequest,
} from '@gala-chain/connect';

import {
  createValidDTO,
  FetchAllowancesDto,
  FetchBalancesDto,
  TokenAllowance,
  TokenClassKey,
} from '@gala-chain/api';
import BigNumber from 'bignumber.js';
import { GiveawayService } from '../giveway-module/giveaway.service';
import { APP_SECRETS } from '../secrets/secrets.module';
import { ObjectId } from 'mongodb';

@Injectable()
export class BabyOpsApi implements OnModuleInit {
  private adminSigner: SigningClient;
  private tokenApiEndpoint: string;

  async onModuleInit() {
    this.tokenApiEndpoint = await this.secrets['TOKEN_API_ENDPOINT'];
    const privateKey = await this.secrets['GIVEAWAY_PRIVATE_KEY'];
    this.adminSigner = new SigningClient(privateKey);
  }
  constructor(@Inject(APP_SECRETS) private secrets: Record<string, any>) {}
  getGCAddress(address: string) {
    return address.replace('0x', 'eth|');
  }

  async fetchBalances(ownerAddress: string) {
    const tokenApi = new TokenApi(this.tokenApiEndpoint, this.adminSigner);
    const fetchBalances = await createValidDTO<FetchBalancesDto>(
      FetchBalancesDto,
      {
        owner: ownerAddress,
      },
    );
    return tokenApi.FetchBalances(fetchBalances);
  }

  async burnToken(request: BurnTokensRequest) {
    const presignedClient = new PresignedClient();
    const tokenApi = new TokenApi(this.tokenApiEndpoint, presignedClient);
    return tokenApi.BurnTokens(request);
  }

  async getBalancesForToken(
    ownerAddress: string,
    tokenClassKey: TokenClassKey,
  ) {
    const tokenApi = new TokenApi(this.tokenApiEndpoint, this.adminSigner);
    const fetchAllowanceDto = await createValidDTO<FetchBalancesDto>(
      FetchBalancesDto,
      {
        ...tokenClassKey,
        owner: ownerAddress,
      },
    );
    const balances = await tokenApi.FetchBalances(fetchAllowanceDto);
    return balances;
  }

  async getAllowancesForToken(
    ownerAddress: string,
    tokenClassKey: TokenClassKey,
  ) {
    const tokenApi = new TokenApi(this.tokenApiEndpoint, this.adminSigner);
    const fetchAllowanceDto = await createValidDTO<FetchAllowancesDto>(
      FetchAllowancesDto,
      {
        grantedTo: ownerAddress,
        ...tokenClassKey,
        instance: '0',
      },
    );
    const allowances = await tokenApi.FetchAllowances(fetchAllowanceDto);
    return allowances;
  }

  async fetchAllowances(ownerAddress: string) {
    const tokenApi = new TokenApi(this.tokenApiEndpoint, this.adminSigner);
    const fetchAllowanceDto = await createValidDTO<FetchAllowancesDto>(
      FetchAllowancesDto,
      {
        grantedTo: ownerAddress,
      },
    );
    return tokenApi.FetchAllowances(fetchAllowanceDto);
  }

  async createRandomWallet(registrationEndpoint: string) {
    return WalletUtils.createAndRegisterRandomWallet(registrationEndpoint);
  }
}
