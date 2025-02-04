// src/dto/giveaway.dto.ts
import { IsNotEmpty, IsString, IsMongoId, Matches } from 'class-validator';
import { SignedBaseDto } from './SignedBase.dto';

export class SignupGiveawayDto extends SignedBaseDto {
  @IsNotEmpty()
  @IsString()
  @IsMongoId()
  giveawayId: string;

  @IsString()
  @IsNotEmpty()
  @Matches(/^giveaway-signup.*/)
  uniqueKey: string;
}
