import { Test } from '@nestjs/testing';
import { INestApplication, Provider, ValidationPipe } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { addDefaultMocks } from './test-utils';
import { GiveawayModule } from '../src/giveway-module/giveaway.module';
import { Web3Module } from '../src/web3-module/web3.module';
import { MONGO_CLIENT_PROVIDER } from './mocks/mongo.providers';
import request from 'supertest';
import { ProfileService } from '../src/profile-module/profile.service';
import { SigningClient, WalletUtils } from '@gala-chain/connect';
import { APP_SECRETS } from '../src/secrets/secrets.module';
import { MockGalachainApi } from './mocks/mock-galachain.api';
import { GalachainApi } from '../src/web3-module/galachain.api';
import { GALA_TOKEN } from '../src/constant';
import { GivewayScheduler } from '../src/giveway-module/giveway-scheduler.service';
import { GiveawayDocument } from '../src/schemas/giveaway.schema';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { GiveawayTokenType } from '../src/dtos/giveaway.dto';

jest.setTimeout(50000);
describe('FCFS Win Entry Test', () => {
  let app: INestApplication;
  let memoryServer: MongoMemoryServer;
  let profileService: ProfileService;
  let mockGalachainApi: MockGalachainApi;
  let giveawayScheduler: GivewayScheduler;
  let galachainApi: GalachainApi;
  let giveawayModel: Model<GiveawayDocument>;
  let secrets: Record<string, any>;

  beforeEach(async () => {
    const dbPlaceHolder: Provider = {
      provide: MONGO_CLIENT_PROVIDER,
      useValue: null,
    };

    const moduleBuilder = Test.createTestingModule({
      imports: [Web3Module, GiveawayModule],
      providers: [dbPlaceHolder],
    });

    const moduleFixture = await addDefaultMocks(moduleBuilder);

    const compiledFixture = await moduleFixture.compile();
    app = compiledFixture.createNestApplication();

    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        transform: true,
      }),
    );

    await app.init();
    memoryServer = app.get<MongoMemoryServer>(MONGO_CLIENT_PROVIDER);
    profileService = await app.resolve<ProfileService>(ProfileService);
    mockGalachainApi = await app.resolve<MockGalachainApi>(GalachainApi);
    secrets = await app.resolve<Record<string, any>>(APP_SECRETS);
    giveawayScheduler = await app.resolve<GivewayScheduler>(GivewayScheduler);
    galachainApi = await app.resolve<GalachainApi>(GalachainApi);
    giveawayModel = await app.resolve<Model<GiveawayDocument>>(
      getModelToken('Giveaway'),
    );
  });

  it('should create a Win entry in the database when claiming an FCFS giveaway', async () => {
    const currentDate = new Date();
    const endDate = new Date(currentDate);
    endDate.setDate(currentDate.getDate() + 1);
    const endDateTime = endDate.toISOString();

    // Create a giveaway creator
    const wallet = await WalletUtils.createAndRegisterRandomWallet(
      secrets['REGISTRATION_ENDPOINT'],
    );
    const profile = await profileService.createProfile(wallet.ethAddress);
    const signer = new SigningClient(wallet.privateKey);

    // Grant tokens to the creator's giveaway wallet
    mockGalachainApi.grantBalanceForToken(
      profile.giveawayWalletAddress,
      GALA_TOKEN,
      50,
    );

    // Prepare a FCFS giveaway
    const fcfsGiveaway = {
      endDateTime,
      telegramAuthRequired: false,
      requireBurnTokenToClaim: false,
      giveawayType: 'FirstComeFirstServe',
      giveawayToken: {
        additionalKey: 'none',
        category: 'Unit',
        collection: 'GALA',
        type: 'none',
      },
      giveawayTokenType: GiveawayTokenType.BALANCE,
      claimPerUser: 2,
      maxWinners: 5,
      prefix: '\u0019Ethereum Signed Message:\n346',
    };

    const signedPayload = await signer.sign('Start Giveaway', fcfsGiveaway);

    // Create FCFS giveaway
    const createRes = await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(201);

    expect(createRes.body.success).toBe(true);
    const giveawayId = createRes.body.giveaway._id;

    // Create a user to claim the giveaway
    const userWallet = await WalletUtils.createAndRegisterRandomWallet(
      secrets['REGISTRATION_ENDPOINT'],
    );
    const userProfile = await profileService.createProfile(userWallet.ethAddress);
    const userSigner = new SigningClient(userWallet.privateKey);

    // User claims the FCFS giveaway
    const claimFCFSData = {
      giveawayId,
      tokenInstances: [],
    };

    const claimPayload = await userSigner.sign('Start FCFS Claim', claimFCFSData);

    await request(app.getHttpServer())
      .post('/api/giveaway/fcfs/claim')
      .set('Content-Type', 'application/json')
      .send(claimPayload)
      .expect(201);

    // Verify a win entry was created in the database
    const winModel = app.get(getModelToken('Win'));
    const winEntries = await winModel
      .find({
        gcAddress: userProfile.galaChainAddress,
        giveaway: giveawayId,
      })
      .exec();

    expect(winEntries.length).toBe(1);
    expect(winEntries[0].amountWon).toBe(fcfsGiveaway.claimPerUser);
    expect(winEntries[0].claimed).toBe(false);
  });

  afterEach(async () => {
    try {
      await memoryServer.stop();
      await app.close();
    } catch (e) {
      console.error(e);
    }
  });
}); 