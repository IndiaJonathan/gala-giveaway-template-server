import {
  Body,
  Controller,
  Get,
  Post,
  Res,
  HttpStatus,
  UnauthorizedException,
} from '@nestjs/common';
import { Response } from 'express';
import { GiveawayDto } from '../dtos/giveaway.dto';
import { GiveawayService } from './giveaway.service';
import { signatures } from '@gala-chain/api';
import { SignupGiveawayDto } from '../dtos/signup-giveaway.dto';
import { BabyOpsApi } from '../services/baby-ops.service';
import { ProfileService } from '../services/profile.service';
import BigNumber from 'bignumber.js';

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
  async getAllGiveaways(@Res() res: Response) {
    try {
      const giveaways = await this.giveawayService.findAll();
      res.status(HttpStatus.OK).json(giveaways);
    } catch (error) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Failed to retrieve giveaways',
        error,
      });
    }
  }

  @Get('active')
  async getActiveGiveaways(@Res() res: Response) {
    try {
      const giveaways = await this.giveawayService.findAll();
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
