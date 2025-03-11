import { Document, Schema, model } from 'mongoose';
import { GiveawayDocument } from './giveaway.schema';

export interface WinDocument extends Document {
  giveaway: GiveawayDocument;
  amountWon: number;
  gcAddress: string;
  claimed: boolean;
  claimInfo: string;
}

export const WinSchema = new Schema<WinDocument>({
  giveaway: { type: Schema.Types.ObjectId, ref: 'Giveaway', required: true },
  amountWon: { type: Number, required: true },
  gcAddress: { type: String, required: true },
  claimInfo: { type: String, required: false },
  claimed: { type: Boolean, default: false },
});

export const Win = model<WinDocument>('Win', WinSchema);
