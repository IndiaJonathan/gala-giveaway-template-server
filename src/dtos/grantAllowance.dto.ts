// src/dto/giveaway.dto.ts
import {
  IsNotEmpty,
  IsString,
  IsOptional,
  IsNumberString,
  Validate,
} from 'class-validator';

export class GrantAllowanceDto {
  @IsNotEmpty()
  @IsString()
  tokenClass: string;

  @IsNotEmpty()
  @IsNumberString()
  amount: string;

  @IsNotEmpty()
  @IsString()
  signature: string;

  @IsOptional()
  @IsString()
  @Validate((value: string) => !isNaN(Date.parse(value)), {
    message: 'endTime must be a valid ISO 8601 date string',
  })
  endTime?: string;
}
