import { TokenClassKeyProperties } from '@gala-chain/api';
import { Schema, Document } from 'mongoose';
import { ObjectId } from 'mongodb';
import { GiveawayTokenType } from '../dtos/giveaway.dto';
import BigNumber from 'bignumber.js';

export enum GiveawayStatus {
  Created = 'created',
  Pending = 'pending',
  Completed = 'completed',
  Cancelled = 'cancelled',
  Errored = 'errored',
}

export interface Winner {
  gcAddress: string;
  winAmount: string;
  completed: boolean;
  error?: string;
}

export interface GiveawayDocument extends Document {
  name: string;
  startDateTime?: Date;
  endDateTime?: Date;
  giveawayType: 'FirstComeFirstServe' | 'DistributedGiveaway';
  giveawayToken: TokenClassKeyProperties & {
    instance: BigNumber;
  };
  winPerUser: string;
  winners: Winner[];
  maxWinners: number;
  usersSignedUp?: string[]; //Only for distributed giveaway
  giveawayStatus: GiveawayStatus;
  creator: ObjectId;
  telegramAuthRequired: boolean;
  giveawayErrors: string[];
  requireBurnTokenToClaim: boolean;
  burnTokenQuantity?: string;
  burnToken?: TokenClassKeyProperties & {
    instance: BigNumber;
  };
  giveawayTokenType: GiveawayTokenType;
}

const WinnerSchema = new Schema<Winner>({
  gcAddress: { type: String, required: true },
  winAmount: { type: String, required: true },
  completed: { type: Boolean, default: false },
  error: { type: String, required: false },
});

export const GiveawaySchema = new Schema<GiveawayDocument>({
  name: { type: String, required: true },
  giveawayType: {
    type: String,
    required: true,
    enum: ['FirstComeFirstServe', 'DistributedGiveaway'],
  },
  startDateTime: { type: Date, required: false, default: Date.now },
  endDateTime: { type: Date, required: false },
  telegramAuthRequired: { type: Boolean, required: false, default: false },
  giveawayToken: {
    collection: { type: String, required: true },
    type: { type: String, required: true },
    category: { type: String, required: true },
    additionalKey: { type: String, required: true },
  },
  giveawayErrors: { type: [String], default: [] },

  // For Random Giveaway
  winPerUser: {
    type: String,
    required: true,
  },
  winners: {
    type: [WinnerSchema],
    default: [],
    required: true,
  },
  maxWinners: {
    type: Number,
    required: true,
  },

  usersSignedUp: {
    type: [String],
    default: function () {
      return this.giveawayType === 'DistributedGiveaway' ? [] : undefined;
    },
    validate: {
      validator: function (values: string[]) {
        return values.every((value) => value.startsWith('eth|'));
      },
      message: (props) =>
        `${props.value} is invalid. The address must start with "eth|".`,
    },
    required: function (this: GiveawayDocument) {
      return this.giveawayType === 'DistributedGiveaway';
    },
  },
  giveawayStatus: {
    type: String,
    enum: Object.values(GiveawayStatus),
    default: GiveawayStatus.Created,
    required: true,
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

  giveawayTokenType: {
    type: String,
    required: true,
    enum: ['Balance', 'Allowance'],
  },
});
