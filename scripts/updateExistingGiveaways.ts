// Migration script to add the name field to existing giveaways

import * as dotenv from 'dotenv';
import assert from 'assert';
import mongoose from 'mongoose';
import { GiveawaySchema } from '../src/schemas/giveaway.schema';

// Load environment variables from .env file
async function updateExistingGiveaways() {
  dotenv.config();
  const mongoString = process.env.MONGO_URI;
  assert(mongoString, 'Please set your mongo uri in .env');

  console.log('Connecting to MongoDB...');
  const Giveaway = mongoose.model('giveaways', GiveawaySchema);

  await mongoose.connect(mongoString, { dbName: 'gala-giveaway' });
  console.log('Connected to MongoDB');

  try {
    // Find all giveaways without a name field
    const giveaways = await Giveaway.find({ name: { $exists: false } });

    if (giveaways.length === 0) {
      console.log('No giveaways found without a name field');
      return;
    }

    console.log(`Found ${giveaways.length} giveaways without a name field`);

    // Update each giveaway to add a default name
    const updatePromises = giveaways.map(async (giveaway) => {
      // Create a descriptive name based on existing data
      const tokenName = giveaway.giveawayToken?.collection || 'Unknown';
      const giveawayType = giveaway.giveawayType || 'Giveaway';
      const defaultName = `${tokenName} ${giveawayType} ${giveaway._id}`;
      
      return Giveaway.updateOne(
        { _id: giveaway._id },
        { $set: { name: defaultName } }
      );
    });

    const results = await Promise.all(updatePromises);
    const modifiedCount = results.reduce((acc, result) => acc + result.modifiedCount, 0);

    console.log(`${modifiedCount} giveaways updated with a default name`);
  } catch (err) {
    console.error('Error updating giveaways:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the migration
updateExistingGiveaways()
  .then(() => console.log('Migration completed'))
  .catch((err) => console.error('Migration failed:', err))
  .finally(() => process.exit()); 