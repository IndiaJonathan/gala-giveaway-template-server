import { Inject, Injectable } from '@nestjs/common';
import { TokenAllowance, TokenClassKeyProperties } from '@gala-chain/api';
import BigNumber from 'bignumber.js';
import { GalachainApi } from '../web3-module/galachain.api';
import { TokenBalance } from '@gala-chain/connect';

@Injectable()
export class WalletService {
  constructor(@Inject(GalachainApi) private galachainApi: GalachainApi) {}

  async getAllowanceQuantity(
    giveawayWalletAddress: string,
    tokenClassKey: TokenClassKeyProperties,
  ) {
    const allowances = await this.galachainApi.getAllowancesForToken(
      giveawayWalletAddress,
      tokenClassKey,
    );

    let totalQuantity = BigNumber(0);
    let unusableQuantity = BigNumber(0);
    if ((allowances as any).Data) {
      //Seems like local wants results, but stage/prod don't
      //TODO: look into this
      const allowanceData =
        (allowances as any).Data?.results || allowances.Data;
      (allowanceData as TokenAllowance[]).forEach((tokenAllowance) => {
        const quantityAvailable = BigNumber(tokenAllowance.quantity).minus(
          BigNumber(tokenAllowance.quantitySpent),
        );
        const usesAvailable = BigNumber(tokenAllowance.uses).minus(
          BigNumber(tokenAllowance.usesSpent),
        );

        if (usesAvailable < quantityAvailable) {
          //Handling it this way to ensure that the available quantity can work with available uses
          totalQuantity = totalQuantity.plus(usesAvailable);

          unusableQuantity = unusableQuantity.plus(
            quantityAvailable.minus(usesAvailable),
          );

          //TODO: Handle the full quantity if possible
        } else {
          totalQuantity = totalQuantity.plus(quantityAvailable);
        }
      });
    }

    return totalQuantity;
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
