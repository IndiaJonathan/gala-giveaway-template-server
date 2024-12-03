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
} from '@nestjs/common';
import { ProfileService } from '../services/profile.service';
import { LinkDto } from '../dtos/profile.dto';
import { APP_SECRETS } from '../secrets/secrets.module';
import { GiveawayService } from '../giveway-module/giveaway.service';
import { SignatureService } from '../signature.service';

@Controller('api/profile')
export class ProfileController {
  constructor(
    private profileService: ProfileService,
    private giveawayService: GiveawayService,
    @Inject(APP_SECRETS) private secrets: Record<string, any>,
    @Inject(SignatureService) private signatureService: SignatureService,
  ) {}

  @Get('info/:gcAddress')
  async getProfile(@Param('gcAddress') gcAddress) {
    const profile = await this.profileService.getSafeUserByGC(gcAddress, true);
    const claimableWins =
      await this.giveawayService.getClaimableWins(gcAddress);
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
        true,
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
}
