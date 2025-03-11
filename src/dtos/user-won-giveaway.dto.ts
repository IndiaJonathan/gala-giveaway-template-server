import { TokenClassKeyProperties } from '@gala-chain/api';
import { ObjectId } from 'mongodb';
import { GiveawayTokenType } from './giveaway.dto';

/**
 * Interface for the giveaways that a user has won
 * Use this interface in your client code to type the response from the getUserWins endpoint
 */
export interface UserWonGiveawayDto {
  /** Unique identifier of the giveaway */
  _id: string;
  
  /** The token that is being given away */
  giveawayToken: TokenClassKeyProperties;
  
  /** The type of giveaway - FirstComeFirstServe or DistributedGiveaway */
  giveawayType: 'FirstComeFirstServe' | 'DistributedGiveaway';
  
  /** When the giveaway ends/ended */
  endDateTime: string;
  
  /** Whether the giveaway requires Telegram authentication */
  telegramAuthRequired: boolean;
  
  /** The current status of the giveaway */
  giveawayStatus: 'created' | 'pending' | 'completed' | 'cancelled' | 'errored';
  
  /** ID of the creator of the giveaway */
  creator: string;
  
  /** Whether claiming requires burning a token */
  requireBurnTokenToClaim: boolean;
  
  /** The quantity of tokens to burn if requireBurnTokenToClaim is true */
  burnTokenQuantity?: string;
  
  /** The token that needs to be burned if requireBurnTokenToClaim is true */
  burnToken?: TokenClassKeyProperties;
  
  /** The type of token being given (Balance or Allowance) */
  giveawayTokenType: GiveawayTokenType;
  
  /** Maximum number of winners for the giveaway */
  maxWinners: number;
  
  /** Whether the user has completed/claimed their win */
  completed: boolean;

  
  /** For DistributedGiveaway only - the total quantity of tokens being given away */
  tokenQuantity?: string;
  
  /** For FirstComeFirstServe only - how many tokens each user can claim */
  claimPerUser?: number;
} 