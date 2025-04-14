import { BigNumber } from 'bignumber.js';

import {
  BasicGiveawaySettingsDto,
  GiveawayTokenType,
} from '../dtos/giveaway.dto';
import { GiveawayDocument } from '../schemas/giveaway.schema';
import { BadRequestException } from '@nestjs/common';
import { ObjectId } from 'mongodb';
import { TokenClassKeyProperties } from '@gala-chain/api';

export function getNetAvailableTokenQuantity(
  giveawayWalletAddress: string,
  ownerId: ObjectId,
  tokenClassKey: TokenClassKeyProperties,
  giveawayTokenType: GiveawayTokenType,
  unDistributedGiveaways: GiveawayDocument[],
  totalQuantity: BigNumber,
) {



  unDistributedGiveaways
    .filter((giveaway) => giveaway.giveawayTokenType === giveawayTokenType)
    .forEach((giveaway) => {
      switch (giveaway.giveawayType) {
        case 'DistributedGiveaway':
          totalQuantity = BigNumber(totalQuantity).minus(
            new BigNumber(giveaway.winPerUser).multipliedBy(
              giveaway.maxWinners,
            ),
          );
          break;
        case 'FirstComeFirstServe':
          // Calculate remaining tokens to reserve based on remaining potential winners
          const claimedWinners = giveaway.winners ? giveaway.winners.length : 0;
          const remainingWinners = Math.max(
            0,
            giveaway.maxWinners - claimedWinners,
          );

          totalQuantity = BigNumber(totalQuantity).minus(
            new BigNumber(remainingWinners).multipliedBy(giveaway.winPerUser),
          );
      }
    });

  return totalQuantity;
}

export function getRequiredTokensForGiveaway(
  giveaway: GiveawayDocument | BasicGiveawaySettingsDto,
) {
  switch (giveaway.giveawayType) {
    case 'FirstComeFirstServe':
      // For FCFS, we need to calculate based on remaining claims
      if (
        'winners' in giveaway &&
        giveaway.winners &&
        giveaway.winners.length
      ) {
        // Calculate remaining tokens to reserve based on remaining potential winners
        const claimedWinners = giveaway.winners.length;
        const remainingWinners = Math.max(
          0,
          giveaway.maxWinners - claimedWinners,
        );
        return new BigNumber(giveaway.winPerUser).multipliedBy(
          remainingWinners,
        );
      }
      // If no winners yet or not a GiveawayDocument, return the full amount
      return new BigNumber(giveaway.winPerUser).multipliedBy(
        giveaway.maxWinners,
      );
    case 'DistributedGiveaway':
      return new BigNumber(giveaway.winPerUser).multipliedBy(
        giveaway.maxWinners,
      );
    default:
      throw new BadRequestException('Unsupported giveaway type');
  }
}
