import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';
import {
  GiveawayDocument,
  GiveawayStatus,
  Winner,
} from '../schemas/giveaway.schema';
import {
  GalaChainResponseType,
  signatures,
  TokenClassKeyProperties,
} from '@gala-chain/api';
import { ProfileService } from '../profile-module/profile.service';
import BigNumber from 'bignumber.js';
import { GiveawayDto, GiveawayTokenType } from '../dtos/giveaway.dto';
import { GALA_TOKEN, MAX_ITERATIONS as MAX_WINNERS } from '../constant';
import { WinDocument } from '../schemas/ClaimableWin.schema';
import { APP_SECRETS } from '../secrets/secrets.module';
import {
  GalaChainBaseApi,
  PresignedClient,
  SigningClient,
} from '@gala-chain/connect';
import { ObjectId } from 'mongodb';
import { checkTokenEquality, tokenToReadable } from '../chain.helper';
import { ClaimFCFSRequestDTO } from '../dtos/ClaimFCFSGiveaway';
import { BurnTokenQuantityDto } from '../dtos/BurnTokenQuantity.dto';
import { GalachainApi } from '../web3-module/galachain.api';
import { WalletService } from '../web3-module/wallet.service';
import { GasFeeEstimateRequestDto } from '../dtos/GasFeeEstimateRequest.dto';
import { filterGiveawayData } from '../utils/giveaway-utils';
import { getAddress } from 'ethers';

@Injectable()
export class GiveawayService {
  constructor(
    @InjectModel('Giveaway')
    private readonly giveawayModel: Model<GiveawayDocument>,
    @InjectModel('Win')
    private readonly winModel: Model<WinDocument>,
    private profileService: ProfileService,
    @Inject(GalachainApi) private galachainApi: GalachainApi,
    @Inject(WalletService) private walletService: WalletService,
    @Inject(APP_SECRETS) private secrets: Record<string, any>,
  ) {}

  async createGiveaway(
    publicKey: string,
    giveawayDto: GiveawayDto,
    tokenImage: string,
    burnTokenImage?: string,
  ): Promise<GiveawayDocument> {
    const eth_address = getAddress(signatures.getEthAddress(publicKey));

    const account = await this.profileService.findProfileByEth(eth_address);

    const newGiveaway = new this.giveawayModel({
      ...giveawayDto,
      giveawayToken: {
        image: tokenImage,
        ...giveawayDto.giveawayToken,
      },
      ...(giveawayDto.burnToken && {
        burnToken: {
          image: burnTokenImage,
          ...giveawayDto.burnToken,
        },
      }),
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

      // Filter out sensitive fields like giveawayErrors
      const filteredGiveaway = filterGiveawayData(giveaway);

      // Remove the 'winners' field

      const { winners, ...rest } = filteredGiveaway;

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

  /**
   * Find all giveaways where the user with the provided GC address is a winner
   * @param gcAddress The user's GC address
   * @returns Array of giveaways where the user is a winner
   */
  async getUserWonGiveaways(gcAddress: string): Promise<any[]> {
    const claimableWins = await this.winModel
      .find({ gcAddress })
      .populate('giveaway')
      .lean()
      .exec();

    // Transform the claimable wins to include only required giveaway information
    return claimableWins
      .map((win) => {
        const { giveaway, ...claimableWinData } = win;

        if (!giveaway) {
          return null;
        }

        // Filter out sensitive fields like giveawayErrors first
        const filteredGiveaway = filterGiveawayData(giveaway);

        // Extract only the requested fields from giveaway
        const selectedGiveawayFields = {
          name: filteredGiveaway.name,
          endDateTime: filteredGiveaway.endDateTime,
          giveawayType: filteredGiveaway.giveawayType,
          giveawayToken: filteredGiveaway.giveawayToken,
          winPerUser: filteredGiveaway.winPerUser,
          creator: filteredGiveaway.creator,
          burnToken: filteredGiveaway.burnToken,
          burnTokenQuantity: filteredGiveaway.burnTokenQuantity,
        };

        // Return claimable win data with filtered giveaway data
        return {
          ...claimableWinData,
          giveaway: selectedGiveawayFields,
        };
      })
      .filter((win) => win !== null);
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
        giveawayType: 'DistributedGiveaway',
        endDateTime: { $lt: currentDate },
      })
      .exec();
  }

  async getClaimableWin(claimableWinId: string) {
    const claimableWin = await this.winModel
      .findById(claimableWinId)
      .populate('giveaway')
      .exec();
    return claimableWin;
  }

  async getClaimableWins(gcAddress: string) {
    return this.winModel.aggregate([
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
          timeWon: 1,
          timeClaimed: 1,
        },
      },
    ]);
  }

  async createWinClaimsFromWinners(giveawayId: ObjectId, winners: Winner[]) {
    // Get the giveaway to access its type
    const giveaway = await this.giveawayModel.findById(giveawayId).exec();
    if (!giveaway) {
      throw new NotFoundException(`Giveaway with ID ${giveawayId} not found`);
    }

    const claimableWins = winners.map(
      (winner) =>
        new this.winModel({
          giveaway: giveawayId,
          amountWon: winner.winAmount,
          gcAddress: winner.gcAddress,
          giveawayType: giveaway.giveawayType,
          timeWon: new Date(),
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
    const encryptionKey = this.secrets['ENCRYPTION_KEY'];

    const creatorProfile = await this.profileService.findProfile(
      giveaway.creator,
    );
    const decryptedKey = await creatorProfile.decryptPrivateKey(encryptionKey);

    if (giveaway.giveawayTokenType === GiveawayTokenType.BALANCE) {
      const transferToken = await this.galachainApi.transferToken(
        {
          quantity: amount,
          tokenInstance: {
            ...giveaway.giveawayToken,
            instance: BigNumber(0),
          },
          to: winnerGCAddress,
        },
        new SigningClient(decryptedKey),
      );
      return transferToken;
    } else {
      try {
        const mintToken = await this.galachainApi.mintToken(
          {
            quantity: amount,
            tokenClass: giveaway.giveawayToken,
            owner: winnerGCAddress,
          },
          new SigningClient(decryptedKey),
        );
        return mintToken;
      } catch (e) {
        console.error(e);
        throw e;
      }
    }
  }

  determineWinners(giveaway: GiveawayDocument): Winner[] {
    const usersSignedUp = giveaway.usersSignedUp;
    const numberOfUsers = usersSignedUp.length;
    const winnersMap: { [userId: string]: BigNumber } = {};

    if (!giveaway.maxWinners) {
      throw new BadRequestException('Max winners not set');
    }
    const iterations = Math.min(
      MAX_WINNERS,
      giveaway.maxWinners || MAX_WINNERS,
    );

    if (usersSignedUp.length === 0) {
      return [];
    }

    let remainingTokens = new BigNumber(giveaway.winPerUser).multipliedBy(
      giveaway.maxWinners,
    );

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
        completed: false,
      }),
    );

    return winnersArray;
  }

  async runGiveawayChecks(giveaway: GiveawayDocument, gcAddress: string) {
    if (giveaway.endDateTime && new Date(giveaway.endDateTime) < new Date()) {
      throw new BadRequestException('The giveaway has ended, sorry');
    }

    // Check if the giveaway has a startDateTime and it hasn't started yet
    if (
      giveaway.startDateTime &&
      new Date(giveaway.startDateTime) > new Date()
    ) {
      throw new BadRequestException('The giveaway has not started yet');
    }

    if (giveaway.telegramAuthRequired) {
      const getProfile = await this.profileService.findProfileByGC(
        gcAddress.toLowerCase(),
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
    if (!gcAddress.startsWith('eth|') && !gcAddress.startsWith('client|'))
      throw new BadRequestException(`Not a GC address! Got: ${gcAddress}`);
    const giveaway = await this.giveawayModel.findById(giveawayId).exec();

    if (!giveaway) {
      throw new NotFoundException('Giveaway not found');
    }

    if (giveaway.usersSignedUp.includes(gcAddress.toLowerCase())) {
      throw new BadRequestException(`You're already signed up!`);
    }
    if (giveaway.giveawayType !== 'DistributedGiveaway') {
      throw new BadRequestException(
        'Giveaway is not of type DistributedGiveaway',
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
    if (!gcAddress.startsWith('eth|') && !gcAddress.startsWith('client|'))
      throw new BadRequestException(
        'GC Address must start with eth| or client|, any others are unsupported at the moment.',
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
          winner.gcAddress.toLowerCase() === gcAddress.toLowerCase(),
      ).length
    ) {
      throw new BadRequestException(`You've already claimed this!`);
    }
    if (!giveaway.winPerUser)
      throw new BadRequestException('Giveway lacks claim per user');

    await this.runGiveawayChecks(giveaway, gcAddress);

    // Create the win entry that will track both the win and payment status
    const winEntry = new this.winModel({
      giveaway: giveaway.id,
      gcAddress,
      amountWon: giveaway.winPerUser,
      claimed: true,
      timeWon: new Date(),
      timeClaimed: new Date(),
      giveawayType: giveaway.giveawayType,
    });

    if (giveaway.burnToken) {
      this.runBurnChecks(giveaway, claimDto.tokenInstances);
      // claimDto.tokenInstances.forEach((tokenInstance) => {
      //   tokenInstance.quantity = tokenInstance.tokenInstanceKey.replace('eth|', '0x');
      // });

      const result = await this.galachainApi.burnToken(claimDto);
      console.log(result);
      if (result.Status !== GalaChainResponseType.Success) {
        throw new BadRequestException(
          `Burn request failed, cannot claim. Error: ${JSON.stringify(result)}`,
        );
      }

      winEntry.burnInfo = JSON.stringify(result);
    }

    // Actually send the tokens to the user
    try {
      const encryptionKey = this.secrets['ENCRYPTION_KEY'];
      const creatorProfile = await this.profileService.findProfile(
        giveaway.creator,
      );

      const decryptedKey =
        await creatorProfile.decryptPrivateKey(encryptionKey);
      const giveawayWalletSigner = new SigningClient(decryptedKey);

      let paymentResult;
      if (giveaway.giveawayTokenType === GiveawayTokenType.BALANCE) {
        // Transfer token if it's a balance token
        paymentResult = await this.galachainApi.transferToken(
          {
            quantity: new BigNumber(giveaway.winPerUser),
            to: gcAddress,
            tokenInstance: {
              ...giveaway.giveawayToken,
              instance: new BigNumber(0),
            },
          },
          giveawayWalletSigner,
        );
      } else if (giveaway.giveawayTokenType === GiveawayTokenType.ALLOWANCE) {
        // Mint token if it's an allowance token
        paymentResult = await this.galachainApi.mintToken(
          {
            quantity: new BigNumber(giveaway.winPerUser),
            tokenClass: giveaway.giveawayToken,
            owner: gcAddress,
          },
          giveawayWalletSigner,
        );
      }

      // Mark payment as sent and store payment info
      winEntry.paymentSent = new Date();
      winEntry.winningInfo = JSON.stringify(paymentResult);
    } catch (error) {
      console.error('Error sending payment:', error);
      throw new BadRequestException(
        `Failed to send payment: ${error.message || JSON.stringify(error)}`,
      );
    }

    // Save the win entry
    await winEntry.save();

    // Update the giveaway with the new winner
    const winner: Winner = {
      gcAddress,
      winAmount: giveaway.winPerUser.toString(),
      completed: true,
    };

    giveaway.winners.push(winner);
    await giveaway.save();

    return winEntry;
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

  getRequiredTokensForGiveaway(giveaway: GiveawayDocument | GiveawayDto) {
    switch (giveaway.giveawayType) {
      case 'FirstComeFirstServe':
        // For FCFS, we need to calculate based on remaining claims
        if (
          'winners' in giveaway &&
          giveaway.winners &&
          giveaway.winners.length
        ) {
          // Calculate remaining tokens to reserve based on remaining potential winners
          const claimedWinners = giveaway.winners.length;
          const remainingWinners = Math.max(
            0,
            giveaway.maxWinners - claimedWinners,
          );
          return new BigNumber(giveaway.winPerUser).multipliedBy(
            remainingWinners,
          );
        }
        // If no winners yet or not a GiveawayDocument, return the full amount
        return new BigNumber(giveaway.winPerUser).multipliedBy(
          giveaway.maxWinners,
        );
      case 'DistributedGiveaway':
        return new BigNumber(giveaway.winPerUser).multipliedBy(
          giveaway.maxWinners,
        );
      default:
        throw new BadRequestException('Unsupported giveaway type');
    }
  }

  // async getTotalRequiredTokensAndEscrow(
  //   ownerId: ObjectId,
  //   giveaway?: GiveawayDocument | GiveawayDto,
  // ) {
  //   const unDistributedGiveaways = await this.findUndistributed(
  //     ownerId,
  //     giveaway.giveawayToken,
  //   );
  //   let totalTokensRequired = unDistributedGiveaways.reduce(
  //     (accumulator, giveaway) => {
  //       const tokens = new BigNumber(
  //         this.getRequiredTokensForGiveaway(giveaway),
  //       );
  //       return accumulator.plus(tokens);
  //     },
  //     new BigNumber(0),
  //   );

  //   if (giveaway) {
  //     totalTokensRequired = totalTokensRequired.plus(
  //       this.getRequiredTokensForGiveaway(giveaway),
  //     );
  //   }

  //   return totalTokensRequired;
  // }

  getRequiredGalaGasFeeForGiveaway(
    giveawayDoc: GiveawayDto | GiveawayDocument | GasFeeEstimateRequestDto,
  ) {
    // Check if it's a fully claimed FCFS giveaway
    if (giveawayDoc.giveawayType === 'FirstComeFirstServe') {
      let gasFee = giveawayDoc.maxWinners;
      if (
        'winners' in giveawayDoc &&
        giveawayDoc.winners &&
        giveawayDoc.winners.length
      ) {
        gasFee = giveawayDoc.maxWinners - giveawayDoc.winners.length;
      }
      return gasFee;
    } else if (giveawayDoc.giveawayType === 'DistributedGiveaway') {
      return 1;
    }
    throw new BadRequestException(
      `Giveaway type ${giveawayDoc.giveawayType} not supported`,
    );
  }

  async getTotalGalaFeesRequiredPlusEscrow(
    ownerId: ObjectId,
    giveaway?: GiveawayDocument | GiveawayDto,
  ) {
    const unDistributedGiveaways = await this.findUndistributed(ownerId);
    let totalGalaFee = unDistributedGiveaways.reduce(
      (accumulator, giveaway) => {
        let fee = new BigNumber(
          this.getRequiredGalaGasFeeForGiveaway(giveaway),
        );

        if (checkTokenEquality(giveaway.giveawayToken, GALA_TOKEN)) {
          //If the user is giving away gala, this should be accounted for
          let tokensInEscrow;

          if (giveaway.giveawayType === 'FirstComeFirstServe') {
            // For FCFS, calculate remaining tokens in escrow based on remaining claims
            const claimedWinners = giveaway.winners
              ? giveaway.winners.length
              : 0;
            const remainingWinners = Math.max(
              0,
              giveaway.maxWinners - claimedWinners,
            );
            tokensInEscrow = new BigNumber(giveaway.winPerUser).multipliedBy(
              remainingWinners,
            );
          } else {
            // For DistributedGiveaway, use the standard calculation
            tokensInEscrow = this.getRequiredTokensForGiveaway(giveaway);
          }

          fee = fee.plus(tokensInEscrow);
        }
        return accumulator.plus(fee);
      },
      new BigNumber(0),
    );

    if (giveaway) {
      totalGalaFee = totalGalaFee.plus(
        this.getRequiredGalaGasFeeForGiveaway(giveaway),
      );
    }

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

    const unDistributedGiveaways = await this.findUndistributed(
      ownerId,
      tokenClassKey,
    );

    unDistributedGiveaways
      .filter((giveaway) => giveaway.giveawayTokenType === giveawayTokenType)
      .forEach((giveaway) => {
        switch (giveaway.giveawayType) {
          case 'DistributedGiveaway':
            totalQuantity = BigNumber(totalQuantity).minus(
              new BigNumber(giveaway.winPerUser).multipliedBy(
                giveaway.maxWinners,
              ),
            );
            break;
          case 'FirstComeFirstServe':
            // Calculate remaining tokens to reserve based on remaining potential winners
            const claimedWinners = giveaway.winners
              ? giveaway.winners.length
              : 0;
            const remainingWinners = Math.max(
              0,
              giveaway.maxWinners - claimedWinners,
            );

            totalQuantity = BigNumber(totalQuantity).minus(
              new BigNumber(remainingWinners).multipliedBy(giveaway.winPerUser),
            );
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

    const unDistributedGiveaways = await this.findUndistributed(
      ownerId,
      tokenClassKey,
    );

    unDistributedGiveaways.forEach((giveaway) => {
      switch (giveaway.giveawayType) {
        case 'DistributedGiveaway':
          totalQuantity = BigNumber(totalQuantity).minus(giveaway.winPerUser);
          break;
        case 'FirstComeFirstServe':
          totalQuantity = BigNumber(totalQuantity).minus(giveaway.maxWinners);
      }
    });

    return totalQuantity;
  }

  async getRequiredEscrow(ownerId: ObjectId) {
    const unDistributedGiveaways = await this.findUndistributed(ownerId);

    // Create a map to store required escrow by token class
    const balanceEscrowRequirements: Map<
      string,
      TokenClassKeyProperties & { quantity: BigNumber }
    > = new Map();
    const allowanceEscrowRequirements: Map<
      string,
      TokenClassKeyProperties & { quantity: BigNumber }
    > = new Map();

    const galaKey = tokenToReadable(GALA_TOKEN);
    balanceEscrowRequirements.set(galaKey, {
      ...GALA_TOKEN,
      quantity: new BigNumber(0),
    });

    unDistributedGiveaways.forEach((giveaway) => {
      // Create a key for the token
      const tokenKey = tokenToReadable(giveaway.giveawayToken);

      // If this token isn't in our map yet, add it
      if (giveaway.giveawayTokenType === GiveawayTokenType.BALANCE) {
        if (!balanceEscrowRequirements.has(tokenKey)) {
          balanceEscrowRequirements.set(tokenKey, {
            ...giveaway.giveawayToken,
            quantity: new BigNumber(0),
          });
        }
      } else {
        if (!allowanceEscrowRequirements.has(tokenKey)) {
          allowanceEscrowRequirements.set(tokenKey, {
            ...giveaway.giveawayToken,
            quantity: new BigNumber(0),
          });
        }
      }

      // Calculate required tokens for the giveaway
      let requiredTokens = this.getRequiredTokensForGiveaway(giveaway);

      const galaFee = this.getRequiredGalaGasFeeForGiveaway(giveaway);
      balanceEscrowRequirements.set(galaKey, {
        ...GALA_TOKEN,
        quantity: balanceEscrowRequirements.get(galaKey).quantity.plus(galaFee),
      });

      if (giveaway.giveawayTokenType === GiveawayTokenType.ALLOWANCE) {
        allowanceEscrowRequirements.set(tokenKey, {
          ...allowanceEscrowRequirements.get(tokenKey),
          quantity: allowanceEscrowRequirements
            .get(tokenKey)
            .quantity.plus(requiredTokens),
        });
      } else {
        balanceEscrowRequirements.set(tokenKey, {
          ...balanceEscrowRequirements.get(tokenKey),
          quantity: balanceEscrowRequirements
            .get(tokenKey)
            .quantity.plus(requiredTokens),
        });
      }
    });

    // Convert the map to an array of token class and quantity pairs
    return {
      balanceEscrowRequirements: Array.from(balanceEscrowRequirements.values()),
      allowanceEscrowRequirements: Array.from(
        allowanceEscrowRequirements.values(),
      ),
    };
  }

  /**
   * Find all giveaways created by the user with the provided GC address
   * @param gcAddress The user's GC address
   * @returns Array of giveaways created by the user
   */
  async getGiveawaysByCreator(gcAddress: string): Promise<any[]> {
    try {
      // First get the user's profile to get their ObjectId
      const profile = await this.profileService.findProfileByGC(gcAddress);

      // Then find all giveaways where creator equals the profile's ObjectId
      const giveaways = await this.giveawayModel
        .find({ creator: profile._id })
        .lean()
        .exec();

      return giveaways.map((giveaway) => {
        // Get the list of winner addresses
        const winnerAddresses = giveaway.winners.map(
          (winner: { gcAddress: string }) => winner.gcAddress,
        );

        // Determine if the creator is also a winner (rare case)
        const isWinner = winnerAddresses.includes(gcAddress);

        // Filter out sensitive fields like giveawayErrors
        const filteredGiveaway = filterGiveawayData(giveaway);

        // Transform the result to include winner count
        if (filteredGiveaway.giveawayType === 'FirstComeFirstServe') {
          return {
            ...filteredGiveaway,
            winnerCount: filteredGiveaway.winners.length,
            isWinner,
            claimsLeft:
              filteredGiveaway.maxWinners - filteredGiveaway.winners.length,
          };
        }

        // Return the modified giveaway object with winner count
        return {
          ...filteredGiveaway,
          winnerCount: filteredGiveaway.winners.length,
          isWinner,
        };
      });
    } catch (error) {
      console.error('Error fetching giveaways by creator:', error);
      throw error;
    }
  }
}
