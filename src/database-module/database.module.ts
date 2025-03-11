import { MongooseModule } from '@nestjs/mongoose';
import { GiveawaySchema } from '../schemas/giveaway.schema';
import { ProfileSchema } from '../schemas/ProfileSchema';
import { APP_SECRETS, SecretConfigModule } from '../secrets/secrets.module';
import { Module } from '@nestjs/common';
import { WinSchema } from '../schemas/ClaimableWin.schema';
import { PaymentStatusSchema } from '../schemas/PaymentStatusSchema';

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
        };
      },
    }),

    MongooseModule.forFeature([
      { name: 'Profile', schema: ProfileSchema },
      { name: 'Giveaway', schema: GiveawaySchema },
      { name: 'Win', schema: WinSchema },
      { name: 'PaymentStatus', schema: PaymentStatusSchema },
    ]),
  ],
  exports: [MongooseModule],
})
export class DatabaseModule {}
