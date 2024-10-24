import { TokenClassBody } from '@gala-chain/api';
import { Types, Schema, Document } from 'mongoose';

export interface Winner {
  userId: string;
  winCount: string;
  isDistributed: boolean;
}

export interface GiveawayDocument extends Document {
  endDateTime: Date;
  giveawayToken: TokenClassBody;
  tokenQuantity: string;
  winners: Winner[];
  winnerCount?: number;
  usersSignedUp: string[];
  distributed: boolean;
  creator: Types.ObjectId;
}

const WinnerSchema = new Schema<Winner>({
  userId: { type: String, required: true },
  winCount: { type: String, required: true },
  isDistributed: { type: Boolean, default: false },
});

export const GiveawaySchema = new Schema<GiveawayDocument>({
  endDateTime: { type: Date, required: true },

  giveawayToken: {
    collection: { type: String, required: true },
    type: { type: String, required: true },
    category: { type: String, required: true },
    additionalKey: { type: String, required: true },
  },

  tokenQuantity: { type: String, required: true },

  winners: { type: [WinnerSchema], default: [] },
  winnerCount: { type: Number, required: false },
  usersSignedUp: { type: [String], default: [] },
  distributed: { type: Boolean, default: false },

  creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});
