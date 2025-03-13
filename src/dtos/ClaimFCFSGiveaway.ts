import { Type } from 'class-transformer';
import {
  ValidateNested,
  IsArray,
  IsString,
  IsNotEmpty,
  IsOptional,
} from 'class-validator';
import { BurnTokenQuantityDto } from './BurnTokenQuantity.dto';
import { SignedPayloadBaseDto } from './SignedPayloadBase.dto';

export class ClaimFCFSRequestDTO extends SignedPayloadBaseDto {
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BurnTokenQuantityDto)
  tokenInstances: BurnTokenQuantityDto[];

  @IsString()
  @IsNotEmpty()
  signature: string;

  @IsString()
  @IsNotEmpty()
  giveawayId: string;
}
