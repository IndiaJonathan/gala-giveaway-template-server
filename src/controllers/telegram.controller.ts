import { Controller, Post, Body, Res, HttpStatus } from '@nestjs/common';
import * as crypto from 'crypto';
import { SecretConfigService } from '../services/secrets.service';
import { Response } from 'express';

@Controller('api')
export class TelegramController {
  constructor(private secretsService: SecretConfigService) {}

  private checkTelegramAuthorization(authData: any, botToken: string): boolean {
    const checkHash = authData.result.hash;
    if (!checkHash) return false;

    const data = { ...authData.result };
    delete data.hash;

    const dataCheckArr = Object.keys(data)
      .map((key) => `${key}=${data[key]}`)
      .sort();
    const dataCheckString = dataCheckArr.join('\n');

    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const hmac = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    return hmac === checkHash;
  }

  @Post('verify-telegram-auth')
  async verifyTelegramAuth(@Body() telegramData: any, @Res() res: Response) {
    const botToken = await this.secretsService.getSecret('TELEGRAM_BOT_TOKEN');

    if (!botToken) {
      res
        .status(HttpStatus.INTERNAL_SERVER_ERROR)
        .json({ success: false, message: 'Bot token not configured' });
    }

    const isValid = this.checkTelegramAuthorization(telegramData, botToken);
    if (isValid) {
      res.cookie(
        'telegramUser',
        {
          id: telegramData.id,
          firstName: telegramData.first_name,
        },
        { httpOnly: true, secure: true },
      );

      res.json({ success: true });
    } else {
      res
        .status(HttpStatus.UNAUTHORIZED)
        .json({ success: false, message: 'Invalid authentication data' });
    }
  }
}
