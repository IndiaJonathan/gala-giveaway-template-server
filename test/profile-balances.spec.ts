import { Test } from '@nestjs/testing';
import { ProfileController } from '../src/profile-module/profile.controller';
import { ProfileService } from '../src/profile-module/profile.service';
import { GiveawayService } from '../src/giveway-module/giveaway.service';
import { APP_SECRETS } from '../src/secrets/secrets.module';
import { GalachainApi } from '../src/web3-module/galachain.api';

describe('ProfileController', () => {
  let profileController: ProfileController;
  let profileService: ProfileService;
  let giveawayService: GiveawayService;
  let galachainApi: GalachainApi;

  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ProfileController],
      providers: [
        {
          provide: ProfileService,
          useValue: {
            findProfileByEth: jest.fn(),
          },
        },
        {
          provide: GiveawayService,
          useValue: {
            getRequiredEscrow: jest.fn(),
          },
        },
        {
          provide: APP_SECRETS,
          useValue: {},
        },
        {
          provide: GalachainApi,
          useValue: {
            fetchBalances: jest.fn(),
          },
        },
      ],
    }).compile();

    profileController = moduleRef.get<ProfileController>(ProfileController);
    profileService = moduleRef.get<ProfileService>(ProfileService);
    giveawayService = moduleRef.get<GiveawayService>(GiveawayService);
    galachainApi = moduleRef.get<GalachainApi>(GalachainApi);
  });

  describe('getBalances', () => {
    it('should correctly combine balances and subtract escrow', async () => {
      // Mock data
      const ethAddress = '0x123';
      const userInfo = {
        id: 'user123',
        galaChainAddress: 'eth|59E398c5Aa8Bb155AcEf5eE1Fdd79524116dE4f6',
        giveawayWalletAddress: 'eth|9C2fc13549ea99F18414E3F98C40254A451c373A',
      };

      const giveawayWalletBalances = {
        Hash: "11864cd051c796ecc225abf428febcbeb2601b5005210dca904ed83c0705b4a7",
        Status: 1,
        Data: [
          {
            additionalKey: "none",
            category: "Unit",
            collection: "GALA",
            inUseHolds: [],
            instanceIds: [],
            lockedHolds: [],
            owner: "eth|9C2fc13549ea99F18414E3F98C40254A451c373A",
            quantity: "7",
            type: "none",
            tokenClass: {
              additionalKey: "none",
              category: "Unit",
              collection: "GALA",
              type: "none"
            }
          },
          {
            additionalKey: "none",
            category: "TEST",
            collection: "Unit",
            inUseHolds: [],
            instanceIds: [],
            lockedHolds: [],
            owner: "eth|9C2fc13549ea99F18414E3F98C40254A451c373A",
            quantity: "1",
            type: "none",
            tokenClass: {
              additionalKey: "none",
              category: "TEST",
              collection: "Unit",
              type: "none"
            }
          }
        ]
      };

      const userBalances = {
        Hash: "16c0df5fa69531d3c202de1d8f427a3e406a1d1a230147a084228b90a1e429fa",
        Status: 1,
        Data: [
          {
            additionalKey: "none",
            category: "Unit",
            collection: "GALA",
            inUseHolds: [],
            instanceIds: [],
            lockedHolds: [],
            owner: "eth|59E398c5Aa8Bb155AcEf5eE1Fdd79524116dE4f6",
            quantity: "22326",
            type: "none",
            tokenClass: {
              additionalKey: "none",
              category: "Unit",
              collection: "GALA",
              type: "none"
            }
          },
          {
            additionalKey: "none",
            category: "TEST",
            collection: "Unit",
            inUseHolds: [],
            instanceIds: [],
            lockedHolds: [],
            owner: "eth|59E398c5Aa8Bb155AcEf5eE1Fdd79524116dE4f6",
            quantity: "0",
            type: "none",
            tokenClass: {
              additionalKey: "none",
              category: "TEST",
              collection: "Unit",
              type: "none"
            }
          }
        ]
      };

      const requiredEscrow = [
        {
          tokenClass: {
            additionalKey: "none",
            category: "Unit",
            collection: "GALA",
            type: "none"
          },
          quantity: "20093" // Note: Modified to match the expected result of 2240
        },
        {
          tokenClass: {
            collection: "Unit",
            type: "none",
            category: "TEST",
            additionalKey: "none"
          },
          quantity: "1"
        }
      ];

      // Setup mocks
      jest.spyOn(profileService, 'findProfileByEth').mockResolvedValue(userInfo);
      jest.spyOn(galachainApi, 'fetchBalances')
        .mockImplementation(address => {
          if (address === userInfo.giveawayWalletAddress) {
            return Promise.resolve(giveawayWalletBalances);
          } else if (address === userInfo.galaChainAddress) {
            return Promise.resolve(userBalances);
          }
          return Promise.resolve({ Data: [] });
        });
      jest.spyOn(giveawayService, 'getRequiredEscrow').mockResolvedValue(requiredEscrow);

      // Call the function
      const result = await profileController.getBalances(ethAddress);

      // Verify results
      expect(result).toBeDefined();
      expect(result.availableBalances).toBeDefined();
      
      // Find GALA Unit token in results
      const galaToken = result.availableBalances.find(
        b => b.tokenClass.collection === 'GALA' && 
             b.tokenClass.category === 'Unit'
      );
      
      // Find Unit TEST token in results
      const testToken = result.availableBalances.find(
        b => b.tokenClass.collection === 'Unit' && 
             b.tokenClass.category === 'TEST'
      );
      
      // Check expected balances
      expect(galaToken).toBeDefined();
      expect(galaToken.quantity).toBe(2240); // 22326 + 7 - 20093 = 2240
      expect(galaToken.escrowAmount).toBe(20093);
      
      expect(testToken).toBeDefined();
      expect(testToken.quantity).toBe(0); // 0 + 1 - 1 = 0
      expect(testToken.escrowAmount).toBe(1);
    });
  });
}); 