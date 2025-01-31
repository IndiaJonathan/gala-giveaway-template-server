import { Test } from '@nestjs/testing';
import { INestApplication, Provider } from '@nestjs/common';
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

jest.setTimeout(50000);
describe('Giveaway Controller (e2e)', () => {
  let app: INestApplication;
  let memoryServer: MongoMemoryServer;
  let profileService: ProfileService;
  let mockGalachainApi: MockGalachainApi;
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

    // jest.spyOn(global, 'fetch').mockImplementation(
    //   jest.fn((url: string, data: any) => {
    //     if (url === secrets['REGISTRATION_ENDPOINT']) {
    //       console.log('registration');
    //     }
    //     console.log(url);
    //     console.log(data);
    //     return Promise.resolve({ json: () => Promise.resolve({ data: 100 }) });
    //   }) as jest.Mock,
    // );

    const moduleFixture = await addDefaultMocks(moduleBuilder);

    const compiledFixture = await moduleFixture.compile();
    app = compiledFixture.createNestApplication();
    await app.init();
    memoryServer = app.get<MongoMemoryServer>(MONGO_CLIENT_PROVIDER);
    profileService = await app.resolve<ProfileService>(ProfileService);
    mockGalachainApi = await app.resolve<MockGalachainApi>(GalachainApi);
    secrets = await app.resolve<Record<string, any>>(APP_SECRETS);
  });

  it('should be defined', () => {
    expect(app).toBeDefined();
  });

  const startGiveaway = {
    endDateTime: '2025-01-31T16:34:40.790Z',
    telegramAuthRequired: false,
    requireBurnTokenToClaim: false,
    giveawayType: 'DistributedGiveway',
    giveawayToken: {
      additionalKey: 'none',
      category: 'Unit',
      collection: 'GALA',
      type: 'none',
    },
    giveawayTokenType: 'Balance',
    maxWinners: '1',
    tokenQuantity: '1',
    prefix: '\u0019Ethereum Signed Message:\n346',
  };

  it('should fail create a giveaway if insuffucient allowances given', async () => {
    const wallet = await WalletUtils.createAndRegisterRandomWallet(
      secrets['REGISTRATION_ENDPOINT'],
    );

    await profileService.createProfile(wallet.ethAddress);

    const signer = new SigningClient(wallet.privateKey);
    const signedPayload = await signer.sign('Start Giveaway', startGiveaway);

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
              'You need to grant more tokens before you can start this giveaway',
            error: 'Unauthorized',
            statusCode: 401,
          },
          status: 401,
          options: {},
          message:
            'You need to grant more tokens before you can start this giveaway',
          name: 'UnauthorizedException',
        },
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
    const signedPayload = await signer.sign('Start Giveaway', startGiveaway);

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
              'Insuffucient GALA balance in Giveway wallet, need additional 1',
            error: 'Bad Request',
            statusCode: 400,
          },
          status: 400,
          options: {},
          message:
            'Insuffucient GALA balance in Giveway wallet, need additional 1',
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
    const signedPayload = await signer.sign('Start Giveaway', startGiveaway);

    return await request(app.getHttpServer())
      .post('/api/giveaway/start')
      .set('Content-Type', 'application/json')
      .send(signedPayload)
      .expect((res) => {
        expect(res.body).toMatchObject({ success: true });
      })
      .expect(201);
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
