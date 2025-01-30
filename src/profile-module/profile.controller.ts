import {
  Controller,
  Get,
  HttpStatus,
  Post,
  Body,
  UnauthorizedException,
  HttpException,
  Param,
  ConflictException,
  Inject,
  BadRequestException,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { LinkDto } from '../dtos/profile.dto';
import { APP_SECRETS } from '../secrets/secrets.module';
import { GiveawayService } from '../giveway-module/giveaway.service';
import { SignatureService } from '../signature.service';
import { GalachainApi } from '../web3-module/galachain.api';
import { isAddress } from 'ethers';

@Controller('api/profile')
export class ProfileController {
  constructor(
    private profileService: ProfileService,
    private giveawayService: GiveawayService,
    @Inject(APP_SECRETS) private secrets: Record<string, any>,
    @Inject(SignatureService) private signatureService: SignatureService,
    @Inject(GalachainApi) private galachainApi: GalachainApi,
    private tokenService: GalachainApi,
  ) {}

  @Get('info/isRegistered')
  async getIsRegistered(@Param('address') address) {
    const isRegistered = this.galachainApi.isRegistered(address);
    return isRegistered;
  }

  @Get('info/:ethAddress')
  async getProfile(@Param('ethAddress') ethAddress) {
    if (!isAddress(ethAddress)) {
      throw new BadRequestException(
        'Invalid Ethereum address. Address must be a valid Ethereum address format.',
      );
    }
    const profile = await this.profileService.getSafeUserByEth(
      ethAddress,
      true,
    );
    const claimableWins = await this.giveawayService.getClaimableWins(
      profile.galaChainAddress,
    );
    return {
      ...profile,
      claimableWins,
    };
  }

  @Post('link-accounts')
  async linkAccounts(@Body() linkDto: LinkDto) {
    const botToken = await this.secrets['TELEGRAM_BOT_TOKEN'];

    if (!botToken) {
      throw new HttpException(
        { success: false, message: 'Bot token not configured' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const gc_address = this.signatureService.validateSignature(linkDto);

    // Validate if the GalaChain address matches
    if (gc_address !== linkDto['GalaChain Address']) {
      throw new UnauthorizedException(
        "GalaChain address and signature don't match",
      );
    }

    // Validate Telegram authorization
    const isTelegramValid = this.profileService.checkTelegramAuthorization(
      linkDto,
      botToken,
    );

    // If Telegram authorization is valid, create the profile
    if (isTelegramValid) {
      const profile = await this.profileService.findProfileByGC(
        linkDto['GalaChain Address'],
      );
      profile.telegramId = linkDto.id;
      profile.firstName = linkDto.first_name;
      profile.lastName = linkDto.last_name;
      try {
        await profile.save();
      } catch (error) {
        if (error.code === 11000) {
          // Handle duplicate key error (error code 11000 indicates duplicate key violation)
          if (error.message.includes('ethAddress_1')) {
            throw new ConflictException('EthAddress already exists.');
          } else if (error.message.includes('telegramId_1')) {
            throw new ConflictException('TelegramId already exists.');
          } else {
            throw new ConflictException(`Already linked!`);
          }
        }
      }

      return profile;
    } else {
      throw new UnauthorizedException({
        success: false,
        message: 'Invalid authentication data',
      });
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

  @Get('giveaway-wallet-allowances/:gcAddress')
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
}
