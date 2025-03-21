import { Document, Schema, model } from 'mongoose';
import { GiveawayDocument } from './giveaway.schema';

export interface WinDocument extends Document {
  giveaway: GiveawayDocument;
  amountWon: string;
  gcAddress: string;
  claimed: boolean;
  claimInfo: string;
  burnInfo: string;
  winningInfo: string;
  paymentSent: Date;
  giveawayType: string; // 'FirstComeFirstServe' or 'DistributedGiveaway'
}

export const WinSchema = new Schema<WinDocument>({
  giveaway: { type: Schema.Types.ObjectId, ref: 'Giveaway', required: true },
  amountWon: { type: String, required: true },
  gcAddress: { type: String, required: true },
  claimInfo: { type: String, required: false },
  claimed: { type: Boolean, default: false },
  burnInfo: { type: String, required: false },
  winningInfo: { type: String, required: false },
  paymentSent: { type: Date, required: false },
  giveawayType: { type: String, required: true },
});

export const Win = model<WinDocument>('Win', WinSchema);
