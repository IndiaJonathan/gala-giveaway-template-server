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
} from 'class-validator';
import { NoBadWords } from '../validators/no-bad-words.validator';

export enum GiveawayTokenType {
  BALANCE = 'Balance',
  ALLOWANCE = 'Allowance',
}
// Base DTO for shared properties
export class BasicGiveawaySettingsDto {
  @IsNotEmpty()
  @IsString()
  @NoBadWords({ message: 'Giveaway name contains inappropriate language' })
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

  @IsNumber()
  @IsNotEmpty()
  maxWinners: number;

  @IsNotEmpty()
  @IsEnum(GiveawayTokenType, {
    message: 'GiveawayTokenType must be one of: Balance, Allowance',
  })
  giveawayTokenType: GiveawayTokenType;
}

export class FirstComeFirstServeGiveawaySettingsDto extends BasicGiveawaySettingsDto {
  @IsNumberString()
  @IsNotEmpty()
  winPerUser?: string;

  @IsString()
  @IsNotEmpty()
  giveawayType: 'FirstComeFirstServe';
}

export class RandomGiveawaySettingsDto extends BasicGiveawaySettingsDto {
  @IsNotEmpty()
  @IsNumberString()
  winPerUser: string;

  @IsNotEmpty()
  @IsString()
  giveawayType: 'DistributedGiveaway';
}

export type GiveawayDto =
  | FirstComeFirstServeGiveawaySettingsDto
  | RandomGiveawaySettingsDto;
