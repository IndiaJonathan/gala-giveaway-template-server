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
  UsePipes,
  ValidationPipe,
  Inject,
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
import { SignatureService } from '../signature.service';
import { ClaimFCFSRequestDTO } from '../dtos/ClaimFCFSGiveaway';

@Controller('api/giveaway')
export class GiveawayController {
  constructor(
    private readonly giveawayService: GiveawayService,
    private tokenService: BabyOpsApi,
    private profileService: ProfileService,
    @Inject(SignatureService) private signatureService: SignatureService,
  ) {}

  @Post('start')
  @UsePipes(new ValidationPipe({ transform: true, whitelist: true }))
  async startGiveaway(@Body() giveawayDto: GiveawayDto, @Res() res: Response) {
    try {
      const publicKey = signatures.recoverPublicKey(
        giveawayDto.signature,
        giveawayDto,
        '',
      );

      const gc_address = 'eth|' + signatures.getEthAddress(publicKey);

      const account = await this.profileService.findProfileByGC(gc_address);

      const availableTokens =
        await this.giveawayService.getTotalAllowanceQuantity(
          account.giveawayWalletAddress,
          account.id,
          giveawayDto.giveawayToken,
        );

      if (giveawayDto.giveawayType === 'DistributedGiveway') {
        if (
          BigNumber(availableTokens.totalQuantity).minus(
            BigNumber(giveawayDto.tokenQuantity),
          ) < BigNumber(0)
        ) {
          throw new UnauthorizedException(
            'You need to grant more tokens before you can start this giveaway',
          );
        }
      } else {
        if (
          BigNumber(availableTokens.totalQuantity).minus(
            BigNumber(giveawayDto.claimPerUser).multipliedBy(
              giveawayDto.maxWinners,
            ),
          ) < BigNumber(0)
        ) {
          throw new UnauthorizedException(
            'You need to grant more tokens before you can start this giveaway',
          );
        }
      }

      //todo: ADD this back

      // const dryRunResult = await this.giveawayService.getGiveawayEstimatedFee(
      //   gc_address,
      //   giveawayDto.giveawayToken,
      // );

      // if (
      //   dryRunResult.Status !== 1 ||
      //   dryRunResult.Data.response.Status !== 1
      // ) {
      //   throw dryRunResult;
      // }

      // if (
      //   dryRunResult.Status !== 1 ||
      //   dryRunResult.Data.response.Status !== 1
      // ) {
      //   throw dryRunResult;
      // }

      const balances = await this.tokenService.getBalancesForToken(
        account.giveawayWalletAddress,
        {
          additionalKey: 'none',
          category: 'Unit',
          collection: 'GALA',
          type: 'none',
        } as any,
      );

      //todo: account for locks
      const galaBalance = balances.Data.reduce((total, item) => {
        return total.plus(item.quantity);
      }, new BigNumber(0));

      const extraAmount =
        this.giveawayService.getRequiredGalaFeeForGiveaway(giveawayDto);

      const currentRequirement =
        await this.giveawayService.getTotalGalaFeesRequired(account.id);

      const net = galaBalance.minus(extraAmount.plus(currentRequirement));
      //todo: unhardcode this from 1, use dry run
      if (net.lt(0)) {
        throw new BadRequestException(
          `Insuffucient GALA balance in Giveway wallet, need additional ${net.multipliedBy(-1)}`,
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
    const signupResult = await this.giveawayService.signupUserForDistributed(
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

  @Post('fcfs/claim')
  async claimFCFS(@Body() giveawayDto: ClaimFCFSRequestDTO) {
    const gc_address = this.signatureService.validateSignature(giveawayDto);
    return this.giveawayService.claimFCFS(giveawayDto, gc_address);
  }

  @Post('randomgiveaway/claim')
  async claimWin(
    @Body() giveawayDto: BurnTokensRequestDto,
    @Res() res: Response,
  ) {
    try {
      const claimableWin = await this.giveawayService.getClaimableWin(
        giveawayDto.claimId,
      );

      if (!claimableWin)
        // const gc_address = 'eth|' + signatures.getEthAddress();
        throw new NotFoundException(
          `Cannot find claimable giveway with this id: ${giveawayDto.claimId}`,
        );
      if (claimableWin.claimed) {
        throw new BadRequestException(`Giveaway already claimed`);
      }

      const gc_address = this.signatureService.validateSignature(giveawayDto);

      const profile = await this.profileService.findProfileByGC(gc_address);

      if (claimableWin.gcAddress !== profile.galaChainAddress) {
        throw new BadRequestException(
          'This GC address does not have an unclaimed win available',
        );
      }

      //todo: handle if already burnt
      const result = await this.tokenService.burnToken(giveawayDto);
      console.log(result);
      if (result.Status === 1) {
        //Good to go
        claimableWin.claimInfo = JSON.stringify(result);
        const mintToken = await this.giveawayService.sendWinnings(
          profile.galaChainAddress,
          new BigNumber(claimableWin.amountWon),
          claimableWin.giveaway,
        );
        if (mintToken.Status === 1) {
          claimableWin.claimed = true;
          return await claimableWin.save();
        } else {
          console.error(
            `Unable to mint, here is the dto: ${JSON.stringify(mintToken)}`,
          );
          return;
        }
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
      const giveaways = await this.giveawayService.getGiveaways();
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
