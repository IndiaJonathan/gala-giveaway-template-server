import { Schema, Document, Model, model, Types } from 'mongoose';
import { GiveawayDocument } from './giveaway.schema';
import { ProfileDocument } from './ProfileSchema';

export interface ClaimableWinDocument extends Document {
  giveaway: Types.ObjectId | GiveawayDocument; // Reference to the Giveaway document
  amountWon: number;
  user: Types.ObjectId | ProfileDocument; // Reference to the Profile document
}
export const ClaimableWinSchema = new Schema<ClaimableWinDocument>({
  giveaway: { type: Schema.Types.ObjectId, ref: 'Giveaway', required: true },
  amountWon: { type: Number, required: true },
  user: { type: Schema.Types.ObjectId, ref: 'Profile', required: true },
});

export const ClaimableWinModel: Model<ClaimableWinDocument> =
  model<ClaimableWinDocument>('ClaimableWin', ClaimableWinSchema);
