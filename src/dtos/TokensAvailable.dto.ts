import { IsEnum, IsNotEmpty, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

import { GiveawayTokenType } from './giveaway.dto';
import { TokenInstanceKeyDto } from './TokenInstanceKey.dto';

export class TokensAvailableDto {
  @ValidateNested()
  @Type(() => TokenInstanceKeyDto)
  tokenInstanceKey: TokenInstanceKeyDto;

  @IsNotEmpty()
  @IsEnum(GiveawayTokenType, {
    message: 'tokenType must be one of: Balance, Allowance',
  })
  tokenType: GiveawayTokenType;
}
