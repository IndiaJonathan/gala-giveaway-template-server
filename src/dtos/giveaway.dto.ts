import { TokenClassBody } from '@gala-chain/api';
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumberString,
  Validate,
} from 'class-validator';

export class GiveawayDto {
  @IsNotEmpty()
  giveawayToken: TokenClassBody;

  @IsNotEmpty()
  @IsNumberString()
  tokenQuantity: string;

  @IsNotEmpty()
  @IsNumberString()
  winners: string;

  @IsNotEmpty()
  @IsString()
  signature: string;

  @IsOptional()
  @IsString()
  @Validate((value: string) => !isNaN(Date.parse(value)), {
    message: 'endTime must be a valid ISO 8601 date string',
  })
  endDateTime?: string;
}
