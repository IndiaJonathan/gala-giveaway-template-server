// src/services/token.service.ts
import { Injectable } from '@nestjs/common';
import { TokenApi, SigningClient, WalletUtils } from '@gala-chain/connect';
import {
  createValidDTO,
  FetchAllowancesDto,
  FetchBalancesDto,
  TokenAllowanceBody,
  TokenClassBody,
} from '@gala-chain/api';
import BigNumber from 'bignumber.js';
import { GiveawayService } from '../giveway-module/giveaway.service';
import { ObjectId } from 'mongoose';

@Injectable()
export class BabyOpsApi {
  private adminSigner: SigningClient;
  private tokenApiEndpoint: string;

  constructor(private giveawayService: GiveawayService) {}
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

  async getTotalAllowanceQuantity(
    giveawayWalletAddress: string,
    ownerId: ObjectId,
    tokenClassKey: TokenClassBody,
  ) {
    const allowances = await this.getAllowancesForToken(
      giveawayWalletAddress,
      tokenClassKey,
    );

    let totalQuantity = BigNumber(0);
    let unusableQuantity = BigNumber(0);
    ((allowances as any).Data.results as TokenAllowanceBody[]).forEach(
      (tokenAllowance) => {
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
      },
    );

    const undistributedGiveways =
      await this.giveawayService.findUndistributed(ownerId);

    undistributedGiveways.forEach((giveaway) => {
      totalQuantity = BigNumber(totalQuantity).minus(giveaway.tokenQuantity);
    });

    return { totalQuantity, unusableQuantity };
  }

  async getAllowancesForToken(
    ownerAddress: string,
    tokenClassKey: TokenClassBody,
  ) {
    const tokenApi = new TokenApi(this.tokenApiEndpoint, this.adminSigner);
    const fetchAllowanceDto = await createValidDTO<FetchAllowancesDto>(
      FetchAllowancesDto,
      {
        grantedTo: ownerAddress,
        ...tokenClassKey,
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
