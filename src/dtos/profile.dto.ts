import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class ProfileDto {
  ethAddress: string;
  galaChainAddress: string;
  telegramId?: string;
  firstName?: string;
  lastName?: string;
  id?: string;
}

export class LinkDto {
  @IsString()
  @IsNotEmpty()
  signature: string;

  @IsString()
  @IsNotEmpty()
  'GalaChain Address': string;

  @IsString()
  @IsOptional()
  id: string;

  @IsString()
  @IsNotEmpty()
  firstName: string;

  @IsString()
  @IsOptional()
  lastName: string;
}
