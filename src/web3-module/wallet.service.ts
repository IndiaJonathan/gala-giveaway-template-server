import { Inject, Injectable } from '@nestjs/common';
import { TokenAllowance, TokenClassKeyProperties } from '@gala-chain/api';
import BigNumber from 'bignumber.js';
import { ObjectId } from 'mongodb';
import { GalachainApi } from '../web3-module/galachain.api';

@Injectable()
export class WalletService {
  constructor(@Inject(GalachainApi) private galachainApi: GalachainApi) {}

  async getAllowanceQuantity(
    giveawayWalletAddress: string,
    ownerId: ObjectId,
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

        if (quantityAvailable < usesAvailable) {
          //Handling it this way to ensure that the available quantity can work with available uses
          const useableQuantity = quantityAvailable.minus(usesAvailable);
          totalQuantity = totalQuantity.plus(useableQuantity);

          unusableQuantity = unusableQuantity.plus(
            quantityAvailable.minus(useableQuantity),
          );

          //TODO: Handle the full quantity if possible
        } else {
          totalQuantity = totalQuantity.plus(quantityAvailable);
        }
      });
    }

    return { totalQuantity, unusableQuantity };
  }

  async getBalanceQuantity(
    giveawayWalletAddress: string,
    ownerId: ObjectId,
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

        if (quantityAvailable < usesAvailable) {
          //Handling it this way to ensure that the available quantity can work with available uses
          const useableQuantity = quantityAvailable.minus(usesAvailable);
          totalQuantity = totalQuantity.plus(useableQuantity);

          unusableQuantity = unusableQuantity.plus(
            quantityAvailable.minus(useableQuantity),
          );

          //TODO: Handle the full quantity if possible
        } else {
          totalQuantity = totalQuantity.plus(quantityAvailable);
        }
      });
    }

    return totalQuantity;
  }
}
