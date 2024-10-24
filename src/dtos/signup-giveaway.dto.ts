// src/dto/giveaway.dto.ts
import { IsNotEmpty, IsString, IsMongoId } from 'class-validator';

export class SignupGiveawayDto {
  @IsNotEmpty()
  @IsString()
  @IsMongoId()
  giveawayId: string;

  @IsNotEmpty()
  @IsString()
  signature: string;
}
