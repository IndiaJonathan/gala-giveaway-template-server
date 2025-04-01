import {
  Controller,
  Get,
  Res,
  HttpStatus,
  Post,
  Body,
  Inject,
} from '@nestjs/common';
import { GalachainApi } from '../web3-module/galachain.api';
import { Response } from 'express';
import { APP_SECRETS } from '../secrets/secrets.module';
import { RegisterWalletDto } from '../dtos/RegisterWallet.dto';
import { WalletUtils } from '@gala-chain/connect';
import { recoverPublicKeyFromSignature } from '../utils/web3wallet';

@Controller('api/wallet')
export class WalletController {
  constructor(
    private tokenService: GalachainApi,
    @Inject(APP_SECRETS) private secrets: Record<string, any>,
  ) {}

  @Post('register')
  async registerWallet(@Body() registerWalletDto: RegisterWalletDto) {
    const registrationEndpoint = await this.secrets['REGISTRATION_ENDPOINT'];
    const publicKey = recoverPublicKeyFromSignature(registerWalletDto.payload);

    const registerWallet = await WalletUtils.registerWallet(
      registrationEndpoint,
      '0x' + publicKey,
    );
    const registerWallet2 = await WalletUtils.registerWallet(
      registrationEndpoint,
      publicKey,
    );
    return registerWallet;
  }

  @Get('generateWallet')
  async generateWallet(@Res() res: Response) {
    try {
      const registrationEndpoint = await this.secrets['REGISTRATION_ENDPOINT'];

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
}
