import { Type } from 'class-transformer';
import { ValidateNested, IsArray, IsString, IsNotEmpty } from 'class-validator';
import { BurnTokenQuantityDto } from './BurnTokenQuantity.dto';

export class BurnTokensRequestDto {
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
