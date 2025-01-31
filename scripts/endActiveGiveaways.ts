//Useful utility script for ending active giveaways in testing

import * as dotenv from 'dotenv';
import assert from 'assert';
import mongoose from 'mongoose';
import { GiveawaySchema } from '../src/schemas/giveaway.schema';

// Load environment variables from .env file
async function endActiveGiveaways() {
  dotenv.config();
  const mongoString = process.env.MONGO_URI;
  assert(mongoString, 'Please set your mongo uri in .env');

  const Giveaway = mongoose.model('giveaways', GiveawaySchema);

  await mongoose.connect(mongoString, { dbName: 'gala-giveaway' });

  try {
    // Find all giveaways where endDateTime is in the future
    const giveaways = await Giveaway.find({ endDateTime: { $gt: new Date() } });

    if (giveaways.length === 0) {
      console.log('No giveaways found with endDateTime in the future');
      return;
    }

    // Set the endDateTime for each giveaway to the current time
    const result = await Giveaway.updateMany(
      { endDateTime: { $gt: new Date() } }, // condition: endDateTime in the future
      { $set: { endDateTime: new Date() } }, // update: set to current time
    );

    console.log(`${result.modifiedCount} giveaways updated`);
  } catch (err) {
    console.error('Error updating giveaways:', err);
  }
}

endActiveGiveaways();
