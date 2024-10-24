import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { GiveawayDocument, Winner } from '../schemas/giveaway.schema';
import { signatures } from '@gala-chain/api';
import { ProfileService } from '../services/profile.service';
import BigNumber from 'bignumber.js';
import { GiveawayDto } from '../dtos/giveaway.dto';
import { MAX_ITERATIONS as MAX_WINNERS } from '../constant';

@Injectable()
export class GiveawayService {
  constructor(
    @InjectModel('Giveaway')
    private readonly giveawayModel: Model<GiveawayDocument>,
    private profileService: ProfileService,
  ) {}

  async createGiveaway(
    publicKey: string,
    giveawayDto: GiveawayDto,
  ): Promise<GiveawayDocument> {
    const gc_address = 'eth|' + signatures.getEthAddress(publicKey);

    const account = await this.profileService.findProfileByGC(gc_address);

    const newGiveaway = new this.giveawayModel({
      endDateTime: new Date(giveawayDto.endDateTime),
      giveawayToken: giveawayDto.giveawayToken,
      tokenQuantity: giveawayDto.tokenQuantity,
      winnerCount: giveawayDto.winnerCount,
      creator: account.id,
    });
    return await newGiveaway.save();
  }

  async findAll(): Promise<GiveawayDocument[]> {
    return this.giveawayModel.find().exec();
  }

  async findUndistributed(creator: ObjectId): Promise<GiveawayDocument[]> {
    return this.giveawayModel.find({ creator, distributed: false }).exec();
  }
  async findReadyForDistribution(): Promise<GiveawayDocument[]> {
    const currentDate = new Date();
    return this.giveawayModel
      .find({ distributed: false, endDateTime: { $lt: currentDate } })
      .exec();
  }

  determineWinners(giveaway: GiveawayDocument): Winner[] {
    const usersSignedUp = giveaway.usersSignedUp;
    const numberOfUsers = usersSignedUp.length;
    const winnersMap: { [userId: string]: BigNumber } = {};
    const iterations = Math.min(
      MAX_WINNERS,
      giveaway.winnerCount || MAX_WINNERS,
    );

    if (usersSignedUp.length === 0) {
      throw new Error('No users signed up for the giveaway.');
    }

    let remainingTokens = new BigNumber(giveaway.tokenQuantity);

    let minWinPerIteration = new BigNumber(1);
    if (remainingTokens.gt(iterations)) {
      minWinPerIteration = remainingTokens
        .dividedBy(iterations)
        .integerValue(BigNumber.ROUND_FLOOR); // Round down to ensure we don't exceed the number of tokens
    }

    while (remainingTokens.gt(0)) {
      // Distribute minimum tokens to users
      const randomIndex = Math.floor(Math.random() * numberOfUsers);
      const winnerId = usersSignedUp[randomIndex];

      const tokensToDistribute = BigNumber.min(
        remainingTokens,
        minWinPerIteration,
      );
      remainingTokens = remainingTokens.minus(tokensToDistribute);

      if (!winnersMap[winnerId]) {
        winnersMap[winnerId] = new BigNumber(0);
      }
      winnersMap[winnerId] = winnersMap[winnerId].plus(tokensToDistribute);
    }
    // Convert the winnersMap to an array of Winner objects
    const winnersArray: Winner[] = Object.entries(winnersMap).map(
      ([userId, winCount]) => ({
        userId,
        winCount: winCount.toString(),
        isDistributed: false,
      }),
    );

    return winnersArray;
  }

  async signupUser(giveawayId: string, gcAddress: string): Promise<any> {
    const giveaway = await this.giveawayModel
      .findByIdAndUpdate(
        giveawayId,
        { $addToSet: { usersSignedUp: gcAddress } },
        { new: true },
      )
      .exec();

    if (!giveaway) {
      throw new NotFoundException('Giveaway not found');
    }

    return {
      message: `User with address ${gcAddress} successfully signed up for giveaway ${giveawayId}`,
    };
  }

  async getAllActiveGiveaways(): Promise<GiveawayDocument[]> {
    const currentDate = new Date();
    return this.giveawayModel
      .find({ endDateTime: { $gt: currentDate } })
      .exec();
  }

  async validateGiveawayIsActive(giveawayId: string): Promise<void> {
    const currentDate = new Date();

    const giveaway = await this.giveawayModel
      .findOne({
        _id: giveawayId,
        endDateTime: { $gt: currentDate },
      })
      .exec();

    if (!giveaway) {
      throw new NotFoundException(
        `Giveaway ${giveawayId} is not active or not found`,
      );
    }
  }
}
