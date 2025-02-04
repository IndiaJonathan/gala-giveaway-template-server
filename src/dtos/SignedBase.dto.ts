import { Allow, IsNotEmpty, IsString, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';
import { DomainDto } from './RegisterWallet.dto';

export class SignedBaseDto {
  @IsNotEmpty()
  @IsString()
  prefix: string;

  @IsNotEmpty()
  @IsString()
  signature: string;

  @IsString()
  @IsNotEmpty()
  uniqueKey: string;

  @ValidateNested()
  @Type(() => DomainDto)
  domain: DomainDto;

  @Allow()
  types: any;
}
