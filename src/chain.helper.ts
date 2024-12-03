import { BadRequestException } from '@nestjs/common';
import { getAddress } from 'ethers';
import { TokenClassKeyProperties } from '@gala-chain/api';
import { TokenInstanceKeyDto } from './dtos/TokenInstanceKey.dto';

export function checksumGCAddress(gcAddress: string) {
  if (!gcAddress.startsWith('eth|')) {
    throw new BadRequestException(
      `GC address currently only supports eth|, but got: ${gcAddress}`,
    );
  }
  const ethAddress = gcAddress.replace('eth|', '0x');
  return getAddress(ethAddress).replace('0x', 'eth|');
}

export function tokenToReadable(
  token: TokenClassKeyProperties | TokenInstanceKeyDto,
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
