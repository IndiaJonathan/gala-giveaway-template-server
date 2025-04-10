import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  HttpStatus,
  NotFoundException,
  BadRequestException,
  Headers,
  UsePipes,
  ValidationPipe,
  Param,
} from '@nestjs/common';
import { Response } from 'express';
import { GiveawayTokenType, BasicGiveawaySettingsDto } from '../dtos/giveaway.dto';
import { GiveawayService } from './giveaway.service';
import { signatures } from '@gala-chain/api';
import { SignupGiveawayDto } from '../dtos/signup-giveaway.dto';
import { GalachainApi } from '../web3-module/galachain.api';
import { ProfileService } from '../profile-module/profile.service';
import BigNumber from 'bignumber.js';
import { BurnTokensRequestDto } from '../dtos/ClaimWin.dto';
import { ClaimFCFSRequestDTO } from '../dtos/ClaimFCFSGiveaway';
import { ObjectId } from 'mongodb';
import {
  recoverPublicKeyFromSignature,
  recoverWalletAddressFromSignature,
  validateSignature,
} from '../utils/web3wallet';
import { checkTokenEquality } from '../chain.helper';
import { GALA_TOKEN } from '../constant';
import { GasFeeEstimateRequestDto } from '../dtos/GasFeeEstimateRequest.dto';
import { TokensAvailableDto } from '../dtos/TokensAvailable.dto';
import {
  filterGiveawaysData,
  filterGiveawayData,
} from '../utils/giveaway-utils';
import { getAddress } from 'ethers';
@Controller('api/giveaway')
export class GiveawayController {
  constructor(
    private readonly giveawayService: GiveawayService,
    private tokenService: GalachainApi,
    private profileService: ProfileService,
  ) {}

  @Post('start')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async startGiveaway(
    @Body()
    giveawayDto: BasicGiveawaySettingsDto,
    @Res() res: Response,
  ) {
    try {
      // delete giveawayDto.types
      const publicKey = recoverPublicKeyFromSignature(giveawayDto);

      // Set startDateTime to now if it's empty
      if (!giveawayDto.startDateTime) {
        giveawayDto.startDateTime = new Date().toISOString();
      }

      // Validate that distributed giveaways have an end date
      if (
        giveawayDto.giveawayType === 'DistributedGiveaway' &&
        !giveawayDto.endDateTime
      ) {
        throw new BadRequestException(
          'End date is required for distributed giveaways.',
        );
      }

      if (giveawayDto.endDateTime) {
        const currentTime = new Date();
        const oneHourFromNow = new Date(currentTime.getTime() + 60 * 60 * 1000);

        if (new Date(giveawayDto.endDateTime) <= oneHourFromNow) {
          throw new BadRequestException(
            'The endDateTime must be at least one hour in the future.',
          );
        }

        // Add validation to ensure at least 10 minutes between start and end date
        const startDate = new Date(giveawayDto.startDateTime);
        const endDate = new Date(giveawayDto.endDateTime);
        const tenMinutesInMs = 10 * 60 * 1000;

        if (endDate.getTime() - startDate.getTime() < tenMinutesInMs) {
          throw new BadRequestException(
            'There must be at least 10 minutes between start and end date.',
          );
        }
      }

      const eth_address = getAddress(signatures.getEthAddress(publicKey));

      const account = await this.profileService.findProfileByEth(eth_address);

      const availableTokens =
        await this.giveawayService.getNetAvailableTokenQuantity(
          account.giveawayWalletAddress,
          account._id as ObjectId,
          giveawayDto.giveawayToken,
          giveawayDto.giveawayTokenType,
        );

      const tokensNeeded =
        this.giveawayService.getRequiredTokensForGiveaway(giveawayDto);
      const tokenDiff = BigNumber(availableTokens).minus(
        BigNumber(tokensNeeded),
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

      const requiredGas =
        await this.giveawayService.getTotalGalaFeesRequiredPlusEscrow(
          account.id,
          giveawayDto,
        );

      let totalGalaRequirement = requiredGas;

      if (giveawayDto.giveawayTokenType === GiveawayTokenType.BALANCE) {
        if (checkTokenEquality(giveawayDto.giveawayToken, GALA_TOKEN)) {
          totalGalaRequirement = totalGalaRequirement.plus(tokensNeeded);
        }
      }
      const net = galaBalance.minus(totalGalaRequirement);

      //todo: unhardcode this from 1, use dry run
      if (net.lt(0)) {
        throw new BadRequestException(
          `Insuffucient GALA balance in Giveway wallet, need additional ${net.multipliedBy(-1)}`,
        );
      }

      const tokens = [giveawayDto.giveawayToken];
      if (giveawayDto.burnToken) {
        tokens.push(giveawayDto.burnToken);
      }

      const tokenMetadata = await this.tokenService.getTokenMetadata(tokens);

      const image = tokenMetadata.Data.find((token) =>
        checkTokenEquality(token, giveawayDto.giveawayToken),
      )?.image;

      let burnTokenImage = undefined;
      if (giveawayDto.burnToken) {
        burnTokenImage = tokenMetadata.Data.find((token) =>
          checkTokenEquality(token, giveawayDto.burnToken),
        )?.image;
      }

      const createdGiveaway = await this.giveawayService.createGiveaway(
        publicKey,
        giveawayDto,
        image,
        burnTokenImage,
      );
      res
        .status(HttpStatus.CREATED)
        .json({ success: true, giveaway: createdGiveaway });
    } catch (error) {
      console.error(error);
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ success: false, message: error.message || 'Failed to start giveaway', error });
    }
  }

  @Post('signup')
  async signupForGiveaway(@Body() signUpData: SignupGiveawayDto) {
    const eth_address = recoverWalletAddressFromSignature(signUpData);
    const profile = await this.profileService.findProfileByEth(eth_address);
    const signupResult = await this.giveawayService.signupUserForDistributed(
      signUpData.giveawayId,
      profile.galaChainAddress,
    );
    return signupResult;
  }

  @Post('estimate-fee')
  estimateFee(@Body() gasFeeDto: GasFeeEstimateRequestDto) {
    const result =
      this.giveawayService.getRequiredGalaGasFeeForGiveaway(gasFeeDto);
    return result;
  }

  @Get('all')
  async getGiveaways(
    @Res() res: Response,
    @Headers('gc-address') gcAddress?: string,
  ) {
    try {
      const giveaways = await this.giveawayService.getGiveaways(gcAddress);
      // Already filtered in the service, but let's double-check to ensure consistency
      res.status(HttpStatus.OK).json(filterGiveawaysData(giveaways));
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
  async claimFCFS(@Body() giveawayDto: any) {
    const eth_address = validateSignature(giveawayDto);
    const profile = await this.profileService.findProfileByEth(eth_address);

    const winEntry = await this.giveawayService.claimFCFS(
      giveawayDto,
      profile.galaChainAddress,
    );

    // Format the response to match the expected format in tests
    const paymentInfo = winEntry.winningInfo
      ? JSON.parse(winEntry.winningInfo)
      : {};

    return {
      success: true,
      message: `You successfully claimed ${winEntry.amountWon} of GALA`,
      transactionDetails: {
        Status: paymentInfo.Status || 1,
        success: true,
      },
    } as const;
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

      const eth_address = validateSignature(giveawayDto);

      const profile = await this.profileService.findProfileByEth(eth_address);

      if (claimableWin.gcAddress !== profile.galaChainAddress) {
        throw new BadRequestException(
          'This GC address does not have an unclaimed win available',
        );
      }

      //todo: handle if already burnt
      const result = await this.tokenService.burnToken(giveawayDto);
      console.log(result);
      if (result.Status?.toString() === '1') {
        //Good to go
        claimableWin.claimInfo = JSON.stringify(result);
        const mintToken = await this.giveawayService.sendWinnings(
          profile.galaChainAddress,
          new BigNumber(claimableWin.amountWon),
          claimableWin.giveaway,
        );
        if (mintToken.Status?.toString() === '1') {
          claimableWin.claimed = true;
          claimableWin.timeClaimed = new Date();
          await claimableWin.save();
          return res.status(HttpStatus.OK).json({
            success: true,
            message: 'Giveaway claimed successfully',
            claimableWin,
          });
        } else {
          console.error(
            `Unable to mint, here is the dto: ${JSON.stringify(mintToken)}`,
          );
          return res.status(HttpStatus.INTERNAL_SERVER_ERROR).json({
            success: false,
            message: 'Failed to mint tokens',
            error: mintToken,
          });
        }
      }
      return res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Failed to burn tokens',
        error: result,
      });
    } catch (error) {
      console.error(error);
      return res
        .status(HttpStatus.BAD_REQUEST)
        .json({ success: false, message: 'Failed to claim giveaway', error });
    }
  }

  @Get('claimable-wins/:gcAddress')
  async getClaimableWins(
    @Param('gcAddress') gcAddress: string,
    @Res() res: Response,
  ) {
    try {
      const claimableWins =
        await this.giveawayService.getClaimableWins(gcAddress);

      // Ensure no giveawayErrors are included in the response
      res.status(HttpStatus.OK).json(
        claimableWins.map((win) => {
          // Filter giveaway data if present
          if (win.giveawayDetails) {
            return {
              ...win,
              giveawayDetails: filterGiveawayData(win.giveawayDetails),
            };
          }
          return win;
        }),
      );
    } catch (error) {
      console.error(error);
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Failed to retrieve claimable wins',
        error,
      });
    }
  }

  @Get('user-wins/:gcAddress')
  async getUserWins(
    @Param('gcAddress') gcAddress: string,
    @Res() res: Response,
  ) {
    try {
      // Get giveaways where the user is a winner directly from the service
      const userWonGiveaways =
        await this.giveawayService.getUserWonGiveaways(gcAddress);

      // Already filtered in the service, but let's double-check to ensure consistency
      res.status(HttpStatus.OK).json(filterGiveawaysData(userWonGiveaways));
    } catch (error) {
      console.error(error);
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Failed to retrieve user wins',
        error,
      });
    }
  }
}
