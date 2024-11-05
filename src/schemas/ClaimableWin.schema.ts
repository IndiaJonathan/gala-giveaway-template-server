import { Document, Schema, model } from 'mongoose';
import { GiveawayDocument } from './giveaway.schema';

export interface ClaimableWinDocument extends Document {
  giveaway: GiveawayDocument;
  amountWon: number;
  gcAddress: string;
  claimed: boolean;
  claimInfo: string;
}

export const ClaimableWinSchema = new Schema<ClaimableWinDocument>({
  giveaway: { type: Schema.Types.ObjectId, ref: 'Giveaway', required: true },
  amountWon: { type: Number, required: true },
  gcAddress: { type: String, required: true },
  claimInfo: { type: String, required: false },
  claimed: { type: Boolean, default: false },
});

export const ClaimableWin = model<ClaimableWinDocument>(
  'ClaimableWin',
  ClaimableWinSchema,
);
