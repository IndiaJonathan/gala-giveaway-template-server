/* eslint-disable @typescript-eslint/no-unused-vars */
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { SigningClient, BurnTokensRequest } from '@gala-chain/connect';

import { TokenBalance, TokenClassKeyProperties } from '@gala-chain/api';
import { APP_SECRETS } from '../../src/secrets/secrets.module';
import { TokenInstanceKeyDto } from '../../src/dtos/TokenInstanceKey.dto';
import { computeAddress } from 'ethers';
import { tokenToReadable } from '../../src/chain.helper';
import BigNumber from 'bignumber.js';

@Injectable()
export class MockGalachainApi implements OnModuleInit {
  private adminSigner: SigningClient;
  private registeredAddresses: Map<string, string> = new Map();
  private allowances: Map<
    string,
    Array<{
      grantedTo: string;
      grantedBy: string;
      uses: number;
      usesSpent: number;
      quantity: number;
      quantitySpent: number;
      tokenClass: TokenClassKeyProperties;
    }>
  > = new Map();
  private tokenBalances: Map<string, number> = new Map();

  async onModuleInit() {
    const privateKey = this.secrets['GIVEAWAY_PRIVATE_KEY'];
    this.adminSigner = new SigningClient(privateKey);

    jest.spyOn(global, 'fetch').mockImplementation(
      jest.fn(
        (url: string, data: { body: string; headers: any; method: string }) => {
          if (url === this.secrets['REGISTRATION_ENDPOINT']) {
            const parsedBody = JSON.parse(data.body);
            const ethAddress = computeAddress(parsedBody.publicKey);
            const gcAddress = ethAddress.replace('0x', 'eth|');

            this.registeredAddresses.set(ethAddress, gcAddress);

            return Promise.resolve({
              json: () => Promise.resolve({ data: 100 }),
              status: 200,
            });
          }
        },
      ) as jest.Mock,
    );
  }

  constructor(@Inject(APP_SECRETS) private secrets: Record<string, any>) {}

  getGCAddress(address: string) {
    return address.replace('0x', 'eth|');
  }

  //   async fetchBalances(ownerAddress: string) {
  //     return {
  //       success: true,
  //       data: {
  //         owner: ownerAddress,
  //         balances: [
  //           { tokenId: 'mock-token-1', amount: 100 },
  //           { tokenId: 'mock-token-2', amount: 200 },
  //         ],
  //       },
  //     };
  //   }

  async burnToken(request: BurnTokensRequest) {
    return {
      success: true,
      message: `Successfully burned tokens.`,
    };
  }

  async getBalancesForToken(
    ownerAddress: string,
    tokenClassKey: TokenInstanceKeyDto,
  ) {
    const amount = this.tokenBalances.get(
      this.getBalanceKey(ownerAddress, tokenClassKey),
    );
    return {
      success: true,
      Data: [
        {
          ...tokenClassKey,
          owner: ownerAddress,
          quantity: amount || 0,
        },
      ],
    };
  }

  async getAllowancesForToken(
    ownerAddress: string,
    tokenClassKey: TokenClassKeyProperties,
  ) {
    return {
      success: true,
      Data: this.allowances.get(ownerAddress) || [],
    };
  }

  //TEST ONLY
  grantAllowancesForToken(
    grantedToGC: string,
    grantedFromGC: string,
    tokenClass: TokenClassKeyProperties,
    amount: number,
  ) {
    if (!this.allowances.has(grantedToGC)) {
      this.allowances.set(grantedToGC, []);
    }

    this.allowances.get(grantedToGC)?.push({
      grantedBy: grantedFromGC,
      grantedTo: grantedToGC,
      quantity: amount,
      uses: amount,
      quantitySpent: 0,
      usesSpent: 0,
      tokenClass,
    });
  }

  //TEST ONLY
  grantBalanceForToken(
    grantedToGC: string,
    tokenClass: TokenClassKeyProperties,
    amount: number,
  ) {
    this.tokenBalances.set(this.getBalanceKey(grantedToGC, tokenClass), amount);
  }

  async isRegistered(address: string) {
    //check if it has been registered above
    if (this.registeredAddresses.has(address)) {
      return {
        exists: true,
        alias: this.registeredAddresses.get(address), // Return the alias
      };
    }

    return {
      exists: false,
    };
  }

  async createRandomWallet(_registrationEndpoint: string) {
    return {
      success: true,
      wallet: {
        address: '0xmockaddress',
        privateKey: 'mock-private-key',
      },
    };
  }

  getBalanceKey(grantedToGC: string, tokenClass: TokenClassKeyProperties) {
    return grantedToGC + ':' + tokenToReadable(tokenClass);
  }
}
