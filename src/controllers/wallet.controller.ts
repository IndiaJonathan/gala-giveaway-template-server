import { Controller, Get, Res, HttpStatus, Post, Body } from '@nestjs/common';
import { BabyOpsApi } from '../services/token.service';
import { SecretConfigService } from '../services/secrets.service';
import { Response } from 'express';
import { GrantAllowanceParams } from '@gala-chain/api';

@Controller('api')
export class WalletController {
  constructor(
    private tokenService: BabyOpsApi,
    private secretsService: SecretConfigService,
  ) {}

  @Get('adminWallet')
  async getAdminWalletAddress() {
    return this.tokenService.getAdminWalletInfo();
  }

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

  @Get('admin-balances')
  async getAdminBalances(@Res() res: Response) {
    try {
      const walletAddress = this.tokenService.client.walletAddress.replace(
        '0x',
        'eth|',
      );
      const balances = await this.tokenService.fetchBalances(walletAddress);
      res.status(HttpStatus.OK).json(balances);
    } catch (error) {
      console.error(error);
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ error: 'Failed to fetch balances' });
    }
  }

  @Post('grant-allowance')
  async grantAllowance(
    @Body() allowanceParams: GrantAllowanceParams,
    @Res() res: Response,
  ) {
    try {
      return this.tokenService.grantAllowance(allowanceParams);
    } catch (error) {
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ success: false, message: 'Failed to grant allowance', error });
    }
  }
}
