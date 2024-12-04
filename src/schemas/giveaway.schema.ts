import { TokenClassKeyProperties } from '@gala-chain/api';
import { Schema, Document } from 'mongoose';
import { ObjectId } from 'mongodb';

export interface Winner {
  gcAddress: string;
  winAmount: string;
}

export interface GiveawayDocument extends Document {
  endDateTime: Date;
  giveawayType: 'FirstComeFirstServe' | 'DistributedGiveway';
  giveawayToken: TokenClassKeyProperties;
  tokenQuantity?: string; // Optional for FCFS
  winners: Winner[];
  claimPerUser?: number; // Required for FCFS
  maxWinners: number;
  usersSignedUp?: string[]; //Required for distributed giveaway
  distributed?: boolean; //distributed only
  creator: ObjectId;
  telegramAuthRequired: boolean;
  error?: string;
  requireBurnTokenToClaim: boolean;
  burnTokenQuantity?: string;
  burnToken?: TokenClassKeyProperties;
}

const WinnerSchema = new Schema<Winner>({
  gcAddress: { type: String, required: true },
  winAmount: { type: String, required: true },
});

export const GiveawaySchema = new Schema<GiveawayDocument>({
  giveawayType: {
    type: String,
    required: true,
    enum: ['FirstComeFirstServe', 'DistributedGiveway'],
  },
  endDateTime: { type: Date, required: true },
  telegramAuthRequired: { type: Boolean, required: false, default: false },
  giveawayToken: {
    collection: { type: String, required: true },
    type: { type: String, required: true },
    category: { type: String, required: true },
    additionalKey: { type: String, required: true },
  },
  error: { type: String, required: false },

  // For Random Giveaway
  tokenQuantity: {
    type: String,
    required: function (this: GiveawayDocument) {
      return this.giveawayType === 'DistributedGiveway';
    },
  },
  winners: {
    type: [WinnerSchema],
    default: [],
    required: true,
  },
  claimPerUser: {
    type: Number,
    required: function (this: GiveawayDocument) {
      return this.giveawayType === 'FirstComeFirstServe';
    },
  },
  maxWinners: {
    type: Number,
    required: true,
  },

  usersSignedUp: {
    type: [String],
    default: function () {
      return this.giveawayType === 'DistributedGiveway' ? [] : undefined;
    },
    validate: {
      validator: function (values: string[]) {
        return values.every((value) => value.startsWith('eth|'));
      },
      message: (props) =>
        `${props.value} is invalid. The address must start with "eth|".`,
    },
    required: function (this: GiveawayDocument) {
      return this.giveawayType === 'DistributedGiveway';
    },
  },
  distributed: {
    type: Boolean,
    default: function () {
      return this.giveawayType === 'DistributedGiveway' ? false : undefined;
    },
  },

  creator: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  requireBurnTokenToClaim: { type: Boolean, required: true },

  burnTokenQuantity: {
    type: String,
    required: function (this: GiveawayDocument) {
      return this.requireBurnTokenToClaim === true;
    },
  },
  burnToken: {
    type: new Schema({
      collection: { type: String, required: true },
      type: { type: String, required: true },
      category: { type: String, required: true },
      additionalKey: { type: String, required: true },
    }),
    required: function (this: GiveawayDocument) {
      return this.requireBurnTokenToClaim === true;
    },
  },
});
