import {
  Controller,
  Get,
  Res,
  HttpStatus,
  Post,
  Body,
  Param,
  BadRequestException,
} from '@nestjs/common';
import { BabyOpsApi } from '../services/baby-ops.service';
import { SecretConfigService } from '../secrets/secrets.service';
import { Response } from 'express';
import { TokenClassBody } from '@gala-chain/api';
import { ProfileService } from '../services/profile.service';

@Controller('api/wallet')
export class WalletController {
  constructor(
    private tokenService: BabyOpsApi,
    private secretsService: SecretConfigService,
    private profileService: ProfileService,
  ) {}

  @Get('generateWallet')
  async generateWallet(@Res() res: Response) {
    try {
      const registrationEndpoint = await this.secretsService.getSecret(
        'REGISTRATION_ENDPOINT',
      );
      const wallet =
        await this.tokenService.createRandomWallet(registrationEndpoint);
      res.status(HttpStatus.OK).json(wallet);
    } catch (error) {
      console.error(error);
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Failed to create wallet' });
    }
  }

  @Get('giveaway-wallet-balances/:gcAddress')
  async getAdminBalances(@Param('gcAddress') gcAddress: string) {
    try {
      const userInfo = await this.profileService.findProfileByGC(gcAddress);
      const balances = await this.tokenService.fetchBalances(
        userInfo.giveawayWalletAddress,
      );
      return balances;
    } catch (error) {
      console.error(error);
      throw new BadRequestException(
        `Failed to fetch balances, error: ${error}`,
      );
    }
  }

  @Get('admin-allowance/:gcAddress')
  async getAdminAllowances(@Param('gcAddress') gcAddress: string) {
    try {
      const userInfo = await this.profileService.findProfileByGC(gcAddress);

      const balances = await this.tokenService.fetchAllowances(
        userInfo.giveawayWalletAddress,
      );
      return balances;
    } catch (error) {
      console.error(error);
      throw new BadRequestException('Failed to fetch balances');
    }
  }

  @Post('allowance-available/:gcAddress')
  async getAllowanceAvailable(
    @Param('gcAddress') gcAddress: string,
    @Body() tokenClass: TokenClassBody,
  ) {
    const userInfo = await this.profileService.findProfileByGC(gcAddress);
    return this.tokenService.getTotalAllowanceQuantity(
      userInfo.giveawayWalletAddress,
      userInfo.id,
      tokenClass,
    );
  }
}
