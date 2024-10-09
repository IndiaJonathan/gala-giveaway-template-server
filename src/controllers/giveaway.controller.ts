import { Body, Controller, Get, Post, Res, HttpStatus } from '@nestjs/common';
import { Response } from 'express';
import { GiveawayDto } from '../dtos/giveaway.dto';
import { GiveawayService } from '../services/giveaway.service';
import { signatures } from '@gala-chain/api';

@Controller('api/giveaway')
export class GiveawayController {
  constructor(private readonly giveawayService: GiveawayService) {}

  @Post('start')
  async startGiveaway(@Body() giveawayDto: GiveawayDto, @Res() res: Response) {
    try {
      const publicKey = signatures.recoverPublicKey(
        giveawayDto.signature,
        giveawayDto,
        '',
      );
      console.log(publicKey);
      console.log(signatures.getCompactBase64PublicKey(publicKey));
      //Verify the user is who they say they are
      const createdGiveaway =
        await this.giveawayService.createGiveaway(giveawayDto);
      res
        .status(HttpStatus.OK)
        .json({ success: true, giveaway: createdGiveaway });
    } catch (error) {
      res
        .status(HttpStatus.BAD_REQUEST)
        .json({ success: false, message: 'Failed to start giveaway', error });
    }
  }

  @Get('all')
  async getAllGiveaways(@Res() res: Response) {
    try {
      const giveaways = await this.giveawayService.findAll();
      res.status(HttpStatus.OK).json({ success: true, giveaways });
    } catch (error) {
      res.status(HttpStatus.BAD_REQUEST).json({
        success: false,
        message: 'Failed to retrieve giveaways',
        error,
      });
    }
  }
}
