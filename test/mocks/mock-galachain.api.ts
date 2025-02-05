/* eslint-disable @typescript-eslint/no-unused-vars */
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  SigningClient,
  BurnTokensRequest,
  BatchMintTokenRequest,
  TransferTokenRequest,
} from '@gala-chain/connect';

import {
  BatchMintTokenDto,
  MintTokenDto,
  TokenClassKeyProperties,
} from '@gala-chain/api';
import { APP_SECRETS } from '../../src/secrets/secrets.module';
import { TokenInstanceKeyDto } from '../../src/dtos/TokenInstanceKey.dto';
import { computeAddress } from 'ethers';
import { checkTokenEquality, tokenToReadable } from '../../src/chain.helper';
import BigNumber from 'bignumber.js';
import { recoverWalletAddressFromSignature } from '../../src/utils/web3wallet';

interface TokenBalance {
  owner: string;
  collection: string;
  category: string;
  type: string;
  additionalKey: string;
  quantity: BigNumber;
}

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

  private tokenBalances: Map<string, [TokenBalance]> = new Map();

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

  async fetchBalances(ownerAddress: string) {
    return {
      success: true,
      Data: this.tokenBalances[ownerAddress] || [],
    };
  }

  async transferToken(dto: TransferTokenRequest, signer?: SigningClient) {
    const transferFrom =
      signer.galaChainAddress || this.adminSigner.galaChainAddress;

    this.deductBalance(dto.tokenInstance, dto.quantity as any, transferFrom);
    this.grantBalanceForToken(dto.to, dto.tokenInstance, Number(dto.quantity));
    const newBalances = await this.getBalancesForToken(
      dto.to,
      dto.tokenInstance as any,
    );
    return {
      success: true,
      Data: newBalances.Data,
    };
  }

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
    const tokenBalances = (this.tokenBalances[ownerAddress] || []).filter(
      (balance) => checkTokenEquality(balance, tokenClassKey),
    );
    return {
      success: true,
      Data: tokenBalances || [],
    };
  }

  async getAllowancesForToken(
    ownerAddress: string,
    tokenClassKey: TokenClassKeyProperties,
  ) {
    const tokenAllowances = (this.allowances[ownerAddress] || []).filter(
      (allowance) => checkTokenEquality(allowance.tokenClass, tokenClassKey),
    );
    return {
      success: true,
      Data: tokenAllowances || [],
    };
  }

  async getAllowanceAmount(
    ownerAddress: string,
    tokenClassKey: TokenClassKeyProperties,
  ) {
    const allowances = await this.getAllowancesForToken(
      ownerAddress,
      tokenClassKey,
    );

    const totalQuantity = allowances.Data.filter(
      (allowance) => allowance.tokenClass === tokenClassKey,
    ).reduce((sum, allowance) => sum + allowance.quantity, 0);

    return totalQuantity;
  }

  //TEST ONLY
  grantAllowancesForToken(
    grantedToGC: string,
    grantedFromGC: string,
    tokenClass: TokenClassKeyProperties,
    amount: number,
  ) {
    if (!this.allowances[grantedToGC]) {
      this.allowances[grantedToGC] = [];
    }

    this.allowances[grantedToGC].push({
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
    if (!this.tokenBalances[grantedToGC]) {
      this.tokenBalances[grantedToGC] = [];
    }

    const index = this.tokenBalances[grantedToGC].findIndex(
      (balance: TokenBalance) => checkTokenEquality(balance, tokenClass),
    );

    if (index !== -1) {
      const currentAmount = Number(
        this.tokenBalances[grantedToGC][index].quantity,
      );
      this.tokenBalances[grantedToGC][index].quantity =
        currentAmount + Number(amount);
    } else {
      this.tokenBalances[grantedToGC].push({
        quantity: amount as any,
        ...tokenClass,
        owner: grantedToGC,
      } as TokenBalance);
    }
  }

  //TODO: add checks to see if the user has a mint allowance
  //TODO: mimic gas fee here too
  async batchMintToken(dto: BatchMintTokenRequest, signer?: SigningClient) {
    // const signer = recoverWalletAddressFromSignature(dto);
    (dto.mintDtos as unknown as MintTokenDto[]).forEach((mint) => {
      console.log(mint.signerAddress);
      this.deductAllowance(
        mint.tokenClass,
        Number(mint.quantity),
        signer.galaChainAddress || this.adminSigner.galaChainAddress,
      );
      this.grantBalanceForToken(
        mint.owner,
        mint.tokenClass,
        Number(mint.quantity),
      );
    });
    return {
      Status: 1,
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

  //TEST ONLY
  deductAllowance(
    tokenClassKey: TokenClassKeyProperties,
    amount: number,
    user: string,
  ): void {
    const totalQuantity =
      this.allowances[user]
        ?.filter((allowance) =>
          checkTokenEquality(allowance.tokenClass, tokenClassKey),
        )
        // ?.filter((allowance) => allowance.tokenClass === tokenClassKey)
        .reduce(
          (sum, allowance) =>
            sum + allowance.quantity - allowance.quantitySpent,
          0,
        ) ?? 0;

    if (totalQuantity < amount) {
      throw new Error('Insufficient allowance balance');
    }

    this.allowances[user].forEach((allowance) => {
      if (
        checkTokenEquality(allowance.tokenClass, tokenClassKey) &&
        amount > 0
      ) {
        const availableQuantity = allowance.quantity - allowance.quantitySpent;

        if (availableQuantity >= amount) {
          allowance.quantitySpent += amount;
          amount = 0;
        } else {
          allowance.quantitySpent += availableQuantity;
          amount -= availableQuantity;
        }
      }
    });

    // If amount is still greater than 0, we haven't been able to deduct the full amount, so throw error
    if (amount > 0) {
      throw new Error('Insufficient allowance balance');
    }
  }

  deductBalance(
    tokenClassKey: TokenClassKeyProperties,
    amount: number,
    user: string,
  ): void {
    const totalQuantity =
      this.tokenBalances[user]
        .filter((balance: TokenBalance) =>
          checkTokenEquality(balance, tokenClassKey),
        )
        // ?.filter((allowance) => allowance.tokenClass === tokenClassKey)
        .reduce(
          (sum: number, balance: TokenBalance) =>
            sum + Number(balance.quantity),
          0,
        ) ?? 0;

    if (totalQuantity < amount) {
      throw new Error('Insufficient token balance');
    }

    this.tokenBalances[user].forEach((balance: TokenBalance) => {
      if (checkTokenEquality(balance, tokenClassKey) && amount > 0) {
        const availableQuantity = Number(balance.quantity);

        if (availableQuantity >= amount) {
          amount = 0;
        } else {
          amount -= availableQuantity;
        }
      }
    });

    // If amount is still greater than 0, we haven't been able to deduct the full amount, so throw error
    if (amount > 0) {
      throw new Error('Insufficient allowance balance');
    }
  }
}
