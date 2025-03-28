import { Type } from 'class-transformer';
import { ValidateNested, IsArray, IsString, IsNotEmpty } from 'class-validator';
import { BurnTokenQuantityDto } from './BurnTokenQuantity.dto';
import { SignedPayloadBaseDto } from './SignedPayloadBase.dto';

export class BurnTokensRequestDto extends SignedPayloadBaseDto {
  @IsString()
  @IsNotEmpty()
  uniqueKey: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BurnTokenQuantityDto)
  tokenInstances: BurnTokenQuantityDto[];

  @IsString()
  @IsNotEmpty()
  signature: string;

  @IsString()
  @IsNotEmpty()
  claimId: string;
}
