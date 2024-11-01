import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumberString,
  Validate,
  IsBoolean,
  ValidateIf,
} from 'class-validator';

export class GiveawayDto {
  @IsNotEmpty()
  giveawayToken: any;

  @IsNotEmpty()
  @IsNumberString()
  tokenQuantity: string;

  @IsNotEmpty()
  @IsBoolean()
  telegramAuthRequired: boolean;

  @IsNotEmpty()
  @IsNumberString()
  winnerCount: string;

  @IsNotEmpty()
  @IsString()
  signature: string;

  @IsOptional()
  @IsString()
  @Validate((value: string) => !isNaN(Date.parse(value)), {
    message: 'endTime must be a valid ISO 8601 date string',
  })
  endDateTime?: string;

  @IsOptional()
  @IsBoolean()
  requireBurnTokenToClaim?: boolean;

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
}
