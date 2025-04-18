import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { GiveawayService } from './giveaway.service';
import { getModelToken } from '@nestjs/mongoose';
import { ProfileService } from '../profile-module/profile.service';
import BigNumber from 'bignumber.js';
import { SecretConfigModule } from '../secrets/secrets.module';
import { GalachainApi } from '../web3-module/galachain.api';
import { MockGalachainApi } from '../../test/mocks/mock-galachain.api';
import { WalletService } from '../web3-module/wallet.service';
import { GiveawayTokenType } from '../dtos/giveaway.dto';
import { GasFeeEstimateRequestDto } from '../dtos/GasFeeEstimateRequest.dto';
import { APP_SECRETS } from '../secrets/secrets.module';

describe('GiveawayService', () => {
  let giveawayService: GiveawayService;

  const mockModel = {
    find: jest.fn().mockReturnThis(),
    exec: jest.fn(),
    save: jest.fn(),
    create: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [SecretConfigModule],
      providers: [
        GiveawayService,
        {
          provide: getModelToken('Giveaway'),
          useValue: {
            new: jest.fn().mockResolvedValue(mockModel),
            constructor: jest.fn().mockResolvedValue(mockModel),
            find: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            create: jest.fn(),
            remove: jest.fn(),
            exec: jest.fn(),
          },
        },
        {
          provide: getModelToken('Win'),
          useValue: {
            new: jest.fn().mockResolvedValue(mockModel),
            constructor: jest.fn().mockResolvedValue(mockModel),
            find: jest.fn(),
            findOne: jest.fn(),
            update: jest.fn(),
            create: jest.fn(),
            remove: jest.fn(),
            exec: jest.fn(),
          },
        },
        { provide: ProfileService, useValue: mockModel },
        { provide: GalachainApi, useValue: MockGalachainApi },
        { provide: WalletService, useValue: mockModel },
        { provide: APP_SECRETS, useValue: mockModel },
      ],
    })
      .overrideProvider(GalachainApi)
      .useClass(MockGalachainApi)
      .compile();

    giveawayService = module.get<GiveawayService>(GiveawayService);
  });

  it('should distribute all tokens when winPerUser is greater than 1000', () => {
    const giveaway: any = {
      endDateTime: new Date(),
      giveawayToken: {
        collection: 'testCollection',
        type: 'testType',
        category: 'testCategory',
        additionalKey: 'testKey',
      },
      winPerUser: '5000',
      winners: [],
      usersSignedUp: ['user1', 'user2', 'user3', 'user4', 'user5'],
      distributed: false,
      creator: new Types.ObjectId(),
      maxWinners: 5,
    };

    const winners = giveawayService.determineWinners(giveaway);

    const totalDistributedTokens = winners.reduce(
      (sum, winner) => sum.plus(new BigNumber(winner.winAmount)),
      new BigNumber(0),
    );

    expect(
      totalDistributedTokens.isEqualTo(
        new BigNumber(giveaway.winPerUser).multipliedBy(giveaway.maxWinners),
      ),
    ).toBe(true);

    // Ensure isDistributed is false
    expect(giveaway.distributed).toBe(false);
  });

  it('should throw an error when there are no users signed up', () => {
    const giveaway: any = {
      endDateTime: new Date(),
      giveawayToken: {
        collection: 'testCollection',
        type: 'testType',
        category: 'testCategory',
        additionalKey: 'testKey',
      },
      winPerUser: '10',
      winners: [],
      usersSignedUp: [], // No users signed up
      distributed: false,
      creator: new Types.ObjectId(),
      maxWinners: 5,
    };

    const winners = giveawayService.determineWinners(giveaway);
    expect(winners.length).toBe(0);
  });
  it('should give all tokens to a single user if only one user is signed up', () => {
    // Create a mock giveaway document with a single user
    const giveaway: any = {
      endDateTime: new Date(),
      giveawayToken: {
        collection: 'testCollection',
        type: 'testType',
        category: 'testCategory',
        additionalKey: 'testKey',
      },
      winPerUser: '100',
      winners: [],
      usersSignedUp: ['user1'], // Only one user signed up
      distributed: false,
      creator: new Types.ObjectId(),
      maxWinners: 5,
    };

    const winners = giveawayService.determineWinners(giveaway);

    // Ensure the only user receives all tokens
    expect(winners.length).toBe(1);
    expect(winners[0].gcAddress).toBe('user1');
    expect(winners[0].winAmount).toBe(
      new BigNumber(giveaway.winPerUser)
        .multipliedBy(giveaway.maxWinners)
        .toString(),
    );

    // Validate that the total tokens distributed equals the winPerUser
    const totalDistributedTokens = winners.reduce(
      (sum, winner) => sum.plus(new BigNumber(winner.winAmount)),
      new BigNumber(0),
    );
    expect(
      totalDistributedTokens.isEqualTo(
        new BigNumber(giveaway.winPerUser).multipliedBy(giveaway.maxWinners),
      ),
    ).toBe(true);
  });
  it('should distribute tokens across multiple users with controlled randomness', () => {
    const giveaway: any = {
      endDateTime: new Date(),
      giveawayToken: {
        collection: 'testCollection',
        type: 'testType',
        category: 'testCategory',
        additionalKey: 'testKey',
      },
      winPerUser: '100',
      winners: [],
      usersSignedUp: ['user1', 'user2', 'user3', 'user4'],
      distributed: false,
      creator: new Types.ObjectId(),
      maxWinners: 4,
    };

    const totalRandomCalls = giveaway.winPerUser;
    const mockRandomValues = Array.from(
      { length: totalRandomCalls },
      (_, i) => {
        return [0.125, 0.375, 0.625, 0.875][i % 4];
      },
    );
    let callIndex = 0;
    jest.spyOn(global.Math, 'random').mockImplementation(() => {
      return mockRandomValues[callIndex++ % mockRandomValues.length]; // Return mock values in sequence
    });

    const winners = giveawayService.determineWinners(giveaway);

    const expectedWinCounts = {
      user1: '100',
      user2: '100',
      user3: '100',
      user4: '100',
    };

    winners.forEach((winner) => {
      expect(winner.winAmount).toBe(expectedWinCounts[winner.gcAddress]);
    });
    expect(winners.length).toBe(4);

    const totalDistributedTokens = winners.reduce(
      (sum, winner) => sum.plus(new BigNumber(winner.winAmount)),
      new BigNumber(0),
    );
    expect(
      totalDistributedTokens.isEqualTo(
        new BigNumber(giveaway.winPerUser).multipliedBy(giveaway.maxWinners),
      ),
    ).toBe(true);

    jest.restoreAllMocks();
  });

  it('should distribute tokens across multiple users with controlled randomness and high winPerUser', () => {
    const extremelyLargeNumber = new BigNumber('1e100').plus(new BigNumber(2)); // Extremely large number, beyond JS Number, plus one to ensure edge case is handled

    const giveaway: any = {
      endDateTime: new Date(),
      giveawayToken: {
        collection: 'testCollection',
        type: 'testType',
        category: 'testCategory',
        additionalKey: 'testKey',
      },
      winPerUser: extremelyLargeNumber.toString(),
      winners: [],
      usersSignedUp: ['user1', 'user2', 'user3', 'user4'],
      distributed: false,
      creator: new Types.ObjectId(),
      maxWinners: 4,
    };

    let callIndex = 0;
    const usersCount = giveaway.usersSignedUp.length;
    jest.spyOn(global.Math, 'random').mockImplementation(() => {
      // Cycle through indices 0 to usersCount - 1
      const index = callIndex % usersCount;
      callIndex++;
      const randomValue = index / usersCount;
      return randomValue;
    });

    const winners = giveawayService.determineWinners(giveaway);

    // Ensure that the winners were selected as per the mock random values
    const expectedWinCounts = {
      user1: new BigNumber('1.00e+100').plus(new BigNumber(2)).toString(),
      user2: new BigNumber('1.00e+100').plus(new BigNumber(2)).toString(),
      user3: new BigNumber('1.00e+100').plus(new BigNumber(2)).toString(),
      user4: new BigNumber('1.00e+100').plus(new BigNumber(2)).toString(),
    };

    expect(winners.length).toBe(4);

    winners.forEach((winner) => {
      expect(winner.winAmount).toBe(expectedWinCounts[winner.gcAddress]);
    });

    const totalDistributedTokens = winners.reduce(
      (sum, winner) => sum.plus(new BigNumber(winner.winAmount)),
      new BigNumber(0),
    );
    expect(
      totalDistributedTokens.isEqualTo(
        new BigNumber(giveaway.winPerUser).multipliedBy(giveaway.maxWinners),
      ),
    ).toBe(true);

    jest.restoreAllMocks();
  });

  it('should distribute tokens across a single user with controlled randomness and high winPerUser', () => {
    const extremelyLargeNumber = new BigNumber('1e100').plus(new BigNumber(2)); // Extremely large number, beyond JS Number, plus one to ensure edge case is handled

    const giveaway: any = {
      endDateTime: new Date(),
      giveawayToken: {
        collection: 'testCollection',
        type: 'testType',
        category: 'testCategory',
        additionalKey: 'testKey',
      },
      winPerUser: extremelyLargeNumber.toString(),
      winners: [],
      maxWinners: 1,
      usersSignedUp: ['user1', 'user2', 'user3', 'user4'],
      distributed: false,
      creator: new Types.ObjectId(),
    };

    let callIndex = 0;
    const usersCount = giveaway.usersSignedUp.length;
    jest.spyOn(global.Math, 'random').mockImplementation(() => {
      // Cycle through indices 0 to usersCount - 1
      const index = callIndex % usersCount;
      callIndex++;
      const randomValue = index / usersCount;
      return randomValue;
    });

    let winners = giveawayService.determineWinners(giveaway);

    // Ensure that the winners were selected as per the mock random values
    let expectedWinCounts: any = {
      user1: extremelyLargeNumber,
    };

    winners.forEach((winner) => {
      expect(winner.winAmount).toBe(
        expectedWinCounts[winner.gcAddress].toString(),
      );
    });
    expect(winners.length).toBe(1);

    const totalDistributedTokens = winners.reduce(
      (sum, winner) => sum.plus(new BigNumber(winner.winAmount)),
      new BigNumber(0),
    );
    expect(
      totalDistributedTokens.isEqualTo(new BigNumber(giveaway.winPerUser)),
    ).toBe(true);

    winners = giveawayService.determineWinners(giveaway);

    //Checking to make sure rng is being taken in to account
    expectedWinCounts = {
      user2: extremelyLargeNumber,
    };

    winners.forEach((winner) => {
      expect(winner.winAmount).toBe(
        expectedWinCounts[winner.gcAddress].toString(),
      );
    });
    jest.restoreAllMocks();
  });

  it('should return 1 gas fee for BALANCE token type regardless of maxWinners', () => {
    const giveawayDto: GasFeeEstimateRequestDto = {
      giveawayType: 'DistributedGiveaway',
      giveawayTokenType: GiveawayTokenType.BALANCE,
      maxWinners: 100,
    };

    const gasFee =
      giveawayService.getRequiredGalaGasFeeForGiveaway(giveawayDto);
    expect(gasFee.toString()).toBe('1');
  });

  it('should return 1 gas fee for ALLOWANCE token type', () => {
    const giveawayDto: GasFeeEstimateRequestDto = {
      giveawayType: 'DistributedGiveaway',
      giveawayTokenType: GiveawayTokenType.ALLOWANCE,
      maxWinners: 100,
    };

    const gasFee =
      giveawayService.getRequiredGalaGasFeeForGiveaway(giveawayDto);
    expect(gasFee.toString()).toBe('1');
  });

  it('should return maxWinners as gas fee for FirstComeFirstServe giveaway type', () => {
    const giveawayDto: GasFeeEstimateRequestDto = {
      giveawayType: 'FirstComeFirstServe',
      giveawayTokenType: GiveawayTokenType.BALANCE,
      maxWinners: 100,
    };

    const gasFee =
      giveawayService.getRequiredGalaGasFeeForGiveaway(giveawayDto);
    expect(gasFee.toString()).toBe('100');
  });
});
