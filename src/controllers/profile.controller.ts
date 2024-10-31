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
} from '@nestjs/common';
import { BabyOpsApi } from '../services/baby-ops.service';
import { SecretConfigService } from '../secrets/secrets.service';
import { signatures } from '@gala-chain/api';
import { ProfileService } from '../services/profile.service';
import { LinkDto } from '../dtos/profile.dto';

@Controller('api/profile')
export class ProfileController {
  constructor(
    private tokenService: BabyOpsApi,
    private secretsService: SecretConfigService,
    private profileService: ProfileService,
  ) {}

  @Get('info/:gcAddress')
  async getProfile(@Param('gcAddress') gcAddress) {
    return this.profileService.getSafeUserByGC(gcAddress, true);
  }

  @Post('link-accounts')
  async linkAccounts(@Body() linkDto: LinkDto) {
    const botToken = await this.secretsService.getSecret('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      throw new HttpException(
        { success: false, message: 'Bot token not configured' },
        HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }

    const publicKey = signatures.recoverPublicKey(
      linkDto.signature,
      linkDto,
      '',
    );

    // Construct GalaChain address from the Ethereum public key
    const gc_address = 'eth|' + signatures.getEthAddress(publicKey);

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
