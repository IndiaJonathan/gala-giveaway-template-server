import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumberString,
  Validate,
  IsBoolean,
  ValidateIf,
  IsNumber,
  IsEnum,
  Matches,
} from 'class-validator';
import { NoBadWords } from '../validators/no-bad-words.validator';
import { SignedPayloadBaseDto } from './SignedPayloadBase.dto';

export enum GiveawayTokenType {
  BALANCE = 'Balance',
  ALLOWANCE = 'Allowance',
}

export enum GiveawayType {
  FirstComeFirstServe = 'FirstComeFirstServe',
  DistributedGiveaway = 'DistributedGiveaway',
}

// Base DTO for shared properties
export class BasicGiveawaySettingsDto extends SignedPayloadBaseDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^giveaway-start.*/)
  uniqueKey: string;

  @IsNotEmpty()
  @IsString()
  @NoBadWords({ message: 'Giveaway name contains inappropriate language' })
  @Matches(/^[a-zA-Z0-9 ]+$/, {
    message:
      'Giveaway name must contain only alphanumeric characters and spaces',
  })
  name: string;

  @IsNotEmpty()
  giveawayToken: any;

  @IsOptional()
  @Validate((value: string) => !isNaN(Date.parse(value)), {
    message: 'startDateTime must be a valid ISO 8601 date string',
  })
  @IsString()
  startDateTime?: string;

  @IsOptional()
  @Validate((value: string) => !isNaN(Date.parse(value)), {
    message: 'endDateTime must be a valid ISO 8601 date string',
  })
  @IsString()
  endDateTime?: string;

  @IsOptional()
  @IsBoolean()
  telegramAuthRequired?: boolean;

  @IsNotEmpty()
  @IsBoolean()
  requireBurnTokenToClaim: boolean;

  @IsNotEmpty()
  @IsString()
  signature: string;

  @ValidateIf((o) => o.requireBurnTokenToClaim === true)
  @IsNotEmpty({
    message:
      'burnTokenQuantity is required when requireBurnTokenToClaim is true',
  })
  @IsNumberString()
  burnTokenQuantity?: string;

  @ValidateIf((o) => o.requireBurnTokenToClaim === true)
  @IsNotEmpty({
    message: 'burnToken is required when requireBurnTokenToClaim is true',
  })
  burnToken?: any;

  @IsNumberString()
  @IsNotEmpty()
  maxWinners: number;

  @IsNotEmpty()
  @IsEnum(GiveawayTokenType, {
    message: 'GiveawayTokenType must be one of: Balance, Allowance',
  })
  giveawayTokenType: GiveawayTokenType;

  @IsNumberString()
  @IsNotEmpty()
  winPerUser?: string;

  @IsNotEmpty()
  @IsEnum(GiveawayType, { message: 'giveawayType is required' })
  giveawayType: GiveawayType;
}
