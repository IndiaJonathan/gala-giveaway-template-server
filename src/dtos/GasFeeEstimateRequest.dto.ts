import { IsEnum, IsNotEmpty, IsNumber, IsString } from 'class-validator';
import { GiveawayTokenType } from './giveaway.dto';

export class GasFeeEstimateRequestDto {
  @IsString()
  @IsNotEmpty()
  giveawayType: 'FirstComeFirstServe' | 'DistributedGiveaway';

  @IsNumber()
  @IsNotEmpty()
  maxWinners: number;

  @IsNotEmpty()
  @IsEnum(GiveawayTokenType, {
    message: 'GiveawayTokenType must be one of: Balance, Allowance',
  })
  giveawayTokenType: GiveawayTokenType;
}
