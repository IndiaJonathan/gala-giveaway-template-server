import { Module } from '@nestjs/common';
import { SecretConfigService } from './secrets.service';

@Module({
  providers: [SecretConfigService],
  exports: [SecretConfigService],
})
export class SecretConfigModule {}
