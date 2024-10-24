import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';

export class ProfileDto {
  ethAddress: string;
  galaChainAddress: string;
  telegramId?: string;
  first_name?: string;
  last_name?: string;
  id?: string;
}

export class LinkDto {
  @IsString()
  @IsNotEmpty()
  signature: string;

  @IsString()
  @IsNotEmpty()
  'GalaChain Address': string;

  @IsNumber()
  @IsOptional()
  id: string;

  @IsString()
  @IsNotEmpty()
  first_name: string;

  @IsString()
  @IsOptional()
  last_name: string;
}
