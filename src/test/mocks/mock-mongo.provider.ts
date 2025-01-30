import { MongoClient } from 'mongodb';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { MONGO_CLIENT_PROVIDER } from '../../../test/mocks/mongo.providers';

export const MockMongoDBProviderReplacement = {
  provide: MONGO_CLIENT_PROVIDER,
  factory: () => {
    return MongoMemoryServer.create();
  },
};

export const MockMongoClientProviderReplacement = {
  inject: [MONGO_CLIENT_PROVIDER],
  factory: async (memoryServer: MongoMemoryServer) => {
    const mongo = new MongoClient(memoryServer.getUri());
    const client = await mongo.connect();
    return client.db();
  },
};
