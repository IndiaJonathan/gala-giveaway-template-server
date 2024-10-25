import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
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
      telegramAuthRequired: giveawayDto.telegramAuthRequired,
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
      const winnerGcAddress = usersSignedUp[randomIndex];

      const tokensToDistribute = BigNumber.min(
        remainingTokens,
        minWinPerIteration,
      );
      remainingTokens = remainingTokens.minus(tokensToDistribute);

      if (!winnersMap[winnerGcAddress]) {
        winnersMap[winnerGcAddress] = new BigNumber(0);
      }
      winnersMap[winnerGcAddress] =
        winnersMap[winnerGcAddress].plus(tokensToDistribute);
    }
    // Convert the winnersMap to an array of Winner objects
    const winnersArray: Winner[] = Object.entries(winnersMap).map(
      ([gcAddress, winCount]) => ({
        gcAddress,
        winAmount: winCount.toString(),
        isDistributed: false,
      }),
    );

    return winnersArray;
  }

  async signupUser(giveawayId: string, gcAddress: string): Promise<any> {
    if (!gcAddress.startsWith('eth|'))
      throw new BadRequestException(
        'GC Address must start with eth|, any others are unsupported at the moment.',
      );
    const giveaway = await this.giveawayModel.findById(giveawayId).exec();

    if (!giveaway) {
      throw new NotFoundException('Giveaway not found');
    }

    if (giveaway.usersSignedUp.includes(gcAddress)) {
      throw new BadRequestException(`You're already signed up!`);
    }

    if (giveaway.telegramAuthRequired) {
      const getProfile = await this.profileService.findProfileByGC(
        gcAddress,
        true,
      );
      if (giveaway.telegramAuthRequired && !getProfile.telegramId) {
        throw new BadRequestException(
          'You must link your telegram account for this giveaway',
        );
      }
    }

    giveaway.usersSignedUp.push(gcAddress);
    await giveaway.save();

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

    const result = await this.giveawayModel
      .findOne({
        _id: giveawayId,
        endDateTime: { $gt: currentDate },
      })
      .exec();

    if (!result) {
      throw new NotFoundException(
        `Giveaway ${giveawayId} is not active or not found`,
      );
    }
  }
}
