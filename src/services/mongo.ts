import { MongoClient, Db } from 'mongodb';
import { Inject, Injectable, OnModuleInit } from '@nestjs/common';
import { APP_SECRETS } from '../secrets/secrets.module';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private client: MongoClient;
  private db: Db;

  constructor(@Inject(APP_SECRETS) private secrets: Record<string, any>) {}

  async onModuleInit(): Promise<void> {
    const MONGO_URI = await this.secrets['MONGO_URI'];
    const DB = await this.secrets['DB'];
    this.client = new MongoClient(MONGO_URI);
    await this.client.connect();
    this.db = this.client.db(DB);
  }

  getCollection(collectionName: string) {
    return this.db.collection(collectionName);
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.close();
  }
}
