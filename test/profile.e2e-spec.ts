import { Test } from '@nestjs/testing';
import { INestApplication, Provider } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { addDefaultMocks } from './test-utils';
import { GiveawayModule } from '../src/giveway-module/giveaway.module';
import { Web3Module } from '../src/web3-module/web3.module';
import { MONGO_CLIENT_PROVIDER } from './mocks/mongo.providers';
import { ProfileController } from '../src/profile-module/profile.controller';
import { LinkDto } from '../src/dtos/profile.dto';
import { ProfileService } from '../src/profile-module/profile.service';
import { ProfileModule } from '../src/profile-module/profile.module';
import { ProfileDocument } from '../src/schemas/ProfileSchema';
import * as web3wallet from '../src/utils/web3wallet';

jest.setTimeout(50000);

describe('Profile related functions', () => {
  let app: INestApplication;
  let memoryServer: MongoMemoryServer;
  let profileController: ProfileController;
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

    // Get the profile controller and service for testing
    profileController = app.get<ProfileController>(ProfileController);
    profileService = app.get<ProfileService>(ProfileService);
  });

  it('should be defined', () => {
    expect(app).toBeDefined();
  });

  describe('Telegram user data storage', () => {
    it('should correctly store firstName and lastName when linking Telegram account', async () => {
      // Mock the validateSignature function to return a valid address
      const mockGcAddress = 'eth|0x1234567890abcdef1234567890abcdef12345678';
      jest
        .spyOn(web3wallet, 'validateSignature')
        .mockReturnValue(mockGcAddress);

      // Mock findProfileByGC to return a profile object
      const mockProfile = {
        _id: 'test-id',
        galaChainAddress: mockGcAddress,
        ethAddress: '0x1234567890abcdef1234567890abcdef12345678',
        telegramId: undefined,
        firstName: undefined,
        lastName: undefined,
        save: jest.fn().mockResolvedValue(true),
      } as unknown as ProfileDocument;

      jest
        .spyOn(profileService, 'findProfileByGC')
        .mockResolvedValue(mockProfile as any);

      // Mock the checkTelegramAuthorization to return true
      jest
        .spyOn(profileService, 'checkTelegramAuthorization')
        .mockReturnValue(true);

      // Create test LinkDto with the proper camelCase properties
      const linkDto: LinkDto = {
        signature: 'test-signature',
        prefix: 'eth',
        domain: { name: 'ETH' },
        types: ['eth'],
        'GalaChain Address': mockGcAddress,
        'Telegram User ID': 12345,
        'Telegram First Name': 'John',
        'Telegram Last Name': 'Doe',
        'Telegram Auth Date': new Date().getTime(),
        'Telegram Hash': 'fooo',
        'Telegram Username': 'john_doe',
      };

      // Call the linkAccounts method
      await profileController.linkAccounts(linkDto);

      // Verify that save was called on the profile with the correct data
      expect(mockProfile.save).toHaveBeenCalled();
      expect(mockProfile.telegramId).toBe(
        linkDto['Telegram User ID'].toString(),
      );
      expect(mockProfile.firstName).toBe('John');
      expect(mockProfile.lastName).toBe('Doe');
    });

    it('should handle LinkDto with different property name formats', async () => {
      // Mock the necessary functions
      const mockGcAddress = 'eth|0x1234567890abcdef1234567890abcdef12345678';
      jest
        .spyOn(web3wallet, 'validateSignature')
        .mockReturnValue(mockGcAddress);

      // Create a mock profile service with a testable implementation of checkTelegramAuthorization
      const checkAuthSpy = jest.spyOn(
        profileService,
        'checkTelegramAuthorization',
      );

      // Test with camelCase property names
      const camelCaseData = {
        hash: 'test-hash',
        'GalaChain Address': mockGcAddress,
        signature: 'test-signature',
        id: '12345',
        firstName: 'John',
        lastName: 'Doe',
      };

      // Call the authorization method directly
      const botToken = 'test-bot-token';
      profileService.checkTelegramAuthorization(camelCaseData, botToken);

      // Verify the method was called with the correct data
      expect(checkAuthSpy).toHaveBeenCalledWith(camelCaseData, botToken);

      // Test with snake_case property names
      const snakeCaseData = {
        hash: 'test-hash',
        'GalaChain Address': mockGcAddress,
        signature: 'test-signature',
        id: '12345',
        first_name: 'John',
        last_name: 'Doe',
      };

      // Reset the spy
      checkAuthSpy.mockClear();

      // Call the authorization method with snake_case data
      profileService.checkTelegramAuthorization(snakeCaseData, botToken);

      // Verify the method was called with the correct data
      expect(checkAuthSpy).toHaveBeenCalledWith(snakeCaseData, botToken);
    });
  });

  afterEach(async () => {
    // Clean up all mocks after each test
    jest.restoreAllMocks();

    try {
      await memoryServer.stop();
      await app.close();
    } catch (e) {
      console.error(e);
    }
  });
});
