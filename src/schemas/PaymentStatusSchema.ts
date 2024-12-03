import { Document, Schema, model } from 'mongoose';
import { GiveawayDocument } from './giveaway.schema';

export interface PaymentStatusDocument extends Document {
  giveaway: GiveawayDocument;
  gcAddress: string;
  burnInfo: string;
  winningInfo: string;
}

export const PaymentStatusSchema = new Schema<PaymentStatusDocument>({
  giveaway: { type: Schema.Types.ObjectId, ref: 'Giveaway', required: true },
  gcAddress: { type: String, required: true },
  burnInfo: { type: String, required: false },
  winningInfo: { type: String, required: false },
});

export const ClaimableWin = model<PaymentStatusDocument>(
  'PaymentStatus',
  PaymentStatusSchema,
);
