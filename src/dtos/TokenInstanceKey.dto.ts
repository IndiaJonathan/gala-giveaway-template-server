import { IsNotEmpty, IsString } from 'class-validator';
import { Transform } from 'class-transformer';
import BigNumber from 'bignumber.js';

export class TokenInstanceKeyDto {
  @IsString()
  collection: string;

  @IsString()
  category: string;

  @IsString()
  type: string;

  @IsString()
  additionalKey: string;

  @IsNotEmpty()
  @Transform(({ value }) => BigNumber(value))
  instance: BigNumber;

}
