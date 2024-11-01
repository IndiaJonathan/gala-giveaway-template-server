import { Test, TestingModule } from '@nestjs/testing';
import { Types } from 'mongoose';
import { GiveawayService } from './giveaway.service';
import { getModelToken } from '@nestjs/mongoose';
import { ProfileService } from '../services/profile.service';
import BigNumber from 'bignumber.js';
import { SecretConfigModule } from '../secrets/secrets.module';

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
        ProfileService,
        {
          provide: getModelToken('Giveaway'),
          useValue: mockModel,
        },
        {
          provide: getModelToken('Profile'),
          useValue: mockModel,
        },
      ],
    }).compile();

    giveawayService = module.get<GiveawayService>(GiveawayService);
  });

  it('should distribute all tokens when tokenQuantity is greater than 1000', () => {
    const giveaway: any = {
      endDateTime: new Date(),
      giveawayToken: {
        collection: 'testCollection',
        type: 'testType',
        category: 'testCategory',
        additionalKey: 'testKey',
      },
      tokenQuantity: '5000',
      winners: [],
      usersSignedUp: ['user1', 'user2', 'user3', 'user4', 'user5'],
      distributed: false,
      creator: new Types.ObjectId(),
    };

    const winners = giveawayService.determineWinners(giveaway);

    const totalDistributedTokens = winners.reduce(
      (sum, winner) => sum.plus(new BigNumber(winner.winAmount)),
      new BigNumber(0),
    );

    expect(
      totalDistributedTokens.isEqualTo(new BigNumber(giveaway.tokenQuantity)),
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
      tokenQuantity: '10',
      winners: [],
      usersSignedUp: [], // No users signed up
      distributed: false,
      creator: new Types.ObjectId(),
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
      tokenQuantity: '100',
      winners: [],
      usersSignedUp: ['user1'], // Only one user signed up
      distributed: false,
      creator: new Types.ObjectId(),
    };

    const winners = giveawayService.determineWinners(giveaway);

    // Ensure the only user receives all tokens
    expect(winners.length).toBe(1);
    expect(winners[0].gcAddress).toBe('user1');
    expect(winners[0].winAmount).toBe(giveaway.tokenQuantity);

    // Validate that the total tokens distributed equals the tokenQuantity
    const totalDistributedTokens = winners.reduce(
      (sum, winner) => sum.plus(new BigNumber(winner.winAmount)),
      new BigNumber(0),
    );
    expect(
      totalDistributedTokens.isEqualTo(new BigNumber(giveaway.tokenQuantity)),
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
      tokenQuantity: '100',
      winners: [],
      usersSignedUp: ['user1', 'user2', 'user3', 'user4'],
      distributed: false,
      creator: new Types.ObjectId(),
    };

    const totalRandomCalls = giveaway.tokenQuantity;
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
      user1: '25',
      user2: '25',
      user3: '25',
      user4: '25',
    };

    winners.forEach((winner) => {
      expect(winner.winAmount).toBe(expectedWinCounts[winner.gcAddress]);
    });
    expect(winners.length).toBe(4);

    const totalDistributedTokens = winners.reduce(
      (sum, winner) => sum.plus(new BigNumber(winner.winAmount)),
      new BigNumber(0),
    );
    expect(totalDistributedTokens.isEqualTo(giveaway.tokenQuantity)).toBe(true);

    jest.restoreAllMocks();
  });

  it('should distribute tokens across multiple users with controlled randomness and high tokenQuantity', () => {
    const extremelyLargeNumber = new BigNumber('1e100').plus(new BigNumber(2)); // Extremely large number, beyond JS Number, plus one to ensure edge case is handled

    const giveaway: any = {
      endDateTime: new Date(),
      giveawayToken: {
        collection: 'testCollection',
        type: 'testType',
        category: 'testCategory',
        additionalKey: 'testKey',
      },
      tokenQuantity: extremelyLargeNumber.toString(),
      winners: [],
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

    const winners = giveawayService.determineWinners(giveaway);

    // Ensure that the winners were selected as per the mock random values
    const expectedWinCounts = {
      user1: new BigNumber('2.5e+99').plus(new BigNumber(2)).toString(),
      user2: '2.5e+99',
      user3: '2.5e+99',
      user4: '2.5e+99',
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
      totalDistributedTokens.isEqualTo(new BigNumber(giveaway.tokenQuantity)),
    ).toBe(true);

    jest.restoreAllMocks();
  });

  it('should distribute tokens across a single user with controlled randomness and high tokenQuantity', () => {
    const extremelyLargeNumber = new BigNumber('1e100').plus(new BigNumber(2)); // Extremely large number, beyond JS Number, plus one to ensure edge case is handled

    const giveaway: any = {
      endDateTime: new Date(),
      giveawayToken: {
        collection: 'testCollection',
        type: 'testType',
        category: 'testCategory',
        additionalKey: 'testKey',
      },
      tokenQuantity: extremelyLargeNumber.toString(),
      winners: [],
      winnerCount: 1,
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
      totalDistributedTokens.isEqualTo(new BigNumber(giveaway.tokenQuantity)),
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
});
