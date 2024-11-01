import { MongooseModule } from '@nestjs/mongoose';
import { GiveawaySchema } from '../schemas/giveaway.schema';
import { ProfileSchema } from '../schemas/ProfileSchema';
import { APP_SECRETS, SecretConfigModule } from '../secrets/secrets.module';
import { Module } from '@nestjs/common';

@Module({
  imports: [
    MongooseModule.forRootAsync({
      imports: [SecretConfigModule],
      inject: [APP_SECRETS],
      useFactory: async (secrets: Record<string, any>) => {
        const MONGO_URI = await secrets['MONGO_URI'];
        const DB = await secrets['DB'];

        return {
          uri: MONGO_URI,
          dbName: DB,
          ssl: true,
          sslValidate: false,
          useNewUrlParser: true,
          useUnifiedTopology: true,
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
