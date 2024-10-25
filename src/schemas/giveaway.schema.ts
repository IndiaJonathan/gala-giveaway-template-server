import {
  GalaChainResponse,
  TokenClassBody,
  TokenInstanceKey,
  TokenInstanceKeyBody,
} from '@gala-chain/api';
import { Schema, Document, ObjectId } from 'mongoose';
import { MAX_ITERATIONS } from '../constant';

export interface Winner {
  gcAddress: string;
  winAmount: string;
  isDistributed: boolean;
  error?: string;
}

export interface GiveawayDocument extends Document {
  endDateTime: Date;
  givewayType: string;
  giveawayToken: TokenClassBody;
  tokenQuantity: string;
  winners: Winner[];
  winnerCount?: number;
  usersSignedUp: string[];
  distributed: boolean;
  creator: ObjectId;
  telegramAuthRequired: boolean;
}

const WinnerSchema = new Schema<Winner>({
  gcAddress: { type: String, required: true },
  winAmount: { type: String, required: true },
  isDistributed: { type: Boolean, default: false },
  error: { type: String, required: false },
});

export const GiveawaySchema = new Schema<GiveawayDocument>({
  givewayType: {
    type: String,
    required: false,
    enum: ['randomized_iterative_giveway'],
    default: 'randomized_iterative_giveway',
  },
  endDateTime: { type: Date, required: true },
  telegramAuthRequired: { type: Boolean, required: false, default: false },
  giveawayToken: {
    collection: { type: String, required: true },
    type: { type: String, required: true },
    category: { type: String, required: true },
    additionalKey: { type: String, required: true },
  },

  tokenQuantity: { type: String, required: true },

  winners: { type: [WinnerSchema], default: [] },
  winnerCount: {
    type: Number,
    required: false,
    max: MAX_ITERATIONS,
    validate: {
      validator: Number.isInteger,
      message: '{VALUE} is not an integer value',
    },
  },
  usersSignedUp: {
    type: [String],
    default: [],
    validate: {
      validator: function (values: string[]) {
        return values.every((value) => value.startsWith('eth|'));
      },
      message: (props) =>
        `${props.value} is invalid. The address must start with "eth|".`,
    },
  },
  distributed: { type: Boolean, default: false },

  creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
});
