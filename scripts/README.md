# Gala Giveaway Scripts

This directory contains utility scripts for the Gala Giveaway server.

## Migration Scripts

### `updateExistingGiveaways.ts`

This script updates all existing giveaways in the database to add a default name field, which is now required after the schema change.

**Usage:**

```bash
# First, make sure you have the required environment variables set in your .env file
# MONGO_URI=mongodb://localhost:27017
# DB=gala-giveaway

# Then run the script
npx ts-node scripts/updateExistingGiveaways.ts
```

The script will:
1. Connect to the MongoDB database
2. Find all giveaways without a name field
3. Add a default name based on the token collection, giveaway type, and ID
4. Log the number of giveaways updated

Run this script once after deploying the code changes that made the name field required.

### `endActiveGiveaways.ts`

This script updates all active giveaways to end immediately by setting their `endDateTime` to the current time.

**Usage:**

```bash
# Set required environment variables in .env file
npx ts-node endActiveGiveaways.ts
```

Use this script for testing purposes to force giveaways to end so they can be processed by the scheduler. 

### `backfillTokenImages.ts`

This script updates existing giveaways in the database to add token images that may be missing.

**Usage:**

```bash
# Make sure you have the required environment variables set in your .env file
# MONGO_URI=mongodb://localhost:27017
# TOKEN_API_ENDPOINT=https://api.gala.games
# GIVEAWAY_PRIVATE_KEY=your_private_key

# Then run the script
npx ts-node backfillTokenImages.ts
```

The script will:
1. Connect to the MongoDB database
2. Find all giveaways that have missing or empty token images
3. Use GalachainApi to fetch token metadata and obtain the correct images
4. Update the giveaways with the retrieved token images
5. Log the number of giveaways updated

Run this script once to backfill token images for giveaways that were created before image handling was implemented properly. 