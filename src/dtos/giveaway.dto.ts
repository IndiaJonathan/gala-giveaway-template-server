import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumberString,
  Validate,
  IsBoolean,
  ValidateIf,
  IsNumber,
} from 'class-validator';

// Base DTO for shared properties
export class BasicGiveawaySettingsDto {
  @IsNotEmpty()
  giveawayToken: any;

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
  maxWinners?: number;

  @IsNotEmpty()
  @IsNumberString()
  winners: string;
}

export class FirstComeFirstServeGiveawaySettingsDto extends BasicGiveawaySettingsDto {
  @IsNumberString()
  @IsNotEmpty()
  claimPerUser?: string;

  @IsString()
  @IsNotEmpty()
  giveawayType: 'FirstComeFirstServe';
}

export class RandomGiveawaySettingsDto extends BasicGiveawaySettingsDto {
  @IsNotEmpty()
  @IsNumberString()
  tokenQuantity: string;

  @IsNotEmpty()
  @IsString()
  giveawayType: 'DistributedGiveway';
}

export type GiveawayDto =
  | FirstComeFirstServeGiveawaySettingsDto
  | RandomGiveawaySettingsDto;
