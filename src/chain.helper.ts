import { BadRequestException } from '@nestjs/common';
import { getAddress } from 'ethers';
import {
  TokenAllowance,
  TokenClassKey,
  TokenClassKeyProperties,
} from '@gala-chain/api';
import { TokenBalance } from '@gala-chain/connect';
import { TokenInstanceKeyDto } from './dtos/TokenInstanceKey.dto';
import { BigNumber } from 'bignumber.js';

export function checkTokenEquality(
  token1: TokenClassKey | TokenInstanceKeyDto | TokenClassKeyProperties,
  token2: TokenClassKey | TokenInstanceKeyDto | TokenClassKeyProperties,
) {
  const instance1 = 'instance' in token1 ? new BigNumber(token1.instance) : new BigNumber(0);
  const instance2 = 'instance' in token2 ? new BigNumber(token2.instance) : new BigNumber(0);

  return (
    token1.additionalKey === token2.additionalKey &&
    token1.category === token2.category &&
    token1.collection === token2.collection &&
    token1.type === token2.type &&
    instance1.eq(instance2)
  );
}

export function tokenToReadable(
  token: TokenClassKey | TokenInstanceKeyDto | TokenClassKeyProperties,
) {
  if (
    token.collection === 'GALA' &&
    token.category === 'Unit' &&
    token.type === 'none' &&
    token.additionalKey === 'none'
  ) {
    return 'GALA';
  } else {
    return `${token.collection}|${token.category}|${token.type}|${token.additionalKey}`;
  }
}

export const combineAllowances = (allowances: TokenAllowance[]) => {
  const tokenMap: Record<
    string,
    { quantity: BigNumber; unusableQuantity: BigNumber } & {
      collection: string;
      category: string;
      type: string;
      additionalKey: string;
    }
  > = {};
  if (!allowances || allowances.length === 0) {
    return [];
  }
  allowances.forEach((tokenAllowance) => {
    const tokenKey = tokenToReadable(tokenAllowance);

    if (!tokenMap[tokenKey]) {
      tokenMap[tokenKey] = {
        quantity: BigNumber(0),
        unusableQuantity: BigNumber(0),
        collection: tokenAllowance.collection,
        category: tokenAllowance.category,
        type: tokenAllowance.type,
        additionalKey: tokenAllowance.additionalKey,
      };
    }

    const quantityAvailable = BigNumber(tokenAllowance.quantity).minus(
      BigNumber(tokenAllowance.quantitySpent),
    );
    const usesAvailable = BigNumber(tokenAllowance.uses).minus(
      BigNumber(tokenAllowance.usesSpent),
    );

    if (usesAvailable.lt(quantityAvailable)) {
      //Handling it this way to ensure that the available quantity can work with available uses
      tokenMap[tokenKey].quantity =
        tokenMap[tokenKey].quantity.plus(usesAvailable);

      tokenMap[tokenKey].unusableQuantity = tokenMap[
        tokenKey
      ].unusableQuantity.plus(quantityAvailable.minus(usesAvailable));

      //TODO: Handle the full quantity if possible
    } else {
      tokenMap[tokenKey].quantity =
        tokenMap[tokenKey].quantity.plus(quantityAvailable);
    }
  });

  const combinedAllowances = Object.entries(tokenMap).map(
    ([tokenKey, token]) => {
      return {
        ...token,
      };
    },
  );

  return combinedAllowances;
};
