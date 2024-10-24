import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { GiveawayDocument, Winner } from '../schemas/giveaway.schema';
import { signatures } from '@gala-chain/api';
import { ProfileService } from '../services/profile.service';
import BigNumber from 'bignumber.js';

@Injectable()
export class GiveawayService {
  constructor(
    @InjectModel('Giveaway')
    private readonly giveawayModel: Model<GiveawayDocument>,
    private profileService: ProfileService,
  ) {}

  async createGiveaway(
    publicKey: string,
    giveawayDto: any,
  ): Promise<GiveawayDocument> {
    const gc_address = 'eth|' + signatures.getEthAddress(publicKey);

    const account = await this.profileService.findProfileByGC(gc_address);

    const newGiveaway = new this.giveawayModel({
      endDateTime: new Date(giveawayDto.endDateTime),
      giveawayToken: giveawayDto.giveawayToken,
      tokenQuantity: giveawayDto.tokenQuantity,
      winners: giveawayDto.winners,
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

  determineWinners(
    giveaway: GiveawayDocument,
    maxIterations = 100000,
  ): Winner[] {
    const numWinners = new BigNumber(giveaway.tokenQuantity);
    const usersSignedUp = giveaway.usersSignedUp;
    const numberOfUsers = usersSignedUp.length;
    const winnersMap: { [userId: string]: BigNumber } = {};

    if (usersSignedUp.length === 0) {
      throw new Error('No users signed up for the giveaway.');
    }

    let remainingTokens = numWinners;

    // Calculate the minimum number of tokens each user can win per batch to stay under maxIterations
    const minWinPerIteration = numWinners
      .dividedBy(maxIterations)
      .integerValue(BigNumber.ROUND_FLOOR);

    while (remainingTokens.gt(0)) {
      // Current batch size is the smaller of the remaining tokens or maxIterations
      const currentBatchSize = BigNumber.min(remainingTokens, maxIterations);
      let totalDistributedInBatch = new BigNumber(0);

      // Distribute minimum tokens to users in the current batch
      usersSignedUp.forEach((userId) => {
        if (remainingTokens.gt(0)) {
          const tokensToDistribute = BigNumber.min(
            remainingTokens,
            minWinPerIteration,
          );
          remainingTokens = remainingTokens.minus(tokensToDistribute);

          if (!winnersMap[userId]) {
            winnersMap[userId] = new BigNumber(0);
          }
          winnersMap[userId] = winnersMap[userId].plus(tokensToDistribute);
          totalDistributedInBatch =
            totalDistributedInBatch.plus(tokensToDistribute);
        }
      });

      // Handle any remaining tokens (less than minWinPerIteration) after the batch
      let remainingInBatch = currentBatchSize.minus(totalDistributedInBatch);
      let userIndex = 0;

      while (remainingInBatch.gt(0)) {
        const userId = usersSignedUp[userIndex % numberOfUsers];
        winnersMap[userId] = winnersMap[userId].plus(1);
        remainingInBatch = remainingInBatch.minus(1);
        remainingTokens = remainingTokens.minus(1);
        userIndex++;
      }
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
