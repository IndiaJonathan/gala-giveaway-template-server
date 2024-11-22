import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, ObjectId } from 'mongoose';
import { GiveawayDocument, Winner } from '../schemas/giveaway.schema';
import { signatures, TokenClassKeyProperties } from '@gala-chain/api';
import { ProfileService } from '../services/profile.service';
import BigNumber from 'bignumber.js';
import { GiveawayDto } from '../dtos/giveaway.dto';
import { MAX_ITERATIONS as MAX_WINNERS } from '../constant';
import { ClaimableWinDocument } from '../schemas/ClaimableWin.schema';
import { APP_SECRETS } from '../secrets/secrets.module';
import {
  GalaChainBaseApi,
  PresignedClient,
  SigningClient,
  TokenApi,
} from '@gala-chain/connect';

@Injectable()
export class GiveawayService {
  constructor(
    @InjectModel('Giveaway')
    private readonly giveawayModel: Model<GiveawayDocument>,
    @InjectModel('ClaimableWin')
    private readonly claimableWinModel: Model<ClaimableWinDocument>,
    private profileService: ProfileService,
    @Inject(APP_SECRETS) private secrets: Record<string, any>,
  ) {}

  async createGiveaway(
    publicKey: string,
    giveawayDto: GiveawayDto,
  ): Promise<GiveawayDocument> {
    const gc_address = 'eth|' + signatures.getEthAddress(publicKey);

    const account = await this.profileService.findProfileByGC(gc_address);

    const newGiveaway = new this.giveawayModel({...giveawayDto, c);

    return await newGiveaway.save();
  }

  async findAll(): Promise<GiveawayDocument[]> {
    return this.giveawayModel.find().exec();
  }

  async getGiveawayEstimatedFee(
    gcAddress: string,
    tokenClass: TokenClassKeyProperties,
  ) {
    const creatorProfile = await this.profileService.findProfileByGC(gcAddress);
    const tokenApiEndpoint = this.secrets['TOKEN_API_ENDPOINT'];
    const signer = new PresignedClient();
    const api = new GalaChainBaseApi(tokenApiEndpoint, signer);
    const dryRunResult = await api.DryRun({
      method: 'BatchMintToken',
      callerPublicKey: creatorProfile.giveawayWalletPublicKey,
      dto: {
        mintDtos: [
          {
            owner: gcAddress,
            quantity: '1',
            tokenClass: { ...tokenClass, instance: 0 },
          },
        ],
      } as any,
    });
    return dryRunResult;
  }

  // Only returns relevant data to make the request smaller
  async getGiveaways(gcAddress: string): Promise<any[]> {
    const giveaways = await this.giveawayModel.find().lean().exec();

    return giveaways.map((giveaway) => {
      // Get the list of winner addresses
      const winnerAddresses = giveaway.winners.map(
        (winner: { gcAddress: string }) => winner.gcAddress,
      );

      // Determine if the gcAddress is in the list of winners
      const isWinner = winnerAddresses.includes(gcAddress);

      // Extract winnerCount
      const { winnerCount } = giveaway;

      // Remove the 'winners' field
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { winners, ...rest } = giveaway;

      // Return the modified giveaway object
      return {
        ...rest,
        isWinner,
        winnerCount,
      };
    });
  }

  async findUndistributed(
    creator: ObjectId,
    tokenClass: TokenClassKeyProperties,
  ): Promise<GiveawayDocument[]> {
    return this.giveawayModel
      .find({
        creator,
        distributed: false,
        'giveawayToken.collection': tokenClass.collection,
        'giveawayToken.category': tokenClass.category,
        'giveawayToken.type': tokenClass.type,
        'giveawayToken.additionalKey': tokenClass.additionalKey,
      })
      .exec();
  }
  async findReadyForDistribution(): Promise<GiveawayDocument[]> {
    const currentDate = new Date();
    return this.giveawayModel
      .find({ distributed: false, endDateTime: { $lt: currentDate } })
      .exec();
  }

  async getClaimableWin(claimableWinId: string) {
    const claimableWin = await this.claimableWinModel
      .findById(claimableWinId)
      .populate('giveaway')
      .exec();
    return claimableWin;
  }

  async getClaimableWins(gcAddress: string) {
    return this.claimableWinModel.aggregate([
      {
        $match: { gcAddress, claimed: { $ne: true } },
      },
      {
        $lookup: {
          from: 'giveaways',
          localField: 'giveaway',
          foreignField: '_id',
          as: 'giveawayDetails',
        },
      },
      {
        $unwind: '$giveawayDetails',
      },
      {
        $project: {
          gcAddress: 1,
          amountWon: 1,
          giveawayToken: '$giveawayDetails.giveawayToken',
          burnToken: '$giveawayDetails.burnToken',
          burnTokenQuantity: '$giveawayDetails.burnTokenQuantity',
        },
      },
    ]);
  }

  async createWinClaimsFromWinners(giveawayId: ObjectId, winners: Winner[]) {
    const claimableWins = winners.map(
      (winner) =>
        new this.claimableWinModel({
          giveaway: giveawayId,
          amountWon: winner.winAmount,
          gcAddress: winner.gcAddress,
        }),
    );
    try {
      await Promise.all(claimableWins.map((win) => win.save()));
    } catch (error) {
      console.error('Error saving claimable wins:', error);
      throw error;
    }
  }

  async sendWinnings(
    creator: ObjectId,
    claimableWin: ClaimableWinDocument,
    giveaway: GiveawayDocument,
  ) {
    const tokenApiEndpoint = this.secrets['TOKEN_API_ENDPOINT'];
    const encryptionKey = this.secrets['ENCRYPTION_KEY'];

    const creatorProfile = await this.profileService.findProfile(creator);
    const decryptedKey = await creatorProfile.decryptPrivateKey(encryptionKey);
    const giveawayWalletSigner = new SigningClient(decryptedKey);
    const tokenApi = new TokenApi(tokenApiEndpoint, giveawayWalletSigner);
    const mintToken = await tokenApi.MintToken({
      quantity: new BigNumber(claimableWin.amountWon),
      tokenClass: giveaway.giveawayToken,
      owner: claimableWin.gcAddress,
    });
    if (mintToken.Status === 1) {
      claimableWin.claimed = true;
      return await claimableWin.save();
    } else {
      console.error(
        `Unable to mint, here is the dto: ${JSON.stringify(mintToken)}`,
      );
      return;
    }
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
      return [];
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

    if (giveaway.endDateTime && new Date(giveaway.endDateTime) < new Date()) {
      throw new BadRequestException('The giveaway has ended, sorry');
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
