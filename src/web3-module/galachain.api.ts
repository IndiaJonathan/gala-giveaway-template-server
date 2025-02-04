import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  TokenApi,
  SigningClient,
  WalletUtils,
  BurnTokensRequest,
  BatchMintTokenRequest,
  TransferTokenRequest,
} from '@gala-chain/connect';

import {
  createValidDTO,
  FetchAllowancesDto,
  FetchBalancesDto,
  TokenClassKeyProperties,
} from '@gala-chain/api';
import { APP_SECRETS } from '../secrets/secrets.module';
import { TokenInstanceKeyDto } from '../dtos/TokenInstanceKey.dto';

@Injectable()
export class GalachainApi implements OnModuleInit {
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

  async burnToken(request: BurnTokensRequest, signer?: SigningClient) {
    const tokenApi = new TokenApi(
      this.tokenApiEndpoint,
      signer || this.adminSigner,
    );
    return tokenApi.BurnTokens(request);
  }

  async getBalancesForToken(
    ownerAddress: string,
    tokenClassKey: TokenInstanceKeyDto,
    signer?: SigningClient,
  ) {
    const tokenApi = new TokenApi(
      this.tokenApiEndpoint,
      signer || this.adminSigner,
    );
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
    tokenClassKey: TokenClassKeyProperties,
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

  async transferToken(dto: TransferTokenRequest, signer?: SigningClient) {
    const tokenApi = new TokenApi(
      this.tokenApiEndpoint,
      signer || this.adminSigner,
    );
    return tokenApi.TransferToken(dto);
  }

  async batchMintToken(dto: BatchMintTokenRequest, signer?: SigningClient) {
    const tokenApi = new TokenApi(
      this.tokenApiEndpoint,
      signer || this.adminSigner,
    );
    return tokenApi.BatchMintToken(dto);
  }

  async isRegistered(address: string) {
    const tokenApi = new TokenApi(this.tokenApiEndpoint, this.adminSigner);
    try {
      const isRegisteredResponse: any = await tokenApi.GetObjectByKey({
        objectId: `\u0000GCUP\u0000${address.replace('0x', '').replace('eth|', '').replace('client|', '')}\u0000`,
      });

      return {
        exists: isRegisteredResponse.Status === 1,
        alias: isRegisteredResponse.Data.alias,
      };
    } catch (e) {
      if (e.Error) {
        if (e.Error && e.Error.ErrorKey === 'OBJECT_NOT_FOUND') {
          return {
            exists: false,
          };
        }
      }
      console.error(e);
      throw e;
    }
  }

  async createRandomWallet(registrationEndpoint: string) {
    return WalletUtils.createAndRegisterRandomWallet(registrationEndpoint);
  }
}
