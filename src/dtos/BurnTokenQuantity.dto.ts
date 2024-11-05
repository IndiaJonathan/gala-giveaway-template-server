import { Transform, Type } from 'class-transformer';
import { IsNotEmpty, IsNumberString, ValidateNested } from 'class-validator';
import { TokenInstanceKeyDto } from './TokenInstanceKey.dto';
import BigNumber from 'bignumber.js';

export class BurnTokenQuantityDto {
  @ValidateNested()
  @Type(() => TokenInstanceKeyDto)
  tokenInstanceKey: TokenInstanceKeyDto;

  @IsNotEmpty()
  @Transform(({ value }) => BigNumber(value))
  quantity: BigNumber;
}
