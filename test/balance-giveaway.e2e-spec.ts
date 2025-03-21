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
import { GiveawayService } from '../src/giveway-module/giveaway.service';
import { ObjectId } from 'mongodb';

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
  let giveawayService: GiveawayService;

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
    giveawayService = await app.resolve<GiveawayService>(GiveawayService);
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
    giveawayType: 'DistributedGiveaway',
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

    // Grant sufficient tokens for the distribution but not enough for gas fees
    mockGalachainApi.grantBalanceForToken(
      profile.giveawayWalletAddress,
      {
        additionalKey: 'none',
        category: 'Unit',
        collection: 'TOKEN_FOR_GIVEAWAY', // Use a different token than GALA
        type: 'none',
      } as any,
      100, // Plenty of tokens for distribution
    );

    // Grant very low GALA balance for gas fees
    mockGalachainApi.grantBalanceForToken(
      profile.giveawayWalletAddress,
      {
        additionalKey: 'none',
        category: 'Unit',
        collection: 'GALA',
        type: 'none',
      } as any,
      0.5,
    );

    const signer = new SigningClient(wallet.privateKey);
    const signedPayload = await signer.sign('Start Giveaway', {
      ...startBalanceGiveaway,
      maxWinners: 10,
      tokenQuantity: 5,
      giveawayToken: {
        additionalKey: 'none',
        category: 'Unit',
        collection: 'TOKEN_FOR_GIVEAWAY',
        type: 'none',
      },
    });

    return await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(400)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.message).toBe('Failed to start giveaway');
        expect(res.body.error.response.error).toBe('Bad Request');
        expect(res.body.error.response.message).toContain(
          'Insuffucient GALA balance in Giveway wallet',
        );
        expect(res.body.error.status).toBe(400);
      });
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

  it('should work for a giveaway if balance is not entirely tied up in other giveaways', async () => {
    const { profile: giveawayCreatorProfile, signer: giveawayCreatorSigner } =
      await createUser();

    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      GALA_TOKEN,
      110,
    );

    const signedPayload = await giveawayCreatorSigner.sign('Start Giveaway', {
      ...startBalanceGiveaway,
      tokenQuantity: 10,
      maxWinners: 10,
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
      maxWinners: 2,
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
  it('should not work for a giveaway if balance is partially tied up in other giveaways', async () => {
    const { profile: giveawayCreatorProfile, signer: giveawayCreatorSigner } =
      await createUser();

    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      GALA_TOKEN,
      110,
    );

    const signedPayload = await giveawayCreatorSigner.sign('Start Giveaway', {
      ...startBalanceGiveaway,
      tokenQuantity: 10,
      maxWinners: 10,
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
      tokenQuantity: 3,
      maxWinners: 3,
    });

    await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload2)
      .expect((res) => {
        expect(res.body).toMatchObject({ success: false });
        //Calculation expects 10 * 10 tokens for initial (100), + 1 gas fee, then 3*3 tokens for the new giveaway (9), + 1 gas fee, for a total of 111
        //We only have 110
        expect(res.body.error.response.message).toContain(
          'Insuffucient GALA balance in Giveway wallet, need additional 1',
        );
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

  it('should create a Win entry in the database when claiming an FCFS giveaway', async () => {
    const { profile: giveawayCreatorProfile, signer: giveawayCreatorSigner } =
      await createUser();

    // Grant tokens to the creator's giveaway wallet
    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      GALA_TOKEN,
      50,
    );

    // Prepare a FCFS giveaway
    const fcfsGiveaway = {
      ...startBalanceGiveaway,
      giveawayType: 'FirstComeFirstServe',
      claimPerUser: 2,
      maxWinners: 5,
      uniqueKey: `giveaway-start-${new Date()}`,
    };

    const signedPayload = await giveawayCreatorSigner.sign(
      'Start Giveaway',
      fcfsGiveaway,
    );

    // Create FCFS giveaway
    const createRes = await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(201);

    expect(createRes.body.success).toBe(true);
    const giveawayId = createRes.body.giveaway._id;

    // Create a user to claim the giveaway
    const { profile: userProfile, signer: userSigner } = await createUser();

    // User claims the FCFS giveaway
    const claimFCFSData = {
      giveawayId,
      uniqueKey: `giveaway-claim-${new Date()}`,
    };

    const signedPayload2 = await userSigner.sign(
      'Claim FCFS Giveaway',
      claimFCFSData,
    );

    await request(app.getHttpServer())
      .post('/api/giveaway/fcfs/claim')
      .set('Content-Type', 'application/json')
      .send(signedPayload2)
      .expect((res) => {
        expect(res.body).toMatchObject({
          success: true,
          message: expect.stringContaining(
            `You successfully claimed ${fcfsGiveaway.claimPerUser} of GALA`,
          ),
          transactionDetails: {
            Status: 1,
            success: true,
          },
        });
      })
      .expect(201);

    // Verify a win entry was created in the database
    const winModel = app.get(getModelToken('Win'));
    const test = await winModel.find({}).exec();
    console.log(test);
    const winEntries = await winModel
      .find({
        gcAddress: userProfile.galaChainAddress,
        giveaway: giveawayId,
      })
      .exec();

    expect(winEntries.length).toBe(1);
    expect(winEntries[0].amountWon).toBe(fcfsGiveaway.claimPerUser);
    expect(winEntries[0].claimed).toBe(true);
  });

  it('should be able to create a new FCFS giveaway after claiming a previous one', async () => {
    const { profile: giveawayCreatorProfile, signer: giveawayCreatorSigner } =
      await createUser();

    // 1. Grant enough balance to create 2 giveaways (plus gas fees)
    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      GALA_TOKEN,
      4,
    );

    // 2. Create a new FCFS giveaway
    const fcfsGiveaway = {
      ...startBalanceGiveaway,
      giveawayType: 'FirstComeFirstServe',
      claimPerUser: 1,
      maxWinners: 1,
    };

    const signedPayload = await giveawayCreatorSigner.sign(
      'Start Giveaway',
      fcfsGiveaway,
    );

    // Create first FCFS giveaway
    const createRes = await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(201);

    expect(createRes.body.success).toBe(true);
    const giveawayId = createRes.body.giveaway._id;

    // 3. Have a user claim the FCFS giveaway
    const { profile: userProfile, signer: userSigner } = await createUser();

    // User claims the FCFS giveaway
    const claimFCFSData = {
      giveawayId,
      uniqueKey: `giveaway-claim-${new Date()}`,
    };

    const signedClaimPayload = await userSigner.sign(
      'Claim FCFS Giveaway',
      claimFCFSData,
    );

    await request(app.getHttpServer())
      .post('/api/giveaway/fcfs/claim')
      .set('Content-Type', 'application/json')
      .send(signedClaimPayload)
      .expect((res) => {
        expect(res.body).toMatchObject({
          success: true,
          message: expect.stringContaining(
            `You successfully claimed ${fcfsGiveaway.claimPerUser} of GALA`,
          ),
          transactionDetails: {
            Status: 1,
            success: true,
          },
        });
      })
      .expect(201);

    // Verify the claim was successful by checking win entry
    const winModel = app.get(getModelToken('Win'));
    const winEntries = await winModel
      .find({
        gcAddress: userProfile.galaChainAddress,
        giveaway: giveawayId,
      })
      .exec();

    expect(winEntries.length).toBe(1);
    expect(winEntries[0].amountWon).toBe(fcfsGiveaway.claimPerUser);

    // 4. Attempt to start a new FCFS giveaway
    const secondFcfsGiveaway = {
      ...startBalanceGiveaway,
      giveawayType: 'FirstComeFirstServe',
      claimPerUser: 1,
      maxWinners: 1,
    };

    const signedSecondPayload = await giveawayCreatorSigner.sign(
      'Start Giveaway',
      secondFcfsGiveaway,
    );

    // Try to create second FCFS giveaway
    await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedSecondPayload)
      .expect((res) => {
        expect(res.body).toMatchObject({ success: true });
      })
      .expect(201);

    // Verify both giveaways exist
    await request(app.getHttpServer())
      .get('/api/giveaway/all')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(200)
      .expect((res) => {
        expect(res.body.length).toBe(2);

        // One giveaway should have participants
        const giveawayWithParticipant = res.body.find(
          (g) => g._id === giveawayId,
        );
        expect(giveawayWithParticipant).toBeDefined();

        // The other should be newly created
        const newGiveaway = res.body.find((g) => g._id !== giveawayId);
        expect(newGiveaway).toBeDefined();
        expect(newGiveaway.giveawayType).toBe('FirstComeFirstServe');
      });
  });

  it('should fail to create a second FCFS giveaway after claiming when tokens are insufficient', async () => {
    // Helper function to create and verify a FCFS giveaway
    const createFCFSGiveaway = async (
      creator,
      claimPerUser = 1,
      maxWinners = 1,
    ) => {
      const giveawayData = {
        ...startBalanceGiveaway,
        giveawayType: 'FirstComeFirstServe',
        claimPerUser,
        maxWinners,
      };

      const signedPayload = await creator.signer.sign(
        'Start Giveaway',
        giveawayData,
      );

      const createRes = await request(app.getHttpServer())
        .post('/api/giveaway/start')
        .set('Content-Type', 'application/json')
        .send(signedPayload)
        .expect(201);

      expect(createRes.body.success).toBe(true);
      return {
        giveawayId: createRes.body.giveaway._id,
        giveawayData,
        signedPayload,
      };
    };

    // Helper function to claim a FCFS giveaway
    const claimFCFSGiveaway = async (user, giveawayId, claimPerUser) => {
      const claimData = {
        giveawayId,
        uniqueKey: `giveaway-claim-${new Date()}`,
      };

      const signedClaimPayload = await user.signer.sign(
        'Claim FCFS Giveaway',
        claimData,
      );

      await request(app.getHttpServer())
        .post('/api/giveaway/fcfs/claim')
        .set('Content-Type', 'application/json')
        .send(signedClaimPayload)
        .expect((res) => {
          expect(res.body).toMatchObject({
            success: true,
            message: expect.stringContaining(
              `You successfully claimed ${claimPerUser} of GALA`,
            ),
            transactionDetails: {
              Status: 1,
              success: true,
            },
          });
        })
        .expect(201);

      // Verify the claim was successful
      const winModel = app.get(getModelToken('Win'));
      const winEntries = await winModel
        .find({
          gcAddress: user.profile.galaChainAddress,
          giveaway: giveawayId,
        })
        .exec();

      expect(winEntries.length).toBe(1);
      expect(winEntries[0].amountWon).toBe(claimPerUser);
    };

    // 1. Create the giveaway creator with only enough tokens for 1 giveaway
    const giveawayCreator = await createUser();

    mockGalachainApi.grantBalanceForToken(
      giveawayCreator.profile.giveawayWalletAddress,
      GALA_TOKEN,
      2,
    );

    // 2. Create the first FCFS giveaway
    const { giveawayId, giveawayData, signedPayload } =
      await createFCFSGiveaway(giveawayCreator);

    // 3. Create a user and have them claim the giveaway
    const giveawayUser = await createUser();
    await claimFCFSGiveaway(
      giveawayUser,
      giveawayId,
      giveawayData.claimPerUser,
    );

    // 4. Try to create a second FCFS giveaway, which should fail due to insufficient tokens
    const secondGiveaway = {
      ...startBalanceGiveaway,
      giveawayType: 'FirstComeFirstServe',
      claimPerUser: 1,
      maxWinners: 1,
    };

    const signedSecondPayload = await giveawayCreator.signer.sign(
      'Start Giveaway',
      secondGiveaway,
    );

    // This attempt should fail with a 400 error
    await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedSecondPayload)
      .expect(400)
      .expect((res) => {
        expect(res.body.success).toBe(false);
        expect(res.body.error.response.message).toContain(
          'You need to transfer more tokens before you can start this giveaway. Need an additional 1',
        );
      });

    // 5. Verify only the first giveaway exists
    await request(app.getHttpServer())
      .get('/api/giveaway/all')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(200)
      .expect((res) => {
        expect(res.body.length).toBe(1);
        expect(res.body[0]._id).toBe(giveawayId);
      });
  });

  it('should release escrow for fully claimed FCFS giveaways', async () => {
    // Helper functions for creating FCFS giveaways and claiming them
    const createFCFSGiveaway = async (
      creator,
      claimPerUser = 1,
      maxWinners = 2,
    ) => {
      const giveawayData = {
        ...startBalanceGiveaway,
        giveawayType: 'FirstComeFirstServe',
        claimPerUser,
        maxWinners,
      };

      const signedPayload = await creator.signer.sign(
        'Start Giveaway',
        giveawayData,
      );

      const createRes = await request(app.getHttpServer())
        .post('/api/giveaway/start')
        .set('Content-Type', 'application/json')
        .send(signedPayload)
        .expect(201);

      expect(createRes.body.success).toBe(true);
      return {
        giveawayId: createRes.body.giveaway._id,
        giveawayData,
        signedPayload,
      };
    };

    const claimFCFSGiveaway = async (
      user,
      giveawayId,
      claimPerUser,
      uniqueSuffix,
    ) => {
      const claimData = {
        giveawayId,
        uniqueKey: `giveaway-claim-${uniqueSuffix || new Date().getTime()}`,
      };

      const signedClaimPayload = await user.signer.sign(
        'Claim FCFS Giveaway',
        claimData,
      );

      await request(app.getHttpServer())
        .post('/api/giveaway/fcfs/claim')
        .set('Content-Type', 'application/json')
        .send(signedClaimPayload)
        .expect(201);

      // Verify the claim was successful
      const winModel = app.get(getModelToken('Win'));
      const winEntries = await winModel
        .find({
          gcAddress: user.profile.galaChainAddress,
          giveaway: giveawayId,
        })
        .exec();

      expect(winEntries.length).toBe(1);
      expect(winEntries[0].amountWon).toBe(claimPerUser);
    };

    // 1. Create a creator with enough tokens for multiple giveaways
    const giveawayCreator = await createUser();
    mockGalachainApi.grantBalanceForToken(
      giveawayCreator.profile.giveawayWalletAddress,
      GALA_TOKEN,
      10, // Plenty of tokens
    );

    // 2. Get initial fee estimate before any giveaways
    const initialFeeEstimate =
      await giveawayService.getTotalGalaFeesRequiredPlusEscrow(
        giveawayCreator.profile._id as ObjectId,
      );

    // 3. Create an FCFS giveaway with 2 max winners, 1 token per claim
    const { giveawayId, giveawayData } = await createFCFSGiveaway(
      giveawayCreator,
      1, // claimPerUser
      2, // maxWinners
    );

    // 4. Get fee estimate after creating giveaway but before claims
    // This should include the escrow for the giveaway (1 token * 2 winners = 2 tokens)
    const estimateAfterCreate =
      await giveawayService.getTotalGalaFeesRequiredPlusEscrow(
        giveawayCreator.profile._id as ObjectId,
      );

    // The new estimate should include the escrow for the unclaimed giveaway
    expect(estimateAfterCreate.toNumber()).toBeGreaterThan(
      initialFeeEstimate.toNumber(),
    );

    // 5. Create 2 users to fully claim the giveaway
    const user1 = await createUser();
    const user2 = await createUser();

    // 6. Have both users claim from the giveaway
    await claimFCFSGiveaway(
      user1,
      giveawayId,
      giveawayData.claimPerUser,
      'user1',
    );

    await claimFCFSGiveaway(
      user2,
      giveawayId,
      giveawayData.claimPerUser,
      'user2',
    );

    // 7. Get fee estimate after all claims are made
    // The escrow should be released as all tokens have been claimed
    const estimateAfterAllClaims =
      await giveawayService.getTotalGalaFeesRequiredPlusEscrow(
        giveawayCreator.profile._id as ObjectId,
      );

    // 8. The estimate after all claims should match the initial estimate
    // since all tokens are now claimed and not in escrow anymore
    console.log('Initial estimate:', initialFeeEstimate.toNumber());
    console.log(
      'Estimate after all claims:',
      estimateAfterAllClaims.toNumber(),
    );
    expect(estimateAfterAllClaims.toNumber()).toBe(
      initialFeeEstimate.toNumber(),
    );

    // 9. Make sure the giveaway exists but shows all tokens are claimed
    const response = await request(app.getHttpServer())
      .get('/api/giveaway/all')
      .set('Content-Type', 'application/json')
      .expect(200);

    const giveaway = response.body.find((g) => g._id === giveawayId);
    console.log('Giveaway data from API:', JSON.stringify(giveaway, null, 2));
    expect(giveaway).toBeDefined();

    // Check that no more claims are left, indicating all tokens have been claimed
    expect(giveaway.claimsLeft).toBe(0);

    // 10. Verify creating a new giveaway with the same parameters now works
    // (since escrow is released)
    const newGiveawayResult = await createFCFSGiveaway(giveawayCreator, 1, 2);

    expect(newGiveawayResult.giveawayId).toBeDefined();
  });

  it('should partially release escrow for partially claimed FCFS giveaways', async () => {
    // Helper functions for creating FCFS giveaways and claiming them
    const createFCFSGiveaway = async (
      creator,
      claimPerUser = 1,
      maxWinners = 3,
    ) => {
      const giveawayData = {
        ...startBalanceGiveaway,
        giveawayType: 'FirstComeFirstServe',
        claimPerUser,
        maxWinners,
      };

      const signedPayload = await creator.signer.sign(
        'Start Giveaway',
        giveawayData,
      );

      const createRes = await request(app.getHttpServer())
        .post('/api/giveaway/start')
        .set('Content-Type', 'application/json')
        .send(signedPayload)
        .expect(201);

      expect(createRes.body.success).toBe(true);
      return {
        giveawayId: createRes.body.giveaway._id,
        giveawayData,
        signedPayload,
      };
    };

    const claimFCFSGiveaway = async (
      user,
      giveawayId,
      claimPerUser,
      uniqueSuffix,
    ) => {
      const claimData = {
        giveawayId,
        uniqueKey: `giveaway-claim-${uniqueSuffix || new Date().getTime()}`,
      };

      const signedClaimPayload = await user.signer.sign(
        'Claim FCFS Giveaway',
        claimData,
      );

      await request(app.getHttpServer())
        .post('/api/giveaway/fcfs/claim')
        .set('Content-Type', 'application/json')
        .send(signedClaimPayload)
        .expect(201);

      // Verify the claim was successful
      const winModel = app.get(getModelToken('Win'));
      const winEntries = await winModel
        .find({
          gcAddress: user.profile.galaChainAddress,
          giveaway: giveawayId,
        })
        .exec();

      expect(winEntries.length).toBe(1);
      expect(winEntries[0].amountWon).toBe(claimPerUser);
    };

    // 1. Create a creator with enough tokens for the giveaway
    const giveawayCreator = await createUser();
    mockGalachainApi.grantBalanceForToken(
      giveawayCreator.profile.giveawayWalletAddress,
      GALA_TOKEN,
      10, // Plenty of tokens
    );

    // 2. Get initial fee estimate before any giveaways
    const initialFeeEstimate =
      await giveawayService.getTotalGalaFeesRequiredPlusEscrow(
        giveawayCreator.profile._id as ObjectId,
      );

    // 3. Create an FCFS giveaway with 3 max winners, 2 tokens per claim (total: 6 tokens)
    const { giveawayId, giveawayData } = await createFCFSGiveaway(
      giveawayCreator,
      2, // claimPerUser
      3, // maxWinners
    );

    // 4. Get fee estimate after creating giveaway but before claims
    // This should include the escrow for the giveaway (2 tokens * 3 winners = 6 tokens)
    const estimateAfterCreate =
      await giveawayService.getTotalGalaFeesRequiredPlusEscrow(
        giveawayCreator.profile._id as ObjectId,
      );

    // The new estimate should include the escrow for the unclaimed giveaway
    expect(estimateAfterCreate.toNumber()).toBe(
      initialFeeEstimate.toNumber() +
        giveawayData.claimPerUser * giveawayData.maxWinners +
        giveawayData.maxWinners, // 1 gas fee per claim
    );
    console.log('Initial estimate:', initialFeeEstimate.toNumber());
    console.log('Estimate after create:', estimateAfterCreate.toNumber());

    // 5. Create a user to partially claim the giveaway
    const user1 = await createUser();

    // 6. Have one user claim from the giveaway (1 of 3 potential claims)
    await claimFCFSGiveaway(
      user1,
      giveawayId,
      giveawayData.claimPerUser,
      'user1',
    );

    // 7. Get fee estimate after partial claiming
    // The escrow should be partially released (2 tokens claimed, 4 tokens still in escrow)
    const estimateAfterPartialClaims =
      await giveawayService.getTotalGalaFeesRequiredPlusEscrow(
        giveawayCreator.profile._id as ObjectId,
      );

    // 8. The estimate after partial claims should show reduced escrow
    console.log(
      'Estimate after partial claims:',
      estimateAfterPartialClaims.toNumber(),
    );

    // We should have 2 winners remaining (4 tokens) plus 1 gas fee
    const newMaxWinners = giveawayData.maxWinners - 1;
    const expectedRemainingEscrow =
      initialFeeEstimate.toNumber() +
      giveawayData.claimPerUser * newMaxWinners +
      newMaxWinners; // 1 gas fee per claim

    expect(estimateAfterPartialClaims.toNumber()).toBe(expectedRemainingEscrow);

    // The escrow should be less than initial, but not fully released
    expect(estimateAfterPartialClaims.toNumber()).toBeLessThan(
      estimateAfterCreate.toNumber(),
    );
    expect(estimateAfterPartialClaims.toNumber()).toBeGreaterThan(
      initialFeeEstimate.toNumber(),
    );

    // 9. Make sure the giveaway exists and shows the correct number of remaining claims
    const response = await request(app.getHttpServer())
      .get('/api/giveaway/all')
      .set('Content-Type', 'application/json')
      .expect(200);

    const giveaway = response.body.find((g) => g._id === giveawayId);
    console.log('Giveaway data from API:', JSON.stringify(giveaway, null, 2));
    expect(giveaway).toBeDefined();

    // Check that there are still claims left
    expect(giveaway.claimsLeft).toBe(giveawayData.maxWinners - 1);

    // 10. Verify that another user can still claim from the giveaway
    const user2 = await createUser();
    await claimFCFSGiveaway(
      user2,
      giveawayId,
      giveawayData.claimPerUser,
      'user2',
    );

    // 11. Get fee estimate after another claim
    const estimateAfterMoreClaims =
      await giveawayService.getTotalGalaFeesRequiredPlusEscrow(
        giveawayCreator.profile._id as ObjectId,
      );

    console.log(
      'Estimate after more claims:',
      estimateAfterMoreClaims.toNumber(),
    );

    // Verify escrow decreased again but isn't fully released
    // We should have 1 winner remaining (2 tokens)
    const expectedRemainingEscrow2 =
      initialFeeEstimate.toNumber() +
      giveawayData.claimPerUser * (giveawayData.maxWinners - 2) +
      1; // -2 winners, +1 for gas fee

    expect(estimateAfterMoreClaims.toNumber()).toBe(expectedRemainingEscrow2);
    expect(estimateAfterMoreClaims.toNumber()).toBeLessThan(
      estimateAfterPartialClaims.toNumber(),
    );
    expect(estimateAfterMoreClaims.toNumber()).toBeGreaterThan(
      initialFeeEstimate.toNumber(),
    );
  });

  it('should mark Win entry as claimed when claiming an FCFS giveaway', async () => {
    const { profile: giveawayCreatorProfile, signer: giveawayCreatorSigner } =
      await createUser();

    // Grant tokens to the creator's giveaway wallet
    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      GALA_TOKEN,
      50,
    );

    // Prepare a FCFS giveaway
    const fcfsGiveaway = {
      ...startBalanceGiveaway,
      giveawayType: 'FirstComeFirstServe',
      claimPerUser: 2,
      maxWinners: 5,
      uniqueKey: `giveaway-start-${new Date()}`,
    };

    const signedPayload = await giveawayCreatorSigner.sign(
      'Start Giveaway',
      fcfsGiveaway,
    );

    // Create FCFS giveaway
    const createRes = await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(201);

    expect(createRes.body.success).toBe(true);
    const giveawayId = createRes.body.giveaway._id;

    // Create a user to claim the giveaway
    const { profile: userProfile, signer: userSigner } = await createUser();

    // User claims the FCFS giveaway
    const claimFCFSData = {
      giveawayId,
      uniqueKey: `giveaway-claim-${new Date()}`,
    };

    const signedPayload2 = await userSigner.sign(
      'Claim FCFS Giveaway',
      claimFCFSData,
    );

    await request(app.getHttpServer())
      .post('/api/giveaway/fcfs/claim')
      .set('Content-Type', 'application/json')
      .send(signedPayload2)
      .expect((res) => {
        expect(res.body).toMatchObject({
          success: true,
          message: expect.stringContaining(
            `You successfully claimed ${fcfsGiveaway.claimPerUser} of GALA`,
          ),
          transactionDetails: {
            Status: 1,
            success: true,
          },
        });
      })
      .expect(201);

    // Verify the Win entry was created and marked as claimed
    const winModel = app.get(getModelToken('Win'));
    const winEntries = await winModel
      .find({
        gcAddress: userProfile.galaChainAddress,
        giveaway: giveawayId,
      })
      .exec();

    expect(winEntries.length).toBe(1);
    expect(winEntries[0].amountWon).toBe(fcfsGiveaway.claimPerUser);

    // This assertion should fail since claimed is currently set to false
    expect(winEntries[0].claimed).toBe(true);
  });

  it('should correctly return GALA balance in tokens-available endpoint', async () => {
    // 1. Create a user to test with
    const { profile, signer } = await createUser();

    // 2. Grant different amounts of tokens to the giveaway wallet
    const testToken = {
      additionalKey: 'none',
      category: 'Unit',
      collection: 'TEST_TOKEN',
      type: 'none',
      instance: '0',
    };

    // Grant 10 TEST_TOKEN
    mockGalachainApi.grantBalanceForToken(
      profile.giveawayWalletAddress,
      testToken,
      10,
    );

    // Grant 5 GALA token
    mockGalachainApi.grantBalanceForToken(
      profile.giveawayWalletAddress,
      GALA_TOKEN,
      5,
    );

    // 3. Prepare the request with the TEST_TOKEN instance key
    const requestDto = {
      tokenInstanceKey: testToken,
      tokenType: GiveawayTokenType.BALANCE,
    };

    // Sign the payload (though signature isn't checked for this endpoint)
    const signedPayload = await signer.sign('Get Tokens Available', requestDto);

    // 4. Call the tokens-available endpoint
    const response = await request(app.getHttpServer())
      .post(`/api/giveaway/tokens-available/${profile.galaChainAddress}`)
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect((res) => {
        console.log(res.body);
      })
      .expect(201);

    // 5. Verify the response
    expect(response.body).toBeDefined();
    expect(response.body.tokenBalance).toBe('10'); // Should be 10 TEST_TOKEN

    // This should be 5 (GALA balance), but due to the bug it will be 10 (TEST_TOKEN balance)
    // This assertion should fail because of the bug
    expect(response.body.galaBalance).toBe('5');

    // The giveaway wallet address should match
    expect(response.body.giveawayWallet).toBe(profile.giveawayWalletAddress);
  });

  it('should set paymentSent date when a payment is processed', async () => {
    // Setup: Create a giveaway creator with tokens
    const { profile: giveawayCreatorProfile, signer: giveawayCreatorSigner } =
      await createUser();

    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      GALA_TOKEN,
      50,
    );

    // Create an FCFS giveaway
    const fcfsGiveaway = {
      ...startBalanceGiveaway,
      giveawayType: 'FirstComeFirstServe',
      claimPerUser: 2,
      maxWinners: 3,
      uniqueKey: `giveaway-start-${new Date().getTime()}`,
    };

    const signedPayload = await giveawayCreatorSigner.sign(
      'Start Giveaway',
      fcfsGiveaway,
    );

    const createRes = await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(201);

    expect(createRes.body.success).toBe(true);
    const giveawayId = createRes.body.giveaway._id;

    // Create a user to claim the giveaway
    const { profile: userProfile, signer: userSigner } = await createUser();

    // User claims the FCFS giveaway
    const claimFCFSData = {
      giveawayId,
      uniqueKey: `giveaway-claim-${new Date().getTime()}`,
    };

    const signedClaimPayload = await userSigner.sign(
      'Claim FCFS Giveaway',
      claimFCFSData,
    );

    const beforeClaimTime = new Date();

    await request(app.getHttpServer())
      .post('/api/giveaway/fcfs/claim')
      .set('Content-Type', 'application/json')
      .send(signedClaimPayload)
      .expect(201);

    const afterClaimTime = new Date();

    // Get the PaymentStatus model and check if paymentSent is set
    const paymentStatusModel = app.get(getModelToken('PaymentStatus'));
    const paymentStatusEntries = await paymentStatusModel
      .find({
        gcAddress: userProfile.galaChainAddress,
        giveaway: giveawayId,
      })
      .exec();

    // Verify payment status was created
    expect(paymentStatusEntries.length).toBe(1);

    // Verify paymentSent is a valid date
    const paymentStatus = paymentStatusEntries[0];
    expect(paymentStatus.paymentSent).toBeDefined();
    expect(paymentStatus.paymentSent instanceof Date).toBe(true);

    // Verify the date is within a reasonable timeframe (between before and after the claim)
    expect(paymentStatus.paymentSent.getTime()).toBeGreaterThanOrEqual(
      beforeClaimTime.getTime(),
    );
    expect(paymentStatus.paymentSent.getTime()).toBeLessThanOrEqual(
      afterClaimTime.getTime() + 1000,
    ); // Add a small buffer

    // Verify amount is set correctly
    expect(paymentStatus.amount).toBeDefined();
    expect(paymentStatus.amount).toBe(fcfsGiveaway.claimPerUser.toString());

    // Verify winningInfo is also set
    expect(paymentStatus.winningInfo).toBeDefined();
  });

  it('should set paymentSent date when distributed giveaway payments are processed', async () => {
    // Setup: Create a giveaway creator with tokens
    const { profile: giveawayCreatorProfile, signer: giveawayCreatorSigner } =
      await createUser();

    mockGalachainApi.grantBalanceForToken(
      giveawayCreatorProfile.giveawayWalletAddress,
      GALA_TOKEN,
      50,
    );

    // Create a DistributedGiveaway
    const distributedGiveaway = {
      ...startBalanceGiveaway,
      giveawayType: 'DistributedGiveaway',
      tokenQuantity: '5',
      maxWinners: '1',
      uniqueKey: `giveaway-start-${new Date().getTime()}`,
    };

    const signedPayload = await giveawayCreatorSigner.sign(
      'Start Giveaway',
      distributedGiveaway,
    );

    const createRes = await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect(201);

    expect(createRes.body.success).toBe(true);
    const giveawayId = createRes.body.giveaway._id;

    // Create a user to sign up for the giveaway
    const { profile: userProfile, signer: userSigner } = await createUser();

    // User signs up for the giveaway
    const signupData = {
      giveawayId,
      uniqueKey: `giveaway-signup-${new Date().getTime()}`,
    };

    const signedSignupPayload = await userSigner.sign('Signup', signupData);

    await request(app.getHttpServer())
      .post('/api/giveaway/signup')
      .set('Content-Type', 'application/json')
      .send(signedSignupPayload)
      .expect(201);

    // Force end the giveaway to trigger distribution
    const ended = await endGiveaway(giveawayId);
    expect(ended.acknowledged).toBe(true);

    // Process the giveaway (triggers the payments)
    await giveawayScheduler.handleCron();

    // Verify the giveaway is now completed
    await request(app.getHttpServer())
      .get('/api/giveaway/all')
      .set('Content-Type', 'application/json')
      .expect(200)
      .expect((res) => {
        const giveaway = res.body.find((g) => g._id === giveawayId);
        expect(giveaway).toBeDefined();
        expect(giveaway.giveawayStatus).toBe(GiveawayStatus.Completed);
      });

    // Get the PaymentStatus model and check if paymentSent is set
    const paymentStatusModel = app.get(getModelToken('PaymentStatus'));
    const paymentStatusEntries = await paymentStatusModel
      .find({
        gcAddress: userProfile.galaChainAddress,
        giveaway: giveawayId,
      })
      .exec();

    // Verify payment status was created
    expect(paymentStatusEntries.length).toBe(1);

    // Verify paymentSent is a valid date
    const paymentStatus = paymentStatusEntries[0];
    expect(paymentStatus.paymentSent).toBeDefined();
    expect(paymentStatus.paymentSent instanceof Date).toBe(true);

    // Verify the date is recent (within the last minute)
    const now = new Date();
    const oneMinuteAgo = new Date(now.getTime() - 60000);
    expect(paymentStatus.paymentSent.getTime()).toBeGreaterThan(
      oneMinuteAgo.getTime(),
    );

    // Verify amount is set correctly
    expect(paymentStatus.amount).toBeDefined();
    expect(paymentStatus.amount).toBe(distributedGiveaway.tokenQuantity);

    // Verify winningInfo is also set
    expect(paymentStatus.winningInfo).toBeDefined();
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
