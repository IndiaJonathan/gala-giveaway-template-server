import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GiveawayDocument,
  GiveawayStatus,
  Winner,
} from '../schemas/giveaway.schema';
import { signatures, TokenClassKeyProperties } from '@gala-chain/api';
import { ProfileService } from '../profile-module/profile.service';
import BigNumber from 'bignumber.js';
import { GiveawayDto, GiveawayTokenType } from '../dtos/giveaway.dto';
import { MAX_ITERATIONS as MAX_WINNERS } from '../constant';
import { ClaimableWinDocument } from '../schemas/ClaimableWin.schema';
import { APP_SECRETS } from '../secrets/secrets.module';
import {
  GalaChainBaseApi,
  PresignedClient,
  SigningClient,
  TokenApi,
} from '@gala-chain/connect';
import { ObjectId } from 'mongodb';
import { checksumGCAddress, tokenToReadable } from '../chain.helper';
import { ClaimFCFSRequestDTO } from '../dtos/ClaimFCFSGiveaway';
import { BurnTokenQuantityDto } from '../dtos/BurnTokenQuantity.dto';
import { GalachainApi } from '../web3-module/galachain.api';
import { PaymentStatusDocument } from '../schemas/PaymentStatusSchema';
import { WalletService } from '../web3-module/wallet.service';

@Injectable()
export class GiveawayService {
  constructor(
    @InjectModel('Giveaway')
    private readonly giveawayModel: Model<GiveawayDocument>,
    @InjectModel('ClaimableWin')
    private readonly claimableWinModel: Model<ClaimableWinDocument>,
    @InjectModel('PaymentStatus') // Inject the Mongoose model for Profile
    private readonly paymentStatusModel: Model<PaymentStatusDocument>,
    private profileService: ProfileService,
    @Inject(GalachainApi) private galachainApi: GalachainApi,
    @Inject(WalletService) private walletService: WalletService,
    @Inject(APP_SECRETS) private secrets: Record<string, any>,
  ) {}

  async createGiveaway(
    publicKey: string,
    giveawayDto: GiveawayDto,
  ): Promise<GiveawayDocument> {
    const gc_address = 'eth|' + signatures.getEthAddress(publicKey);

    const account = await this.profileService.findProfileByGC(gc_address);

    const newGiveaway = new this.giveawayModel({
      ...giveawayDto,
      creator: account,
    });

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

  async getGiveaway(id: ObjectId) {
    return this.giveawayModel.findById(id);
  }

  // Only returns relevant data to make the request smaller
  async getGiveaways(gcAddress?: string): Promise<any[]> {
    const giveaways = await this.giveawayModel.find().lean().exec();

    return giveaways.map((giveaway) => {
      // Get the list of winner addresses
      const winnerAddresses = giveaway.winners.map(
        (winner: { gcAddress: string }) => winner.gcAddress,
      );

      // Determine if the gcAddress is in the list of winners
      const isWinner = winnerAddresses.includes(gcAddress);

      // Remove the 'winners' field
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { winners, ...rest } = giveaway;

      if (giveaway.giveawayType === 'FirstComeFirstServe') {
        return {
          ...rest,
          isWinner,
          claimsLeft: rest.maxWinners - winners.length,
        };
      }

      // Return the modified giveaway object
      return {
        ...rest,
        isWinner,
      };
    });
  }

  async findUndistributed(
    creator: ObjectId,
    tokenClass?: TokenClassKeyProperties,
  ): Promise<GiveawayDocument[]> {
    const currentDate = new Date();

    return this.giveawayModel
      .find({
        creator,
        $or: [
          { giveawayStatus: false },
          { endDateTime: { $gte: currentDate } },
        ],
        ...(tokenClass && {
          'giveawayToken.collection': tokenClass.collection,
          'giveawayToken.category': tokenClass.category,
          'giveawayToken.type': tokenClass.type,
          'giveawayToken.additionalKey': tokenClass.additionalKey,
        }),
      })
      .exec();
  }
  async findReadyForDistribution(): Promise<GiveawayDocument[]> {
    const currentDate = new Date();
    return this.giveawayModel
      .find({
        giveawayStatus: GiveawayStatus.Created,
        giveawayType: 'DistributedGiveway',
        endDateTime: { $lt: currentDate },
      })
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
    winnerGCAddress: string,
    amount: BigNumber,
    giveaway: GiveawayDocument,
  ) {
    const tokenApiEndpoint = this.secrets['TOKEN_API_ENDPOINT'];
    const encryptionKey = this.secrets['ENCRYPTION_KEY'];

    const creatorProfile = await this.profileService.findProfile(
      giveaway.creator,
    );
    const decryptedKey = await creatorProfile.decryptPrivateKey(encryptionKey);
    const giveawayWalletSigner = new SigningClient(decryptedKey);
    const tokenApi = new TokenApi(tokenApiEndpoint, giveawayWalletSigner);
    try {
      const mintToken = await tokenApi.MintToken({
        quantity: amount,
        tokenClass: giveaway.giveawayToken,
        owner: winnerGCAddress,
      });
      return mintToken;
    } catch (e) {
      console.error(e);
      throw e;
    }
  }

  determineWinners(giveaway: GiveawayDocument): Winner[] {
    const usersSignedUp = giveaway.usersSignedUp;
    const numberOfUsers = usersSignedUp.length;
    const winnersMap: { [userId: string]: BigNumber } = {};
    const iterations = Math.min(
      MAX_WINNERS,
      giveaway.maxWinners || MAX_WINNERS,
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
        completed: false,
      }),
    );

    return winnersArray;
  }

  async runGiveawayChecks(giveaway: GiveawayDocument, gcAddress: string) {
    if (giveaway.endDateTime && new Date(giveaway.endDateTime) < new Date()) {
      throw new BadRequestException('The giveaway has ended, sorry');
    }

    if (giveaway.telegramAuthRequired) {
      const getProfile = await this.profileService.findProfileByGC(
        checksumGCAddress(gcAddress),
      );
      if (giveaway.telegramAuthRequired && !getProfile.telegramId) {
        throw new BadRequestException(
          'You must link your telegram account for this giveaway',
        );
      }
    }

    //All checks passed
  }

  runBurnChecks(giveaway: GiveawayDocument, burnDto: BurnTokenQuantityDto[]) {
    if (giveaway.burnToken) {
      //Has a burn associated
      let burnQuantity = new BigNumber(0);
      if (!burnDto) {
        throw new BadRequestException('No burn, but this claim requires it');
      }
      burnDto.forEach((burn) => {
        if (
          tokenToReadable(burn.tokenInstanceKey) ===
          tokenToReadable(giveaway.burnToken)
        ) {
          burnQuantity = burnQuantity.plus(burn.quantity);
        } else {
          throw new BadRequestException(
            `Burn requires: ${tokenToReadable(giveaway.burnToken)}, but got: ${tokenToReadable(burn.tokenInstanceKey)}`,
          );
        }
      });
      if (!burnQuantity.eq(giveaway.burnTokenQuantity)) {
        throw new BadRequestException(
          `Burn requires amount of ${giveaway.burnTokenQuantity}, but got: ${burnQuantity}`,
        );
      }
    }
  }

  async signupUserForDistributed(
    giveawayId: string,
    gcAddress: string,
  ): Promise<any> {
    if (!gcAddress.startsWith('eth|'))
      throw new BadRequestException(
        'GC Address must start with eth|, any others are unsupported at the moment.',
      );
    const giveaway = await this.giveawayModel.findById(giveawayId).exec();

    if (!giveaway) {
      throw new NotFoundException('Giveaway not found');
    }

    if (giveaway.usersSignedUp.includes(checksumGCAddress(gcAddress))) {
      throw new BadRequestException(`You're already signed up!`);
    }
    if (giveaway.giveawayType !== 'DistributedGiveway') {
      throw new BadRequestException(
        'Giveaway is not of type DistributedGiveway',
      );
    }

    await this.runGiveawayChecks(giveaway, gcAddress);

    giveaway.usersSignedUp.push(gcAddress);
    await giveaway.save();

    return {
      message: `User with address ${gcAddress} successfully signed up for giveaway ${giveawayId}`,
    };
  }

  async claimFCFS(
    claimDto: ClaimFCFSRequestDTO,
    gcAddress: string,
  ): Promise<any> {
    gcAddress = checksumGCAddress(gcAddress);
    if (!gcAddress.startsWith('eth|'))
      throw new BadRequestException(
        'GC Address must start with eth|, any others are unsupported at the moment.',
      );
    const giveaway = await this.giveawayModel
      .findById(claimDto.giveawayId)
      .exec();

    if (!giveaway) {
      throw new NotFoundException('Giveaway not found');
    }
    if (giveaway.giveawayType !== 'FirstComeFirstServe') {
      throw new BadRequestException('Giveaway is not of type FCFS');
    }

    if (giveaway.maxWinners <= giveaway.winners.length) {
      throw new BadRequestException('Already fully claimed, sorry!');
    }

    if (
      giveaway.winners.filter(
        (winner) =>
          checksumGCAddress(winner.gcAddress) === checksumGCAddress(gcAddress),
      ).length
    ) {
      throw new BadRequestException(`You've already claimed this!`);
    }
    if (!giveaway.claimPerUser)
      throw new BadRequestException('Giveway lacks claim per user');

    await this.runGiveawayChecks(giveaway, gcAddress);
    const paymentStatus = new this.paymentStatusModel();
    paymentStatus.gcAddress = gcAddress;
    paymentStatus.giveaway = giveaway.id;

    if (giveaway.burnToken) {
      this.runBurnChecks(giveaway, claimDto.tokenInstances);

      const result = await this.galachainApi.burnToken(claimDto);
      console.log(result);
      if (result.Status !== 1) {
        throw new BadRequestException(
          `Burn request failed, cannot claim. Error: ${JSON.stringify(result)}`,
        );
      }

      paymentStatus.burnInfo = JSON.stringify(paymentStatus);
      await paymentStatus.save();
    }

    const sendResult = await this.sendWinnings(
      gcAddress,
      new BigNumber(giveaway.claimPerUser),
      giveaway,
    );
    giveaway.winners.push({
      gcAddress,
      winAmount: giveaway.claimPerUser.toString(),
      completed: true,
    });
    await giveaway.save();
    paymentStatus.winningInfo = JSON.stringify(sendResult);
    await paymentStatus.save();
    if (sendResult.Status === 1) {
      return sendResult;
    } else {
      throw new InternalServerErrorException(sendResult);
    }
  }

  // async getAllActiveGiveaways(): Promise<GiveawayDocument[]> {
  //   const currentDate = new Date();
  //   return this.giveawayModel
  //     .find({ endDateTime: { $gt: currentDate } })
  //     .exec();
  // }

  // async distributeClaim(
  //   giveawayModel: GiveawayDocument,
  // ): Promise<GiveawayDocument[]> {
  //   giveawayModel.claimPerUser
  //   return this.giveawayModel
  //     .find({ endDateTime: { $gt: currentDate } })
  //     .exec();
  // }

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

  getRequiredGalaGasFeeForGiveaway(giveaway: GiveawayDocument | GiveawayDto) {
    switch (giveaway.giveawayType) {
      case 'DistributedGiveway':
        switch (giveaway.giveawayTokenType) {
          case GiveawayTokenType.BALANCE:
            return BigNumber(1).multipliedBy(giveaway.maxWinners);
          case GiveawayTokenType.ALLOWANCE:
            return BigNumber(1);
        }
      case 'FirstComeFirstServe':
        //todo run dryrun
        return BigNumber(
          giveaway.maxWinners - (giveaway?.winners?.length || 0),
        );
    }
  }

  async getTotalGalaFeesRequired(ownerId: ObjectId) {
    const undistributedGiveways = await this.findUndistributed(ownerId);
    const totalGalaFee = undistributedGiveways.reduce(
      (accumulator, giveaway) => {
        const fee = new BigNumber(
          this.getRequiredGalaGasFeeForGiveaway(giveaway),
        );
        return accumulator.plus(fee);
      },
      new BigNumber(0),
    );
    return totalGalaFee;
  }

  async getNetAvailableTokenQuantity(
    giveawayWalletAddress: string,
    ownerId: ObjectId,
    tokenClassKey: TokenClassKeyProperties,
    giveawayTokenType: GiveawayTokenType,
  ) {
    let totalQuantity: BigNumber;
    if (giveawayTokenType === GiveawayTokenType.ALLOWANCE) {
      totalQuantity = await this.walletService.getAllowanceQuantity(
        giveawayWalletAddress,
        tokenClassKey,
      );
    } else if (giveawayTokenType === GiveawayTokenType.BALANCE) {
      totalQuantity = await this.walletService.getBalanceQuantity(
        giveawayWalletAddress,
        tokenClassKey,
      );
    }

    const undistributedGiveways = await this.findUndistributed(
      ownerId,
      tokenClassKey,
    );

    undistributedGiveways
      .filter((giveaway) => giveaway.giveawayTokenType === giveawayTokenType)
      .forEach((giveaway) => {
        switch (giveaway.giveawayType) {
          case 'DistributedGiveway':
            totalQuantity = BigNumber(totalQuantity).minus(
              giveaway.tokenQuantity,
            );
            break;
          case 'FirstComeFirstServe':
            totalQuantity = BigNumber(totalQuantity).minus(giveaway.maxWinners);
        }
      });

    return totalQuantity;
  }

  async getNetBalanceQuantity(
    giveawayWalletAddress: string,
    ownerId: ObjectId,
    tokenClassKey: TokenClassKeyProperties,
  ) {
    let totalQuantity = await this.walletService.getAllowanceQuantity(
      giveawayWalletAddress,
      tokenClassKey,
    );

    const undistributedGiveways = await this.findUndistributed(
      ownerId,
      tokenClassKey,
    );

    undistributedGiveways.forEach((giveaway) => {
      switch (giveaway.giveawayType) {
        case 'DistributedGiveway':
          totalQuantity = BigNumber(totalQuantity).minus(
            giveaway.tokenQuantity,
          );
          break;
        case 'FirstComeFirstServe':
          totalQuantity = BigNumber(totalQuantity).minus(giveaway.maxWinners);
      }
    });

    return totalQuantity;
  }
}
