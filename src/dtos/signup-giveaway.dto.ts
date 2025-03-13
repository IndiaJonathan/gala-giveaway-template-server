// src/dto/giveaway.dto.ts
import { IsNotEmpty, IsString, IsMongoId, Matches } from 'class-validator';
import { SignedPayloadBaseDto } from './SignedPayloadBase.dto';

export class SignupGiveawayDto extends SignedPayloadBaseDto {
  @IsNotEmpty()
  @IsString()
  @IsMongoId()
  giveawayId: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^giveaway-signup.*/)
  uniqueKey: string;
}
