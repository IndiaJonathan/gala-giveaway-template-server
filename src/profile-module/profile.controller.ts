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
  NotFoundException,
} from '@nestjs/common';
import { ProfileService } from './profile.service';
import { APP_SECRETS } from '../secrets/secrets.module';
import { GiveawayService } from '../giveway-module/giveaway.service';
import { GalachainApi } from '../web3-module/galachain.api';
import { isAddress } from 'ethers';
import { validateSignature } from '../utils/web3wallet';
import { filterGiveawaysData } from '../utils/giveaway-utils';
import { LinkDto } from '../dtos/profile.dto';
import { TokenBalance } from '@gala-chain/connect';
import { tokenToReadable } from '../chain.helper';

@Controller('api/profile')
export class ProfileController {
  constructor(
    private profileService: ProfileService,
    private giveawayService: GiveawayService,
    @Inject(APP_SECRETS) private secrets: Record<string, any>,
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

  @Get('balances/:ethAddress')
  async getBalances(@Param('ethAddress') ethAddress: string) {
    const userInfo = await this.profileService.findProfileByEth(ethAddress);
    const giveawayWalletBalances = await this.tokenService.fetchBalances(
      userInfo.giveawayWalletAddress,
    );

    const userBalances = await this.tokenService.fetchBalances(
      userInfo.galaChainAddress,
    );

    const requiredEscrow = await this.giveawayService.getRequiredEscrow(
      userInfo.id,
    );
    

    const escrowAllowances = await this.tokenService.getAllowances(userInfo.giveawayWalletAddress); 

    // Combine balances and subtract escrow
    const combinedBalances = {};
    
    // Helper function to safely parse quantity
    const parseQuantity = (quantity) => 
      quantity ? parseInt(quantity.toString()) : 0;
    
    // Helper function to add balance to combined map
    const addBalance = (balance: TokenBalance) => {
      
      const tokenId = tokenToReadable(balance);
      const quantity = parseQuantity(balance.quantity);
      
      if (combinedBalances[tokenId]) {
        combinedBalances[tokenId].quantity += quantity;
      } else {
        combinedBalances[tokenId] = {
          quantity,
          token: tokenId,
          additionalKey: balance.additionalKey,
          category: balance.category,
          collection: balance.collection,
          type: balance.type,
        };
      }
    };
    
    // Process user and giveaway balances
    if (userBalances && userBalances.Data &&Array.isArray(userBalances.Data)) {
      userBalances.Data.forEach(addBalance);
    }
    
    if (giveawayWalletBalances && giveawayWalletBalances.Data && Array.isArray(giveawayWalletBalances.Data)) {
      giveawayWalletBalances.Data.forEach(addBalance);
    }
    
    // Subtract required escrow amounts
    if (requiredEscrow && Array.isArray(requiredEscrow)) {
      requiredEscrow.forEach(escrow => {
        if (escrow && escrow.quantity) {
          const tokenId = tokenToReadable(escrow);
          const escrowQuantity = parseQuantity(escrow.quantity);
          
          if (combinedBalances[tokenId]) {
            combinedBalances[tokenId].quantity -= escrowQuantity;
            combinedBalances[tokenId].escrowAmount = escrowQuantity;
          }
        }
      });
    }

    return {
      availableBalances: Object.values(combinedBalances),
      giveawayWalletBalances,
      userBalances,
      requiredEscrow,
      escrowAllowances,
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

    const gc_address = validateSignature(linkDto);

    // Validate if the GalaChain address matches
    if (gc_address !== linkDto['GalaChain Address']) {
      throw new UnauthorizedException(
        "GalaChain address and signature don't match",
      );
    }

    // Create a Telegram user object from LinkDto properties
    const telegramUser = {
      id: linkDto['Telegram User ID'],
      first_name: linkDto['Telegram First Name'],
      auth_date: linkDto['Telegram Auth Date'],
      hash: linkDto['Telegram Hash'],
      ...(linkDto['Telegram Last Name'] && {
        last_name: linkDto['Telegram Last Name'],
      }),
      ...(linkDto['Telegram Username'] && {
        username: linkDto['Telegram Username'],
      }),
      ...(linkDto['Telegram Photo URL'] && {
        photo_url: linkDto['Telegram Photo URL'],
      }),
    };
    // Validate Telegram authorization
    const isTelegramValid = this.profileService.checkTelegramAuthorization(
      telegramUser,
      botToken,
    );

    // If Telegram authorization is valid, create the profile
    if (isTelegramValid) {
      const profile = await this.profileService.findProfileByGC(
        linkDto['GalaChain Address'],
      );
      profile.telegramId = telegramUser.id.toString();
      profile.firstName = telegramUser.first_name;
      profile.lastName = telegramUser.last_name || null;
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

      const allowances = await this.tokenService.getAllowances(
        userInfo.giveawayWalletAddress,
      );
      return allowances;
    } catch (error) {
      console.error(error);
      throw new BadRequestException('Failed to fetch balances');
    }
  }

  /**
   * Get all giveaways created by a user
   * @param gcAddress The GalaChain address of the user
   * @returns Array of giveaways created by the user
   */
  @Get('created-giveaways/:gcAddress')
  async getCreatedGiveaways(@Param('gcAddress') gcAddress: string) {
    try {
      if (!gcAddress) {
        throw new BadRequestException('GalaChain address is required');
      }

      const giveaways =
        await this.giveawayService.getGiveawaysByCreator(gcAddress);

      // Use the utility function to filter out giveawayErrors
      return filterGiveawaysData(giveaways);
    } catch (error) {
      console.error('Error fetching created giveaways:', error);
      if (error instanceof NotFoundException) {
        throw new NotFoundException(
          `User with GalaChain address ${gcAddress} not found`,
        );
      }
      throw new BadRequestException(
        `Failed to fetch created giveaways: ${error.message}`,
      );
    }
  }
}
