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
} from '@nestjs/common';
import { Response } from 'express';
import { GiveawayDto } from '../dtos/giveaway.dto';
import { GiveawayService } from './giveaway.service';
import { signatures } from '@gala-chain/api';
import { SignupGiveawayDto } from '../dtos/signup-giveaway.dto';
import { BabyOpsApi } from '../services/baby-ops.service';
import { ProfileService } from '../services/profile.service';
import BigNumber from 'bignumber.js';
import { BurnTokensRequestDto } from '../dtos/ClaimWin.dto';
import { GalaChainBaseApi } from '@gala-chain/connect';

@Controller('api/giveaway')
export class GiveawayController {
  constructor(
    private readonly giveawayService: GiveawayService,
    private tokenService: BabyOpsApi,
    private profileService: ProfileService,
  ) {}

  @Post('start')
  async startGiveaway(@Body() giveawayDto: GiveawayDto, @Res() res: Response) {
    try {
      const publicKey = signatures.recoverPublicKey(
        giveawayDto.signature,
        giveawayDto,
        '',
      );

      const gc_address = 'eth|' + signatures.getEthAddress(publicKey);

      const account = await this.profileService.findProfileByGC(gc_address);

      const availableTokens = await this.tokenService.getTotalAllowanceQuantity(
        account.giveawayWalletAddress,
        account.id,
        giveawayDto.giveawayToken,
      );

      if (
        BigNumber(availableTokens.totalQuantity).minus(
          BigNumber(giveawayDto.tokenQuantity),
        ) < BigNumber(0)
      ) {
        throw new UnauthorizedException(
          'You need to grant more tokens before you can start this giveaway',
        );
      }

      const dryRunResult = await this.giveawayService.getGiveawayEstimatedFee(
        gc_address,
        giveawayDto.giveawayToken,
      );

      if (
        dryRunResult.Status !== 1 ||
        dryRunResult.Data.response.Status !== 1
      ) {
        throw dryRunResult;
      }

      const createdGiveaway = await this.giveawayService.createGiveaway(
        publicKey,
        giveawayDto,
      );
      res
        .status(HttpStatus.OK)
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
    const signupResult = await this.giveawayService.signupUser(
      signUpData.giveawayId,
      gc_address,
    );
    return signupResult;
  }

  @Get('all')
  async getAllGiveaways(
    @Res() res: Response,
    @Headers('gc-address') gcAddress?: string,
  ) {
    try {
      const validGcAddress =
        gcAddress &&
        (gcAddress.startsWith('client') || gcAddress.startsWith('eth'));

      if (!validGcAddress) throw new Error('Must have gc-address in header');
      const giveaways = await this.giveawayService.getGiveaways(gcAddress);
      res.status(HttpStatus.OK).json(giveaways);
    } catch (error) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Failed to retrieve giveaways',
        error,
      });
    }
  }

  @Post('claim')
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

      const result = await this.tokenService.burnToken(giveawayDto);
      console.log(result);
      if (result.Status === 1) {
        //Good to go
        claimableWin.claimInfo = JSON.stringify(result);
        await this.giveawayService.sendWinnings(
          claimableWin.giveaway.creator,
          claimableWin,
          claimableWin.giveaway,
        );
      }
      res.status(HttpStatus.OK).json({ success: true });
    } catch (error) {
      console.error(error);
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ success: false, message: 'Failed to claim giveaway', error });
    }
  }

  @Get('active')
  async getActiveGiveaways(@Res() res: Response) {
    try {
      const giveaways = await this.giveawayService.getAllActiveGiveaways();
      res.status(HttpStatus.OK).json(giveaways);
    } catch (error) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Failed to retrieve giveaways',
        error,
      });
    }
  }
}
