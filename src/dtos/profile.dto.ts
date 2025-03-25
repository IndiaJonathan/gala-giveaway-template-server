import { IsString, IsNotEmpty, IsOptional } from 'class-validator';
import { SignedPayloadBaseDto } from './SignedPayloadBase.dto';
import { ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class ProfileDto {
  ethAddress: string;
  galaChainAddress: string;
  telegramId?: string;
  firstName?: string;
  lastName?: string;
  id?: string;
}

import { IsInt, IsBoolean, Min } from 'class-validator';

export class TelegramUserDto {
  @IsInt()
  @Min(0)
  id: number;

  @IsBoolean()
  @IsOptional()
  is_bot?: boolean;

  @IsString()
  first_name: string;

  @IsString()
  username: string;

  @IsOptional()
  @IsString()
  last_name?: string;

  @IsInt()
  @IsNotEmpty()
  @Min(0)
  auth_date: number;

  @IsString()
  @IsNotEmpty()
  hash: string;
}

export class LinkDto extends SignedPayloadBaseDto {
  @IsString()
  @IsNotEmpty()
  signature: string;

  @IsString()
  @IsNotEmpty()
  'GalaChain Address': string;

  @ValidateNested()
  @Type(() => TelegramUserDto)
  @IsNotEmpty()
  'Telegram User': TelegramUserDto;
}
