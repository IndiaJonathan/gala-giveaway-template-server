import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  HttpStatus,
  UnauthorizedException,
  NotFoundException,
  BadRequestException,
  Headers,
  UsePipes,
  ValidationPipe,
  Param,
} from '@nestjs/common';
import { Response } from 'express';
import { GiveawayDto, GiveawayTokenType } from '../dtos/giveaway.dto';
import { GiveawayService } from './giveaway.service';
import { signatures } from '@gala-chain/api';
import { SignupGiveawayDto } from '../dtos/signup-giveaway.dto';
import { GalachainApi } from '../web3-module/galachain.api';
import { ProfileService } from '../profile-module/profile.service';
import BigNumber from 'bignumber.js';
import { BurnTokensRequestDto } from '../dtos/ClaimWin.dto';
import { ClaimFCFSRequestDTO } from '../dtos/ClaimFCFSGiveaway';
import { TokenInstanceKeyDto } from '../dtos/TokenInstanceKey.dto';
import { ObjectId } from 'mongodb';
import { validateSignature } from '../utils/web3wallet';
import { checkTokenEquality } from '../chain.helper';
import { GALA_TOKEN } from '../constant';

@Controller('api/giveaway')
export class GiveawayController {
  constructor(
    private readonly giveawayService: GiveawayService,
    private tokenService: GalachainApi,
    private profileService: ProfileService,
  ) {}

  @Post('start')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async startGiveaway(@Body() giveawayDto: GiveawayDto, @Res() res: Response) {
    try {
      const publicKey = signatures.recoverPublicKey(
        giveawayDto.signature,
        giveawayDto,
        '',
      );

      if (giveawayDto.endDateTime) {
        const currentTime = new Date();
        const oneHourFromNow = new Date(currentTime.getTime() + 60 * 60 * 1000);

        if (new Date(giveawayDto.endDateTime) <= oneHourFromNow) {
          throw new BadRequestException(
            'The endDateTime must be at least one hour in the future.',
          );
        }
      }

      const gc_address = 'eth|' + signatures.getEthAddress(publicKey);

      const account = await this.profileService.findProfileByGC(gc_address);

      const availableTokens =
        await this.giveawayService.getNetAvailableTokenQuantity(
          account.giveawayWalletAddress,
          account._id as ObjectId,
          giveawayDto.giveawayToken,
          giveawayDto.giveawayTokenType,
        );

      const tokensToGiveaway = (() => {
        switch (giveawayDto.giveawayType) {
          case 'FirstComeFirstServe':
            return BigNumber(giveawayDto.claimPerUser).multipliedBy(
              giveawayDto.maxWinners,
            );
          case 'DistributedGiveway':
            return BigNumber(giveawayDto.tokenQuantity).multipliedBy(
              BigNumber(giveawayDto.maxWinners),
            );
        }
      })();
      const tokenDiff = BigNumber(availableTokens).minus(
        BigNumber(tokensToGiveaway),
      );
      if (tokenDiff.lt(0)) {
        switch (giveawayDto.giveawayTokenType) {
          case GiveawayTokenType.BALANCE:
            throw new BadRequestException(
              `You need to transfer more tokens before you can start this giveaway. Need an additional ${tokenDiff.multipliedBy(-1)}`,
            );
          case GiveawayTokenType.ALLOWANCE:
            throw new BadRequestException(
              `You need to grant more tokens before you can start this giveaway. Need an additional ${tokenDiff.multipliedBy(-1)}`,
            );
        }
      }

      //todo: ADD this back

      // const dryRunResult = await this.giveawayService.getGiveawayEstimatedFee(
      //   gc_address,
      //   giveawayDto.giveawayToken,
      // );

      // if (
      //   dryRunResult.Status !== 1 ||
      //   dryRunResult.Data.response.Status !== 1
      // ) {
      //   throw dryRunResult;
      // }

      // if (
      //   dryRunResult.Status !== 1 ||
      //   dryRunResult.Data.response.Status !== 1
      // ) {
      //   throw dryRunResult;
      // }

      const balances = await this.tokenService.getBalancesForToken(
        account.giveawayWalletAddress,
        {
          additionalKey: 'none',
          category: 'Unit',
          collection: 'GALA',
          type: 'none',
        } as any,
      );

      //todo: account for locks
      const galaBalance = balances.Data.reduce((total, item) => {
        return total.plus(item.quantity);
      }, new BigNumber(0));

      const gasFees =
        this.giveawayService.getRequiredGalaGasFeeForGiveaway(giveawayDto);

      const currentGiveawayEscrows =
        await this.giveawayService.getTotalGalaFeesRequired(account.id);

      let totalGalaRequirement = gasFees.plus(currentGiveawayEscrows);

      if (giveawayDto.giveawayTokenType === GiveawayTokenType.BALANCE) {
        if (checkTokenEquality(giveawayDto.giveawayToken, GALA_TOKEN)) {
          totalGalaRequirement = totalGalaRequirement.plus(tokensToGiveaway);
        }
      }
      const net = galaBalance.minus(totalGalaRequirement);

      //todo: unhardcode this from 1, use dry run
      if (net.lt(0)) {
        throw new BadRequestException(
          `Insuffucient GALA balance in Giveway wallet, need additional ${net.multipliedBy(-1)}`,
        );
      }

      const createdGiveaway = await this.giveawayService.createGiveaway(
        publicKey,
        giveawayDto,
      );
      res
        .status(HttpStatus.CREATED)
        .json({ success: true, giveaway: createdGiveaway });
    } catch (error) {
      console.error(error);
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ success: false, message: 'Failed to start giveaway', error });
    }
  }

  @Post('signup')
  async signupForGiveaway(@Body() signUpData: SignupGiveawayDto) {
    const publicKey = signatures.recoverPublicKey(
      signUpData.signature,
      signUpData,
      '',
    );
    const gc_address = 'eth|' + signatures.getEthAddress(publicKey);
    const signupResult = await this.giveawayService.signupUserForDistributed(
      signUpData.giveawayId,
      gc_address,
    );
    return signupResult;
  }

  @Get('all')
  async getGiveaways(
    @Res() res: Response,
    @Headers('gc-address') gcAddress?: string,
  ) {
    try {
      const giveaways = await this.giveawayService.getGiveaways(gcAddress);
      res.status(HttpStatus.OK).json(giveaways);
    } catch (error) {
      console.error(error);
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Failed to retrieve giveaways',
        error,
      });
    }
  }

  @Post('fcfs/claim')
  async claimFCFS(@Body() giveawayDto: ClaimFCFSRequestDTO) {
    const gc_address = validateSignature(giveawayDto);
    return this.giveawayService.claimFCFS(giveawayDto, gc_address);
  }

  @Post('randomgiveaway/claim')
  async claimWin(
    @Body() giveawayDto: BurnTokensRequestDto,
    @Res() res: Response,
  ) {
    try {
      const claimableWin = await this.giveawayService.getClaimableWin(
        giveawayDto.claimId,
      );

      if (!claimableWin)
        throw new NotFoundException(
          `Cannot find claimable giveway with this id: ${giveawayDto.claimId}`,
        );
      if (claimableWin.claimed) {
        throw new BadRequestException(`Giveaway already claimed`);
      }

      const gc_address = validateSignature(giveawayDto);

      const profile = await this.profileService.findProfileByGC(gc_address);

      if (claimableWin.gcAddress !== profile.galaChainAddress) {
        throw new BadRequestException(
          'This GC address does not have an unclaimed win available',
        );
      }

      //todo: handle if already burnt
      const result = await this.tokenService.burnToken(giveawayDto);
      console.log(result);
      if (result.Status === 1) {
        //Good to go
        claimableWin.claimInfo = JSON.stringify(result);
        const mintToken = await this.giveawayService.sendWinnings(
          profile.galaChainAddress,
          new BigNumber(claimableWin.amountWon),
          claimableWin.giveaway,
        );
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
      res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      console.error(error);
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ success: false, message: 'Failed to claim giveaway', error });
    }
  }

  @Post('allowance-available/:gcAddress')
  async getAllowanceAvailable(
    @Param('gcAddress') gcAddress: string,
    @Body() tokenClass: TokenInstanceKeyDto,
  ) {
    const userInfo = await this.profileService.findProfileByGC(gcAddress);

    const allowances = await this.giveawayService.getNetAvailableTokenQuantity(
      userInfo.giveawayWalletAddress,
      userInfo._id as ObjectId,
      tokenClass,
      GiveawayTokenType.ALLOWANCE,
    );

    const galaBalances = await this.tokenService.getBalancesForToken(
      userInfo.giveawayWalletAddress,
      tokenClass,
    );

    //todo: account for locks
    const galaBalance = galaBalances.Data.reduce((total, item) => {
      return total.plus(item.quantity);
    }, new BigNumber(0));

    const currentGalaFeesNeeded =
      await this.giveawayService.getTotalGalaFeesRequired(userInfo.id);

    return {
      detailsType: 'Allowance',
      allowances,
      galaBalance,
      giveawayWallet: userInfo.giveawayWalletAddress,
      currentGalaFeesNeeded,
    };
  }

  @Post('balance-available/:gcAddress')
  async getBalanceAvailable(
    @Param('gcAddress') gcAddress: string,
    @Body() tokenClass: TokenInstanceKeyDto,
  ) {
    const userInfo = await this.profileService.findProfileByGC(gcAddress);
    const tokenBalances = await this.tokenService.getBalancesForToken(
      userInfo.giveawayWalletAddress,
      tokenClass,
    );
    const tokenBalance = tokenBalances.Data.reduce((total, item) => {
      return total.plus(item.quantity);
    }, new BigNumber(0));

    const galaBalances = await this.tokenService.getBalancesForToken(
      userInfo.giveawayWalletAddress,
      tokenClass,
    );

    //todo: account for locks
    const galaBalance = galaBalances.Data.reduce((total, item) => {
      return total.plus(item.quantity);
    }, new BigNumber(0));

    const currentGalaFeesNeeded =
      await this.giveawayService.getTotalGalaFeesRequired(userInfo.id);

    return {
      detailsType: 'Balance',
      tokenBalance,
      galaBalance,
      giveawayWallet: userInfo.giveawayWalletAddress,
      currentGalaFeesNeeded,
    };
  }
}
