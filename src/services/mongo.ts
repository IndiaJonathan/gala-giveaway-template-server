import { MongoClient, Db } from 'mongodb';
import { Injectable, OnModuleInit } from '@nestjs/common';
import { SecretConfigService } from '../secrets/secrets.service';

@Injectable()
export class DatabaseService implements OnModuleInit {
  private client: MongoClient;
  private db: Db;

  constructor(private secretsService: SecretConfigService) {}

  async onModuleInit(): Promise<void> {
    const MONGO_URI = await this.secretsService.getSecret('MONGO_URI');
    const DB = await this.secretsService.getSecret('DB');
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
