import { Module } from '@nestjs/common';
import { SecretConfigService } from './secrets.service';

export const APP_SECRETS = 'APP_SECRETS';

@Module({
  providers: [
    SecretConfigService,
    {
      provide: APP_SECRETS,
      inject: [SecretConfigService],
      useFactory: async (secretConfigService: SecretConfigService) => {
        return secretConfigService.getSecret();
      },
    },
  ],
  exports: [APP_SECRETS],
})
export class SecretConfigModule {}
