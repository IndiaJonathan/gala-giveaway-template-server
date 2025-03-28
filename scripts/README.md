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
npx ts-node scripts/endActiveGiveaways.ts
```

Use this script for testing purposes to force giveaways to end so they can be processed by the scheduler. 