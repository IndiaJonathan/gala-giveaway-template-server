// Script to backfill token images for existing giveaways

import * as dotenv from 'dotenv';
import assert from 'assert';
import mongoose from 'mongoose';
import { GiveawayDocument, GiveawaySchema } from '../src/schemas/giveaway.schema';
import { TokenApi, SigningClient } from '@gala-chain/connect';
import { checkTokenEquality } from '../src/chain.helper';

// Load environment variables from .env file
async function backfillTokenImages() {
  dotenv.config();
  const mongoString = process.env.MONGO_URI;
  const tokenApiEndpoint = process.env.TOKEN_API_ENDPOINT;
  const privateKey = process.env.GIVEAWAY_PRIVATE_KEY;
  
  assert(mongoString, 'Please set your MONGO_URI in .env');
  assert(tokenApiEndpoint, 'Please set your TOKEN_API_ENDPOINT in .env');
  assert(privateKey, 'Please set your GIVEAWAY_PRIVATE_KEY in .env');

  console.log('Connecting to MongoDB...');
  
  // Make sure we register the model with the schema
  // Use 'giveaways' as the collection name to match what's in the database
  let Giveaway;
  try {
    Giveaway = mongoose.model<GiveawayDocument>('Giveaway');
  } catch (e) {
    Giveaway = mongoose.model<GiveawayDocument>('Giveaway', GiveawaySchema, 'giveaways');
  }

  await mongoose.connect(mongoString, { dbName: 'gala-giveaway' });
  console.log('Connected to MongoDB');

  try {
    // Create admin signer for token API
    const adminSigner = new SigningClient(privateKey);
    const tokenApi = new TokenApi(tokenApiEndpoint, adminSigner);

    // Find all giveaways that need image updates
    // Get raw documents from MongoDB to avoid schema validation issues
    // We're looking for giveaways where either:
    // 1. The giveaway token doesn't have an image or has an empty image
    // 2. The giveaway has a burn token that doesn't have an image or has an empty image
    const giveaways = await Giveaway.find({
      $or: [
        { 'giveawayToken.image': { $exists: false } },
        { 'giveawayToken.image': '' },
        { 'burnToken.image': { $exists: false }, 'requireBurnTokenToClaim': true },
        { 'burnToken.image': '', 'requireBurnTokenToClaim': true }
      ]
    }).lean().exec();

    if (giveaways.length === 0) {
      console.log('No giveaways found that need token image updates');
      return;
    }

    console.log(`Found ${giveaways.length} giveaways that need token image updates`);

    // Update each giveaway with token images
    let updatedCount = 0;

    for (const giveaway of giveaways) {
      try {
        // Check if required fields exist for API lookup
        if (!giveaway.giveawayToken) {
          console.log(`Giveaway ${giveaway._id} is missing giveawayToken, skipping`);
          continue;
        }

        // Collect token class keys for metadata lookup
        const tokens = [giveaway.giveawayToken];
        if (giveaway.requireBurnTokenToClaim && giveaway.burnToken) {
          tokens.push(giveaway.burnToken);
        }

        // Get token metadata from the API
        console.log(`Fetching metadata for giveaway ${giveaway._id}...`);
        const tokenMetadata = await tokenApi.FetchTokenClasses({
          tokenClasses: tokens,
        });

        if (!tokenMetadata || !tokenMetadata.Data || !Array.isArray(tokenMetadata.Data)) {
          console.log(`No metadata returned for giveaway ${giveaway._id}, skipping`);
          continue;
        }

        // Find images for tokens
        const giveawayTokenImage = tokenMetadata.Data.find((token) =>
          checkTokenEquality(token, giveaway.giveawayToken)
        )?.image;

        let burnTokenImage = undefined;
        if (giveaway.requireBurnTokenToClaim && giveaway.burnToken) {
          burnTokenImage = tokenMetadata.Data.find((token) =>
            checkTokenEquality(token, giveaway.burnToken)
          )?.image;
        }

        // Prepare update operation
        const updateOperation: any = {};
        
        if (giveawayTokenImage) {
          updateOperation['giveawayToken.image'] = giveawayTokenImage;
          console.log(`Found giveaway token image for ${giveaway._id}`);
        }
        
        if (burnTokenImage && giveaway.requireBurnTokenToClaim) {
          updateOperation['burnToken.image'] = burnTokenImage;
          console.log(`Found burn token image for ${giveaway._id}`);
        }

        // Only proceed with update if we found at least one image
        if (Object.keys(updateOperation).length > 0) {
          console.log(`Updating giveaway ${giveaway._id}...`);
          const result = await Giveaway.updateOne(
            { _id: giveaway._id },
            { $set: updateOperation }
          );
          
          if (result.modifiedCount > 0) {
            updatedCount++;
            console.log(`Updated giveaway ${giveaway._id} with token images`);
          } else {
            console.log(`No changes made to giveaway ${giveaway._id}`);
          }
        } else {
          console.log(`No images found for giveaway ${giveaway._id}`);
        }
      } catch (err) {
        console.error(`Error processing giveaway ${giveaway._id}:`, err);
      }
    }

    console.log(`${updatedCount} giveaways updated with token images`);
  } catch (err) {
    console.error('Error updating giveaway token images:', err);
  } finally {
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
  }
}

// Run the script
backfillTokenImages()
  .then(() => console.log('Token image backfill completed'))
  .catch((err) => console.error('Token image backfill failed:', err))
  .finally(() => process.exit()); 