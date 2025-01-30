/* eslint-disable @typescript-eslint/no-unused-vars */
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
  TokenClassKeyProperties,
} from '@gala-chain/api';
import { APP_SECRETS } from '../../src/secrets/secrets.module';
import { TokenInstanceKeyDto } from '../../src/dtos/TokenInstanceKey.dto';
import { getAddress, computeAddress } from 'ethers';

@Injectable()
export class MockGalachainApi implements OnModuleInit {
  private adminSigner: SigningClient;
  private registeredAddresses: Map<string, string> = new Map();

  // Initialize the service and mock API endpoint
  async onModuleInit() {
    const privateKey = this.secrets['GIVEAWAY_PRIVATE_KEY'];
    this.adminSigner = new SigningClient(privateKey);

    jest.spyOn(global, 'fetch').mockImplementation(
      jest.fn(
        (url: string, data: { body: string; headers: any; method: string }) => {
          if (url === this.secrets['REGISTRATION_ENDPOINT']) {
            const parsedBody = JSON.parse(data.body);
            const w3wPublicKey = parsedBody.publicKey;
            const ethAddress = computeAddress(parsedBody.publicKey);
            const gcAddress = ethAddress.replace('0x', 'eth|');

            this.registeredAddresses.set(ethAddress, gcAddress);

            return Promise.resolve({
              json: () => Promise.resolve({ data: 100 }),
              status: 200,
            });

            //Add address to list here
          }
        },
      ) as jest.Mock,
    );
  }

  constructor(@Inject(APP_SECRETS) private secrets: Record<string, any>) {}

  // Mock address transformation
  getGCAddress(address: string) {
    return address.replace('0x', 'eth|');
  }

  // Mock fetchBalances method for testing purposes
  async fetchBalances(ownerAddress: string) {
    // Mock response similar to expected real response
    return {
      success: true,
      data: {
        owner: ownerAddress,
        balances: [
          { tokenId: 'mock-token-1', amount: 100 },
          { tokenId: 'mock-token-2', amount: 200 },
        ],
      },
    };
  }

  // Mock burnToken method
  async burnToken(request: BurnTokensRequest) {
    return {
      success: true,
      message: `Successfully burned tokens.`,
    };
  }

  // Mock getBalancesForToken method
  async getBalancesForToken(
    ownerAddress: string,
    tokenClassKey: TokenInstanceKeyDto,
  ) {
    return {
      success: true,
      data: {
        owner: ownerAddress,
        balance: 150, // Mock balance for token
      },
    };
  }

  async getAllowancesForToken(
    ownerAddress: string,
    tokenClassKey: TokenClassKeyProperties,
  ) {
    return {
      success: true,
      data: {
        allowances: [
          { grantedTo: '0x123', amount: 50 },
          { grantedTo: '0x456', amount: 100 },
        ],
      },
    };
  }

  async fetchAllowances(ownerAddress: string) {
    return {
      success: true,
      data: {
        owner: ownerAddress,
        allowances: [
          { tokenId: 'mock-token-1', grantedTo: '0x123', amount: 50 },
          { tokenId: 'mock-token-2', grantedTo: '0x456', amount: 100 },
        ],
      },
    };
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
}
