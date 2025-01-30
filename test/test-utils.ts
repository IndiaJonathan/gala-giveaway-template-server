import { TestingModuleBuilder } from '@nestjs/testing';

import { MongoMemoryServer } from 'mongodb-memory-server';
import { APP_SECRETS } from '../src/secrets/secrets.module';
import { SecretConfigService } from '../src/secrets/secrets.service';
import { MONGO_CLIENT_PROVIDER } from './mocks/mongo.providers';
import { MockGalachainApi } from './mocks/mock-galachain.api';
import { GalachainApi } from '../src/web3-module/galachain.api';

export const addDefaultMocks = async (module: TestingModuleBuilder) => {
  const memoryServer = await MongoMemoryServer.create();

  const secretsConfig: Record<string, any> =
    await new SecretConfigService().getSecret();

  secretsConfig.MONGO_URI = memoryServer.getUri();
  module
    .overrideProvider(APP_SECRETS)
    .useValue(secretsConfig)
    .overrideProvider(MONGO_CLIENT_PROVIDER)
    .useValue(memoryServer)
    .overrideProvider(GalachainApi)
    .useClass(MockGalachainApi);

  return module;
};
