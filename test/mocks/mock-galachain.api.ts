/* eslint-disable @typescript-eslint/no-unused-vars */
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import {
  SigningClient,
  BurnTokensRequest,
  BatchMintTokenRequest,
  TransferTokenRequest,
  MintTokenRequest,
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
      collection: string;
      category: string;
      type: string;
      additionalKey: string;
    }>
  > = new Map();

  private tokenBalances: Map<string, [TokenBalance]> = new Map();

  onModuleInit() {
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

  fetchBalances(ownerAddress: string) {
    return {
      success: true,
      Data: this.tokenBalances[ownerAddress] || [],
    };
  }

  transferToken(dto: TransferTokenRequest, signer?: SigningClient) {
    const transferFrom =
      signer?.galaChainAddress || this.adminSigner.galaChainAddress;

    this.deductBalance(
      dto.tokenInstance,
      new BigNumber(dto.quantity as any).plus(1).toNumber(),
      transferFrom,
    );
    this.grantBalanceForToken(dto.to, dto.tokenInstance, Number(dto.quantity));
    const newBalances = this.getBalancesForToken(
      dto.to,
      dto.tokenInstance as any,
    );
    return {
      success: true,
      Status: 1,
      Data: newBalances.Data,
    };
  }

  mintToken(dto: MintTokenRequest, signer?: SigningClient) {
    // Get the signer address
    const signerAddress =
      signer?.galaChainAddress || this.adminSigner.galaChainAddress;

    // Deduct allowance for the token
    this.deductAllowance(dto.tokenClass, Number(dto.quantity), signerAddress);

    // Add tokens to the balance
    this.grantBalanceForToken(dto.owner, dto.tokenClass, Number(dto.quantity));
    return {
      success: true,
      message: `Successfully minted tokens.`,
    };
  }

  burnToken(request: BurnTokensRequest) {
    return {
      success: true,
      message: `Successfully burned tokens.`,
    };
  }

  getBalancesForToken(
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

  getAllowancesForToken(
    ownerAddress: string,
    tokenClassKey: TokenClassKeyProperties,
  ) {
    const tokenAllowances = (this.allowances[ownerAddress] || []).filter(
      (allowance) =>
        checkTokenEquality(allowance, {
          ...tokenClassKey,
          instance: new BigNumber(0),
        }),
    );
    return {
      success: true,
      Data: tokenAllowances || [],
    };
  }

  getAllowanceAmount(
    ownerAddress: string,
    tokenClassKey: TokenClassKeyProperties,
  ) {
    const allowances = this.getAllowancesForToken(ownerAddress, tokenClassKey);

    const totalQuantity = allowances.Data.filter((allowance) =>
      checkTokenEquality(allowance, {
        ...tokenClassKey,
        instance: new BigNumber(0),
      }),
    ).reduce((sum, allowance) => sum + allowance.quantity, 0);

    return totalQuantity;
  }

  getAllowances(ownerAddress: string, tokenClassKey: TokenClassKeyProperties) {
    const allowances = this.getAllowancesForToken(ownerAddress, tokenClassKey);

    return allowances.Data;
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
      collection: tokenClass.collection,
      category: tokenClass.category,
      type: tokenClass.type,
      additionalKey: tokenClass.additionalKey,
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
  batchMintToken(dto: BatchMintTokenRequest, signer?: SigningClient) {
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

  isRegistered(address: string) {
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

  createRandomWallet(_registrationEndpoint: string) {
    return {
      success: true,
      wallet: {
        address: '0xmockaddress',
        privateKey: 'mock-private-key',
      },
    };
  }


  getAlias(address: string) {
    return this.isRegistered(address);
  }
  

  getTokenMetadata(tokenClassKeys: TokenInstanceKeyDto[]) {
    const tokenData = tokenClassKeys.map(token => ({
      ...token,
      image: 'shrek.png',
    }));

    return {
      Status: 1,
      Data: tokenData,
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
          checkTokenEquality(allowance, {
            ...tokenClassKey,
            instance: new BigNumber(0),
          }),
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
        checkTokenEquality(allowance, {
          ...tokenClassKey,
          instance: new BigNumber(0),
        }) &&
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
        .reduce(
          (sum: number, balance: TokenBalance) =>
            sum + Number(balance.quantity),
          0,
        ) ?? 0;

    if (totalQuantity < amount) {
      throw new Error('Insufficient token balance');
    }

    let remainingAmountToDeduct = amount;

    this.tokenBalances[user].forEach((balance: TokenBalance) => {
      if (
        checkTokenEquality(balance, tokenClassKey) &&
        remainingAmountToDeduct > 0
      ) {
        const availableQuantity = Number(balance.quantity);

        if (availableQuantity >= remainingAmountToDeduct) {
          // Deduct the full remaining amount from this balance
          balance.quantity = new BigNumber(
            availableQuantity - remainingAmountToDeduct,
          );
          remainingAmountToDeduct = 0;
        } else {
          // Deduct the available quantity and continue with remaining amount
          balance.quantity = new BigNumber(0);
          remainingAmountToDeduct -= availableQuantity;
        }
      }
    });

    // If amount is still greater than 0, we haven't been able to deduct the full amount, so throw error
    if (remainingAmountToDeduct > 0) {
      throw new Error('Insufficient allowance balance');
    }
  }
}
