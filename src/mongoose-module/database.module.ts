import { MongooseModule } from '@nestjs/mongoose';
import { GiveawaySchema } from '../schemas/giveaway.schema';
import { ProfileSchema } from '../schemas/ProfileSchema';
import { SecretConfigModule } from '../secrets/secrets.module';
import { SecretConfigService } from '../secrets/secrets.service';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [SecretConfigModule],
      inject: [SecretConfigService],
      useFactory: async (secretsService: SecretConfigService) => {
        const MONGO_URI = await secretsService.getSecret('MONGO_URI');
        const DB = await secretsService.getSecret('DB');

        return {
          uri: MONGO_URI,
          dbName: DB,
        };
      },
    }),

    MongooseModule.forFeature([
      { name: 'Profile', schema: ProfileSchema },
      { name: 'Giveaway', schema: GiveawaySchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
