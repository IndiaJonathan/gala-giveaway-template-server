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
    endDateTime,
    telegramAuthRequired: false,
    requireBurnTokenToClaim: false,
    giveawayType: 'DistributedGiveway',
    giveawayToken: {
      additionalKey: 'none',
      category: 'Unit',
      collection: 'GALA',
      type: 'none',
    },
    maxWinners: '1',
    tokenQuantity: '1',
    prefix: '\u0019Ethereum Signed Message:\n346',
  };

  const startBalanceGiveaway = {
    ...startGiveaway,
    giveawayTokenType: GiveawayTokenType.BALANCE,
  };

  it('should fail create a giveaway when gas balance is low', async () => {
    const wallet = await WalletUtils.createAndRegisterRandomWallet(
      secrets['REGISTRATION_ENDPOINT'],
    );

    const profile = await profileService.createProfile(wallet.ethAddress);

    mockGalachainApi.grantBalanceForToken(
      profile.giveawayWalletAddress,
      {
        additionalKey: 'none',
        category: 'Unit',
        collection: 'GALA',
        type: 'none',
      } as any,
      55,
    );

    const signer = new SigningClient(wallet.privateKey);
    const signedPayload = await signer.sign('Start Giveaway', {
      ...startBalanceGiveaway,
      maxWinners: 10,
      tokenQuantity: 5,
    });

    return await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect({
        success: false,
        message: 'Failed to start giveaway',
        error: {
          response: {
            message:
              'Insuffucient GALA balance in Giveway wallet, need additional 5',
            error: 'Bad Request',
            statusCode: 400,
          },
          status: 400,
          options: {},
          message:
            'Insuffucient GALA balance in Giveway wallet, need additional 5',
          name: 'BadRequestException',
        },
      })
      .expect(400);
  });

  it('should create a giveaway', async () => {
    const wallet = await WalletUtils.createAndRegisterRandomWallet(
      secrets['REGISTRATION_ENDPOINT'],
    );

    const profile = await profileService.createProfile(wallet.ethAddress);

    mockGalachainApi.grantBalanceForToken(
      profile.giveawayWalletAddress,
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
      startBalanceGiveaway,
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

    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      GALA_TOKEN,
      2,
    );

    const signedPayload = await giveawayCreatorSigner.sign(
      'Start Giveaway',
      startBalanceGiveaway,
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
      uniqueKey: `giveaway-signup-${new Date()}`,
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

  it('should not work for a giveaway if balance is tied up in other giveaways', async () => {
    const { profile: giveawayCreatorProfile, signer: giveawayCreatorSigner } =
      await createUser();

    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      GALA_TOKEN,
      3,
    );

    const signedPayload = await giveawayCreatorSigner.sign('Start Giveaway', {
      ...startBalanceGiveaway,
      tokenQuantity: 2,
    });

    await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect((res) => {
        expect(res.body).toMatchObject({ success: true });
      })
      .expect(201);

    const signedPayload2 = await giveawayCreatorSigner.sign('Start Giveaway', {
      ...startBalanceGiveaway,
      tokenQuantity: 1,
    });

    await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload2)
      .expect((res) => {
        expect(res.body).toMatchObject({ success: false });
      })
      .expect(400);
  });

  it('should fail for a giveaway if gas fees are tied up in a giveaway using GALA', async () => {
    const { profile: giveawayCreatorProfile, signer: giveawayCreatorSigner } =
      await createUser();

    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      GALA_TOKEN,
      3,
    );

    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      { ...GALA_TOKEN, collection: 'GALA2' },
      3,
    );

    const signedPayload = await giveawayCreatorSigner.sign('Start Giveaway', {
      ...startBalanceGiveaway,
      tokenQuantity: 2,
    });

    await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect((res) => {
        expect(res.body).toMatchObject({ success: true });
      })
      .expect(201);

    const signedPayload2 = await giveawayCreatorSigner.sign('Start Giveaway', {
      ...startBalanceGiveaway,
      tokenQuantity: 2,
      giveawayToken: { ...GALA_TOKEN, collection: 'GALA2' }, //electric boogaloo
    });

    await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload2)
      .expect((res) => {
        expect(res.body).toMatchObject({ success: false });
      })
      .expect(400);
  });

  it('should work for a giveaway if balance is tied up in an unrelated escrow', async () => {
    const { profile: giveawayCreatorProfile, signer: giveawayCreatorSigner } =
      await createUser();

    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      GALA_TOKEN,
      4,
    );

    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      { ...GALA_TOKEN, collection: 'GALA2' },
      3,
    );

    const signedPayload = await giveawayCreatorSigner.sign('Start Giveaway', {
      ...startBalanceGiveaway,
      tokenQuantity: 2,
    });

    await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect((res) => {
        expect(res.body).toMatchObject({ success: true });
      })
      .expect(201);

    const signedPayload2 = await giveawayCreatorSigner.sign('Start Giveaway', {
      ...startBalanceGiveaway,
      tokenQuantity: 2,
      giveawayToken: { ...GALA_TOKEN, collection: 'GALA2' }, //electric boogaloo
    });

    await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload2)
      .expect((res) => {
        expect(res.body).toMatchObject({ success: true });
      })
      .expect(201);
  });

  it('should be unable to create a balance giveaway with insuffucient balance', async () => {
    const { profile: giveawayCreatorProfile, signer: giveawayCreatorSigner } =
      await createUser();

    mockGalachainApi.grantAllowancesForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      giveawayCreatorProfile.galaChainAddress,
      GALA_TOKEN,
      50,
    );

    const signedPayload = await giveawayCreatorSigner.sign(
      'Start Giveaway',
      startBalanceGiveaway,
    );

    await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(400)
      .expect({
        success: false,
        message: 'Failed to start giveaway',
        error: {
          response: {
            message:
              'You need to transfer more tokens before you can start this giveaway. Need an additional 1',
            error: 'Bad Request',
            statusCode: 400,
          },
          status: 400,
          options: {},
          message:
            'You need to transfer more tokens before you can start this giveaway. Need an additional 1',
          name: 'BadRequestException',
        },
      });
  });

  it('should be able to create and win a balance giveaway', async () => {
    const { profile: giveawayCreatorProfile, signer: giveawayCreatorSigner } =
      await createUser();

    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      GALA_TOKEN,
      50,
    );

    const signedPayload = await giveawayCreatorSigner.sign(
      'Start Giveaway',
      startBalanceGiveaway,
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
      uniqueKey: `giveaway-signup-${new Date()}`,
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
