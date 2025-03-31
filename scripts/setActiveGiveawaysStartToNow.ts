import * as dotenv from 'dotenv';
import assert from 'assert';
import mongoose from 'mongoose';
import { GiveawaySchema } from '../src/schemas/giveaway.schema';

// Utility script for setting startDateTime to now for active giveaways
async function setActiveGiveawaysStartToNow() {
  dotenv.config();
  const mongoString = process.env.MONGO_URI;
  assert(mongoString, 'Please set your mongo uri in .env');

  const Giveaway = mongoose.model('giveaways', GiveawaySchema);

  await mongoose.connect(mongoString, { dbName: 'gala-giveaway' });

  try {
    // Find all giveaways where endDateTime is in the future (active giveaways)
    const giveaways = await Giveaway.find({ endDateTime: { $gt: new Date() } });

    if (giveaways.length === 0) {
      console.log('No active giveaways found');
      return;
    }

    // Set the startDateTime for each active giveaway to the current time
    const result = await Giveaway.updateMany(
      { endDateTime: { $gt: new Date() } }, // condition: giveaway hasn't ended yet
      { $set: { startDateTime: new Date() } }, // update: set start time to current time
    );

    console.log(`${result.modifiedCount} active giveaways updated with new start time`);
  } catch (err) {
    console.error('Error updating giveaways:', err);
  }
}

setActiveGiveawaysStartToNow(); 