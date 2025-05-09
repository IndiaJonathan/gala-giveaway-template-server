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
import {
  GiveawayDocument,
  GiveawayStatus,
} from '../src/schemas/giveaway.schema';
import { Model } from 'mongoose';
import { getModelToken } from '@nestjs/mongoose';
import { GiveawayTokenType } from '../src/dtos/giveaway.dto';

jest.setTimeout(50000);
describe('Giveaway Controller (e2e)', () => {
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

  it('should be defined', () => {
    expect(app).toBeDefined();
  });

  const currentDate = new Date();
  const endDate = new Date(currentDate);
  endDate.setDate(currentDate.getDate() + 1);

  const endDateTime = endDate.toISOString();

  const startGiveaway = {
    name: 'Test Allowance Giveaway',
    endDateTime,
    telegramAuthRequired: false,
    requireBurnTokenToClaim: false,
    giveawayType: 'DistributedGiveaway',
    giveawayToken: {
      additionalKey: 'none',
      category: 'Unit',
      collection: 'GALA',
      type: 'none',
    },
    maxWinners: '1',
    winPerUser: '1',
    prefix: '\u0019Ethereum Signed Message:\n346',
    uniqueKey: `giveaway-start-${new Date()}`,
  };

  const startAllowanceGiveaway = {
    ...startGiveaway,
    giveawayTokenType: GiveawayTokenType.ALLOWANCE,
  };

  it('should fail create a giveaway if insuffucient allowances given', async () => {
    const wallet = await WalletUtils.createAndRegisterRandomWallet(
      secrets['REGISTRATION_ENDPOINT'],
    );

    await profileService.createProfile(wallet.ethAddress);

    const signer = new SigningClient(wallet.privateKey);
    const signedPayload = await signer.sign(
      'Start Giveaway',
      startAllowanceGiveaway,
    );

    return await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect((res) => {
        expect(res.body.message).toContain(
          'You need to grant more tokens before you can start this giveaway. Need an additional 1',
        );
      })
      .expect(400);
  });

  it('should fail create a giveaway if time is not at least +1 hour', async () => {
    const wallet = await WalletUtils.createAndRegisterRandomWallet(
      secrets['REGISTRATION_ENDPOINT'],
    );

    const profile = await profileService.createProfile(wallet.ethAddress);

    mockGalachainApi.grantAllowancesForToken(
      profile.giveawayWalletAddress,
      profile.galaChainAddress,
      GALA_TOKEN,
      50,
    );

    mockGalachainApi.grantBalanceForToken(
      profile.giveawayWalletAddress,
      GALA_TOKEN,
      1,
    );

    const signer = new SigningClient(wallet.privateKey);
    const signedPayload = await signer.sign('Start Giveaway', {
      ...startAllowanceGiveaway,
      endDateTime: new Date(), //Override Date
    });

    return await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect((res) => {
        expect(res.body.message).toContain(
          'The endDateTime must be at least one hour in the future.',
        );
      })
      .expect(400);
  });

  it('should fail create a giveaway when gas balance is low', async () => {
    const wallet = await WalletUtils.createAndRegisterRandomWallet(
      secrets['REGISTRATION_ENDPOINT'],
    );

    const profile = await profileService.createProfile(wallet.ethAddress);

    mockGalachainApi.grantAllowancesForToken(
      profile.giveawayWalletAddress,
      profile.galaChainAddress,
      {
        additionalKey: 'none',
        category: 'Unit',
        collection: 'GALA',
        type: 'none',
      } as any,
      50,
    );

    const signer = new SigningClient(wallet.privateKey);
    const signedPayload = await signer.sign(
      'Start Giveaway',
      startAllowanceGiveaway,
    );

    return await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect((res) => {
        expect(res.body.message).toContain(
          'Insuffucient GALA balance in Giveway wallet, need additional 1',
        );
      })
      .expect(400);
  });

  it('should create a giveaway', async () => {
    const wallet = await WalletUtils.createAndRegisterRandomWallet(
      secrets['REGISTRATION_ENDPOINT'],
    );

    const profile = await profileService.createProfile(wallet.ethAddress);

    mockGalachainApi.grantAllowancesForToken(
      profile.giveawayWalletAddress,
      profile.galaChainAddress,
      GALA_TOKEN,
      50,
    );

    mockGalachainApi.grantBalanceForToken(
      profile.giveawayWalletAddress,
      GALA_TOKEN,
      1,
    );

    const signer = new SigningClient(wallet.privateKey);
    const signedPayload = await signer.sign(
      'Start Giveaway',
      startAllowanceGiveaway,
    );

    //No giveaways should exist yet
    await request(app.getHttpServer())
      .get('/api/giveaway/all')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveLength(0);
      });

    //Create giveaway successfully
    await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect((res) => {
        expect(res.body).toMatchObject({ success: true });
      })
      .expect(201);

    //Should exist now when calling all
    return await request(app.getHttpServer())
      .get('/api/giveaway/all')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveLength(1);

        expect(res.body[0]).toMatchObject({
          _id: expect.any(String),
          giveawayStatus: 'created',
        });
      });
  });

  it('should be able to win a giveaway', async () => {
    const { profile: giveawayCreatorProfile, signer: giveawayCreatorSigner } =
      await createUser();

    mockGalachainApi.grantAllowancesForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      giveawayCreatorProfile.galaChainAddress,
      GALA_TOKEN,
      50,
    );

    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      GALA_TOKEN,
      1,
    );

    const signedPayload = await giveawayCreatorSigner.sign(
      'Start Giveaway',
      startAllowanceGiveaway,
    );

    //Create giveaway successfully
    const res = await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect((res) => {
        expect(res.body).toMatchObject({ success: true });
      })
      .expect(201);

    const { profile: giveawayUserProfile, signer: giveawayUserSigner } =
      await createUser();

    const signedSignupPayload = await giveawayUserSigner.sign('Signup', {
      giveawayId: res.body.giveaway._id,
      uniqueKey: 'giveaway-signup',
    });

    await request(app.getHttpServer())
      .post('/api/giveaway/signup')
      .set('Content-Type', 'application/json')
      .send(signedSignupPayload)
      .expect(201);

    let balances = await galachainApi.fetchBalances(
      giveawayUserProfile.galaChainAddress,
    );
    expect(balances.Data.length).toBe(0);

    //Force the giveaway to end (just a test method)
    const ended = await endGiveaway(res.body.giveaway._id);
    expect(ended.acknowledged).toBe(true);

    await giveawayScheduler.handleCron();

    await request(app.getHttpServer())
      .get('/api/giveaway/all')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(200)
      .expect((res) => {
        expect(res.body).toHaveLength(1);

        expect(res.body[0]).toMatchObject({
          _id: expect.any(String),
          giveawayStatus: GiveawayStatus.Completed,
        });
      });

    balances = await galachainApi.fetchBalances(
      giveawayUserProfile.galaChainAddress,
    );
    expect(balances.Data[0].quantity).toBe(1);
  });

  it('should not work for a giveaway if granted allowance is insufficient ', async () => {
    const { profile: giveawayCreatorProfile, signer: giveawayCreatorSigner } =
      await createUser();

    mockGalachainApi.grantAllowancesForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      giveawayCreatorProfile.galaChainAddress,
      GALA_TOKEN,
      1,
    );

    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      GALA_TOKEN,
      1,
    );

    const signedPayload = await giveawayCreatorSigner.sign('Start Giveaway', {
      ...startAllowanceGiveaway,
      winPerUser: '2',
    });

    await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect((res) => {
        expect(res.body).toMatchObject({ success: false });
      })
      .expect(400);
  });

  it('should fail create a giveaway if start and end datetime are less than 10 minutes apart', async () => {
    const wallet = await WalletUtils.createAndRegisterRandomWallet(
      secrets['REGISTRATION_ENDPOINT'],
    );

    const profile = await profileService.createProfile(wallet.ethAddress);

    mockGalachainApi.grantAllowancesForToken(
      profile.giveawayWalletAddress,
      profile.galaChainAddress,
      GALA_TOKEN,
      50,
    );

    mockGalachainApi.grantBalanceForToken(
      profile.giveawayWalletAddress,
      GALA_TOKEN,
      1,
    );

    const currentTime = new Date();
    // Set startDateTime to be one hour in the future
    const startDateTime = new Date(
      currentTime.getTime() + 60 * 60 * 1000,
    ).toISOString();
    // Set endDateTime to be one hour and 5 minutes in the future (only 5 minutes after start)
    const endDateTime = new Date(
      currentTime.getTime() + 65 * 60 * 1000,
    ).toISOString();

    const signer = new SigningClient(wallet.privateKey);
    const signedPayload = await signer.sign('Start Giveaway', {
      ...startAllowanceGiveaway,
      startDateTime,
      endDateTime,
    });

    return await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(400)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe(
          'There must be at least 10 minutes between start and end date.',
        );
      });
  });

  it('should successfully set startDateTime when not provided', async () => {
    const wallet = await WalletUtils.createAndRegisterRandomWallet(
      secrets['REGISTRATION_ENDPOINT'],
    );

    const profile = await profileService.createProfile(wallet.ethAddress);

    mockGalachainApi.grantAllowancesForToken(
      profile.giveawayWalletAddress,
      profile.galaChainAddress,
      GALA_TOKEN,
      50,
    );

    mockGalachainApi.grantBalanceForToken(
      profile.giveawayWalletAddress,
      GALA_TOKEN,
      1,
    );

    const signer = new SigningClient(wallet.privateKey);
    const giveawayWithoutStartDate = {
      ...startAllowanceGiveaway,
      // Explicitly omit startDateTime
    };
    const signedPayload = await signer.sign(
      'Start Giveaway',
      giveawayWithoutStartDate,
    );

    const response = await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(201);

    // Verify the giveaway was created
    expect(response.body.success).toBe(true);
    expect(response.body.giveaway).toBeDefined();

    // Verify startDateTime was set automatically
    const giveawayId = response.body.giveaway._id;
    const savedGiveaway = await giveawayModel.findById(giveawayId).exec();
    expect(savedGiveaway.startDateTime).toBeDefined();
  });

  it('should prevent signup before startDateTime', async () => {
    const { profile: giveawayCreatorProfile, signer: giveawayCreatorSigner } =
      await createUser();

    mockGalachainApi.grantAllowancesForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      giveawayCreatorProfile.galaChainAddress,
      GALA_TOKEN,
      50,
    );

    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      GALA_TOKEN,
      1,
    );

    // Set startDateTime to be 1 hour in the future
    const currentTime = new Date();
    const startDateTime = new Date(
      currentTime.getTime() + 60 * 60 * 1000,
    ).toISOString();
    // Set endDateTime to be 2 hours in the future
    const endDateTime = new Date(
      currentTime.getTime() + 2 * 60 * 60 * 1000,
    ).toISOString();

    const signedPayload = await giveawayCreatorSigner.sign('Start Giveaway', {
      ...startAllowanceGiveaway,
      startDateTime,
      endDateTime,
    });

    // Create giveaway successfully
    const res = await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(201);

    expect(res.body.success).toBe(true);

    const { profile: giveawayUserProfile, signer: giveawayUserSigner } =
      await createUser();

    const signedSignupPayload = await giveawayUserSigner.sign('Signup', {
      giveawayId: res.body.giveaway._id,
      uniqueKey: 'giveaway-signup',
    });

    // Attempt to sign up before start time should fail
    return await request(app.getHttpServer())
      .post('/api/giveaway/signup')
      .set('Content-Type', 'application/json')
      .send(signedSignupPayload)
      .expect(400)
      .expect((res) => {
        expect(res.body.message).toBe('The giveaway has not started yet');
      });
  });

  afterEach(async () => {
    try {
      await memoryServer.stop();
      await app.close();
    } catch (e) {
      console.error(e);
    }
  });

  async function createUser() {
    const giveawayCreatorWallet =
      await WalletUtils.createAndRegisterRandomWallet(
        secrets['REGISTRATION_ENDPOINT'],
      );

    const profile = await profileService.createProfile(
      giveawayCreatorWallet.ethAddress,
    );
    const signer = new SigningClient(giveawayCreatorWallet.privateKey);

    return { profile, signer };
  }

  async function endGiveaway(giveawayId: string) {
    const newEndDate = new Date();
    newEndDate.setDate(newEndDate.getDate() - 10);
    return await giveawayModel.updateOne(
      { _id: giveawayId },
      { $set: { endDateTime: newEndDate } },
    );
  }
});

/**
 *     giveawayWalletAddress: string,
    ownerId: ObjectId,
    tokenClassKey: TokenClassKeyProperties,
    giveawayTokenType: GiveawayTokenType,
 */
