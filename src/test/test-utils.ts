import { TestingModuleBuilder } from '@nestjs/testing';
import {
  MONGO_CLIENT_PROVIDER,
  MONGO_DB_PROVIDER,
} from '../../test/mocks/mongo.providers';
import {
  MockMongoClientProviderReplacement,
  MockMongoDBProviderReplacement,
} from './mocks/mock-mongo.provider';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { SecretConfigService } from '../secrets/secrets.service';
import { MockSecretConfigService } from './mocks/mock-secret.service';

export const addDefaultMocks = async (module: TestingModuleBuilder) => {
  const memoryServer = await MongoMemoryServer.create();

  const secrets = {
    MONGO_URI: memoryServer.getUri(),
    DB: 'gala-giveaway',
  };

  const mockSecretConfigService = new MockSecretConfigService(secrets);

  module
    .overrideProvider(SecretConfigService)
    .useValue(mockSecretConfigService)
    .overrideProvider(MONGO_CLIENT_PROVIDER)
    .useFactory(MockMongoDBProviderReplacement)
    .overrideProvider(MONGO_DB_PROVIDER)
    .useFactory(MockMongoClientProviderReplacement);

  return module;
};
