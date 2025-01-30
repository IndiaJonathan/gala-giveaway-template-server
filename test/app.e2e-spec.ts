import { Test } from '@nestjs/testing';
import { INestApplication, Provider } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { addDefaultMocks } from './test-utils';
import { GiveawayModule } from '../src/giveway-module/giveaway.module';
import { Web3Module } from '../src/web3-module/web3.module';
import { MONGO_CLIENT_PROVIDER } from './mocks/mongo.providers';

jest.setTimeout(50000);
describe('Giveaway Controller (e2e)', () => {
  let app: INestApplication;
  let memoryServer: MongoMemoryServer;

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
    await app.init();
    memoryServer = app.get<MongoMemoryServer>(MONGO_CLIENT_PROVIDER);
  });

  it('should be defined', () => {
    expect(app).toBeDefined();
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
