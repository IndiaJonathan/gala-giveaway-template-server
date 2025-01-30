import { Test } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { GiveawayModule } from '../giveway-module/giveaway.module';
import { addDefaultMocks } from './test-utils';
import { MONGO_CLIENT_PROVIDER } from '../../test/mocks/mongo.providers';

jest.setTimeout(50000); // 500 milliseconds
describe('TenantsController (e2e)', () => {
  let app: INestApplication;
  let memoryServer: MongoMemoryServer;

  beforeEach(async () => {
    const moduleBuilder = Test.createTestingModule({
      imports: [GiveawayModule],
    });
    const moduleFixture = await (
      await addDefaultMocks(moduleBuilder)
    ).compile();
    app = moduleFixture.createNestApplication();
    await app.init();
    memoryServer = app.get<MongoMemoryServer>(MONGO_CLIENT_PROVIDER);
  });

  //TODO: E2E
  it('should be defined', () => {
    expect(app).toBeDefined();
  });

  afterEach(async () => {
    await memoryServer.stop();
    await app.close();
  });
});
