// src/services/giveaway.service.ts
import { Injectable } from '@nestjs/common';
import { DatabaseService } from './mongo';
import { GiveawayDto } from '../dtos/giveaway.dto';

@Injectable()
export class GiveawayService {
  private readonly collectionName = 'giveaways';

  constructor(private readonly dbService: DatabaseService) {}

  async createGiveaway(giveawayDto: GiveawayDto) {
    const collection = this.dbService.getCollection(this.collectionName);
    const result = await collection.insertOne(giveawayDto);
    return result;
  }

  async findAll() {
    const collection = this.dbService.getCollection(this.collectionName);
    return collection.find().toArray();
  }
}
