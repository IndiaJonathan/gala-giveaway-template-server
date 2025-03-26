import { Test } from '@nestjs/testing';
import { INestApplication, Provider } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { addDefaultMocks } from './test-utils';
import { GiveawayModule } from '../src/giveway-module/giveaway.module';
import { Web3Module } from '../src/web3-module/web3.module';
import { MONGO_CLIENT_PROVIDER } from './mocks/mongo.providers';
import { ProfileModule } from '../src/profile-module/profile.module';
import { LinkDto } from '../src/dtos/profile.dto';
import request from 'supertest';
import * as web3wallet from '../src/utils/web3wallet';
import { ProfileService } from '../src/profile-module/profile.service';
import { ProfileDocument } from '../src/schemas/ProfileSchema';
import { DomainDto } from '../src/dtos/SignedPayloadBase.dto';

jest.mock('../src/utils/web3wallet', () => ({
  validateSignature: jest.fn(),
}));

describe('Telegram Linking Integration Tests', () => {
  let app: INestApplication;
  let memoryServer: MongoMemoryServer;
  let httpServer: any;
  let profileService: ProfileService;

  beforeEach(async () => {
    const dbPlaceHolder: Provider = {
      provide: MONGO_CLIENT_PROVIDER,
      useValue: null,
    };

    const moduleBuilder = Test.createTestingModule({
      imports: [Web3Module, GiveawayModule, ProfileModule],
      providers: [dbPlaceHolder],
    });

    const moduleFixture = await addDefaultMocks(moduleBuilder);

    const compiledFixture = await moduleFixture.compile();
    app = compiledFixture.createNestApplication();
    await app.init();
    memoryServer = app.get<MongoMemoryServer>(MONGO_CLIENT_PROVIDER);
    httpServer = app.getHttpServer();
    profileService = app.get<ProfileService>(ProfileService);
  });

  it('should verify first and last name are correctly stored in the profile model', async () => {
    // Setup mock for validateSignature to return a valid GalaChain address
    const mockGcAddress = 'eth|0x1234567890abcdef1234567890abcdef12345678';
    (web3wallet.validateSignature as jest.Mock).mockReturnValue(mockGcAddress);

    // Mock the profile document that would be returned by findProfileByGC
    const mockProfile = {
      _id: 'test-id',
      galaChainAddress: mockGcAddress,
      ethAddress: '0x1234567890abcdef1234567890abcdef12345678',
      telegramId: undefined,
      firstName: undefined,
      lastName: undefined,
      save: jest.fn().mockResolvedValue(true),
    } as unknown as ProfileDocument;

    // Mock the findProfileByGC method to return our mock profile
    jest
      .spyOn(profileService, 'findProfileByGC')
      .mockResolvedValue(mockProfile);

    // Mock the checkTelegramAuthorization method to return true
    jest
      .spyOn(profileService, 'checkTelegramAuthorization')
      .mockReturnValue(true);

    // Create test data with firstName and lastName
    const linkData: LinkDto = {
      signature: 'test-signature',
      'GalaChain Address': mockGcAddress,
      'Telegram User ID': 12345,
      'Telegram First Name': 'John',
      'Telegram Last Name': 'Doe',
      'Telegram Auth Date': 0,
      'Telegram Hash': '',
      prefix: '',
      domain: new DomainDto(),
      types: undefined,
    };

    // Make the API call
    await request(httpServer)
      .post('/api/profile/link-accounts')
      .send(linkData)
      .expect(201);

    // Verify that the profile's first and last name were updated
    expect(mockProfile.telegramId).toBe('12345');
    expect(mockProfile.firstName).toBe('John');
    expect(mockProfile.lastName).toBe('Doe');
    expect(mockProfile.save).toHaveBeenCalled();
  });

  afterEach(async () => {
    jest.clearAllMocks();

    try {
      await memoryServer.stop();
      await app.close();
    } catch (e) {
      console.error(e);
    }
  });
});
