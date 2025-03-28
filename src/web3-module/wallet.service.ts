import { Inject, Injectable } from '@nestjs/common';
import { TokenAllowance, TokenClassKeyProperties } from '@gala-chain/api';
import BigNumber from 'bignumber.js';
import { GalachainApi } from '../web3-module/galachain.api';
import { TokenBalance } from '@gala-chain/connect';
import { combineAllowances } from '../chain.helper';

@Injectable()
export class WalletService {
  constructor(@Inject(GalachainApi) private galachainApi: GalachainApi) {}

  async getAllAllowances(giveawayWalletAddress: string) {
    const allowances = await this.galachainApi.getAllowances(
      giveawayWalletAddress,
    );

    return allowances;
  }
  async getAllowanceQuantity(
    giveawayWalletAddress: string,
    tokenClassKey: TokenClassKeyProperties,
  ) {
    const allowances = await this.galachainApi.getAllowances(
      giveawayWalletAddress,
      tokenClassKey,
    );

    const allowance = allowances.find(
      (allowance) =>
        allowance.collection === tokenClassKey.collection &&
        allowance.category === tokenClassKey.category &&
        allowance.type === tokenClassKey.type &&
        allowance.additionalKey === tokenClassKey.additionalKey,
    );
    if (!allowance) {
      return BigNumber(0);
    }
    return allowance.quantity;
  }

  async getBalanceQuantity(
    giveawayWalletAddress: string,
    tokenClassKey: TokenClassKeyProperties,
  ) {
    const balances = await this.galachainApi.getBalancesForToken(
      giveawayWalletAddress,
      { ...tokenClassKey, instance: '0' as any },
    );

    let totalQuantity = BigNumber(0);
    if ((balances as any).Data) {
      //Seems like local wants results, but stage/prod don't
      //TODO: look into this
      //TODO: Handle locks
      const balanceData = (balances as any).Data?.results || balances.Data;
      (balanceData as TokenBalance[]).forEach((tokenBalance) => {
        totalQuantity = totalQuantity.plus(tokenBalance.quantity);
      });
    }

    return totalQuantity;
  }
}
