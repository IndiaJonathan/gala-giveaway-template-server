import { Allow, IsString, Matches, ValidateNested } from 'class-validator';
import { Type } from 'class-transformer';

export class TypeItemDto {
  @IsString()
  name: string;

  @IsString()
  type: string;
}

export class TypesSchemaDto {
  @ValidateNested({ each: true })
  @Type(() => TypeItemDto)
  types: { [key: string]: TypeItemDto[] };
}

export class DomainDto {
  @Matches(/^GalaChain$/)
  name: string;
}

export class PayloadDto {
  @IsString()
  prefix: string;

  @IsString()
  signature: string;

  @IsString()
  @Matches(/^giveaway-public-key.*/)
  uniqueKey: string;

  @ValidateNested()
  @Type(() => DomainDto)
  domain: DomainDto;

  @Allow()
  types: any;
}

export class RegisterWalletDto {
  @IsString()
  @Matches(/^set-giveaway-public-key$/)
  operation: string;

  @ValidateNested()
  @Type(() => PayloadDto)
  payload: PayloadDto;
}
