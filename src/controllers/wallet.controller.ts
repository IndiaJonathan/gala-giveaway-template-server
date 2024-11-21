import {
  Controller,
  Get,
  Res,
  HttpStatus,
  Post,
  Body,
  Param,
  BadRequestException,
  Inject,
} from '@nestjs/common';
import { BabyOpsApi } from '../services/baby-ops.service';
import { Response } from 'express';
import { ProfileService } from '../services/profile.service';
import { APP_SECRETS } from '../secrets/secrets.module';
import BigNumber from 'bignumber.js';

@Controller('api/wallet')
export class WalletController {
  constructor(
    private tokenService: BabyOpsApi,
    @Inject(APP_SECRETS) private secrets: Record<string, any>,
    private profileService: ProfileService,
  ) {}

  @Get('generateWallet')
  async generateWallet(@Res() res: Response) {
    try {
      const registrationEndpoint = await this.secrets.getSecret(
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
    @Body() tokenClass: any,
  ) {
    const userInfo = await this.profileService.findProfileByGC(gcAddress);
    const allowances = await this.tokenService.getTotalAllowanceQuantity(
      userInfo.giveawayWalletAddress,
      userInfo.id,
      tokenClass,
    );
    const balances = await this.tokenService.getBalancesForToken(
      userInfo.giveawayWalletAddress,
      {
        additionalKey: 'none',
        category: 'Unit',
        collection: 'GALA',
        type: 'none',
      } as any,
    );

    //todo: account for locks
    const balance = balances.Data.reduce((total, item) => {
      return total.plus(item.quantity);
    }, new BigNumber(0));

    return {
      allowances,
      balances: balance,
      giveawayWallet: userInfo.giveawayWalletAddress,
    };
  }
}
