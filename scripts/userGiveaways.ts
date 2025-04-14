// Script to check how many giveaways a user has created with a specific token
// Usage: ts-node scripts/userGiveaways.ts <userId>

import * as dotenv from 'dotenv';
import { Schema, model, connect, Types } from 'mongoose';
import { ObjectId } from 'mongodb';
import { GiveawaySchema } from '../src/schemas/giveaway.schema';
import { ProfileSchema } from '../src/schemas/ProfileSchema';
import { WinSchema } from '../src/schemas/ClaimableWin.schema';
import { BigNumber } from 'bignumber.js';
// Remove axios import if it exists
// import axios from 'axios'; 

// Import the new utility function and helper
import { getGalascanTransactions, GalascanTransaction, isTokenPathMatch, TokenDetails } from './galascanUtils'; // Corrected import

// Remove Galascan API Base URL if it exists
// const GALASCAN_API_BASE = 'https://galascan-stg.gala.com/api';

// Hardcoded token information - modify as needed
const HARDCODED_TOKEN: TokenDetails = { // Corrected definition with type annotation
  collection: 'GTRUMP',
  category: 'Unit',
  type: 'none',
  additionalKey: 'none'
};

async function checkUserGiveaways() {
  // Load environment variables
  dotenv.config();
  const mongoUri = process.env.MONGO_URI;

  if (!mongoUri) {
    console.error('MONGO_URI not set in .env file');
    process.exit(1);
  }

  // Get the user ID from command line
  const userId = process.argv[2];
  if (!userId) {
    console.error('Please provide a user ID as an argument');
    console.error('Usage: ts-node scripts/userGiveaways.ts <userId>');
    process.exit(1);
  }

  let userIdObj: ObjectId;
  
  try {
    userIdObj = new Types.ObjectId(userId);
  } catch (error) {
    console.error('Invalid user ID format. Please provide a valid MongoDB ObjectId');
    process.exit(1);
  }

  try {
    // Connect to MongoDB
    await connect(mongoUri, { dbName: 'gala-giveaway' });
    console.log('Connected to MongoDB');

    // Define models
    const GiveawayModel = model('Giveaway', GiveawaySchema);
    const ProfileModel = model('Profile', ProfileSchema);
    const WinModel = model('Win', WinSchema); // Define WinModel

    // Try to find the user first to verify they exist
    const user = await ProfileModel.findById(userIdObj);
    if (!user) {
      console.error(`User with ID ${userId} not found`);
      process.exit(1);
    }

    console.log(`Found user: ${user.ethAddress} (GC: ${user.galaChainAddress})`);
    
    // Fetch transactions using the utility function
    if (user.giveawayWalletAddress) {
      const transactions = await getGalascanTransactions(user.giveawayWalletAddress);

      if (transactions) { // Check if not null (meaning API call didn't fail)
        
        // ---> ADDED FILTERING STEP <---
        const filteredTransactions = transactions.filter(tx => 
            isTokenPathMatch(tx.token_path, HARDCODED_TOKEN)
        );

        console.log(`\nFiltered Transactions for Token (${HARDCODED_TOKEN.collection}): ${filteredTransactions.length}`);
        console.log('====================');

        if (filteredTransactions.length > 0) {
            // Display first few filtered transactions
            const transactionsToDisplay = filteredTransactions.slice(0, 10); // Show more filtered ones
            console.log('Latest Matching Transactions (from Galascan):');
            transactionsToDisplay.forEach((tx: GalascanTransaction, index: number) => {
                console.log(`  ${index + 1}. Hash: ${tx.TransactionHash}`);
                console.log(`     Method: ${tx.Method}`);
                console.log(`     Timestamp: ${new Date(tx.CreatedAt).toLocaleString()}`); // Use CreatedAt
                console.log(`     Amount: ${tx.Amount}`);
                // Add more details if needed
            });
            if (filteredTransactions.length > 10) {
                console.log(`  ... and ${filteredTransactions.length - 10} more.`);
            }
        } else {
            console.log('No transactions found matching the specified token.');
        }
      } else {
          console.log('Could not retrieve transactions from Galascan due to an error.');
      }
    } else {
      console.log('\nUser does not have a giveawayWalletAddress, skipping Galascan lookup.');
    }
    
    // Find all giveaways created by the user with the specified token
    const giveaways = await GiveawayModel.find({
      creator: userIdObj,
      'giveawayToken.collection': HARDCODED_TOKEN.collection,
      'giveawayToken.category': HARDCODED_TOKEN.category,
      'giveawayToken.type': HARDCODED_TOKEN.type,
      'giveawayToken.additionalKey': HARDCODED_TOKEN.additionalKey
    });

    // Group giveaways by status
    const activeGiveaways = giveaways.filter(g => {
      const now = new Date();
      return g.endDateTime > now || !g.endDateTime;
    });
    
    const expiredGiveaways = giveaways.filter(g => {
      const now = new Date();
      return g.endDateTime && g.endDateTime <= now;
    });

    // Calculate total tokens promised and claimed from Wins
    let totalTokensPromised = new BigNumber(0);
    let grandTotalClaimedFromWins = new BigNumber(0);
    const claimedAmountsPerGiveaway: { [key: string]: BigNumber } = {};

    for (const giveaway of giveaways) {
      const tokensPerGiveaway = new BigNumber(giveaway.winPerUser || 0).multipliedBy(giveaway.maxWinners || 0);
      totalTokensPromised = totalTokensPromised.plus(tokensPerGiveaway);

      // Find associated wins for this giveaway
      const wins = await WinModel.find({ giveaway: giveaway._id });
      let claimedFromWinsThisGiveaway = new BigNumber(0);

      if (wins && wins.length > 0) {
        wins.forEach(win => {
          if (win.amountWon && !isNaN(Number(win.amountWon))) {
            claimedFromWinsThisGiveaway = claimedFromWinsThisGiveaway.plus(new BigNumber(win.amountWon));
          } else {
            // Optional: Warn about missing/invalid amountWon
            // console.warn(`Win ${win._id} for giveaway ${giveaway._id} has invalid amountWon: ${win.amountWon}`);
          }
        });
      }
      
      claimedAmountsPerGiveaway[giveaway._id.toString()] = claimedFromWinsThisGiveaway;
      grandTotalClaimedFromWins = grandTotalClaimedFromWins.plus(claimedFromWinsThisGiveaway);
    }

    // Print the results
    console.log('\n📊 GIVEAWAY SUMMARY');
    console.log('====================');
    console.log(`TOKEN: ${HARDCODED_TOKEN.collection} ${HARDCODED_TOKEN.category} ${HARDCODED_TOKEN.type}`);
    console.log(`Total Giveaways: ${giveaways.length}`);
    console.log(`Active Giveaways: ${activeGiveaways.length}`);
    console.log(`Expired Giveaways: ${expiredGiveaways.length}`);
    console.log(`Total Tokens Promised: ${totalTokensPromised.toString()}`);
    // console.log(`Total Tokens Claimed (from Giveaway.winners): ${totalClaimedTokens}`); // Optional: Keep original calculation for comparison
    console.log(`Total Claimed Quantity (from Win collection): ${grandTotalClaimedFromWins.toString()}`);
    console.log(`Remaining Tokens (Promised - Claimed from Wins): ${totalTokensPromised.minus(grandTotalClaimedFromWins).toString()}`);
    
    // List the giveaways
    if (giveaways.length > 0) {
      console.log('\n📋 GIVEAWAY LIST');
      console.log('====================');
      
      giveaways.forEach((giveaway, index) => {
        const status = giveaway.endDateTime && giveaway.endDateTime <= new Date() 
          ? 'EXPIRED' 
          : 'ACTIVE';
        
        const claimedCount = giveaway.winners ? giveaway.winners.length : 0;
        const remainingCount = giveaway.maxWinners - claimedCount;
        
        console.log(`${index + 1}. ${giveaway.name} (${status})`);
        // Use a simpler approach without trying to get creation time from _id
        console.log(`   Ends: ${giveaway.endDateTime ? giveaway.endDateTime.toLocaleString() : 'No end date'}`);
        console.log(`   Type: ${giveaway.giveawayType}`);
        console.log(`   Tokens per user: ${giveaway.winPerUser}`);
        console.log(`   Max winners: ${giveaway.maxWinners}`);
        console.log(`   Current winners (in Giveaway doc): ${claimedCount}`);
        console.log(`   Remaining winners (based on maxWinners): ${remainingCount}`);
        console.log(`   Claimed Quantity (from Wins): ${claimedAmountsPerGiveaway[giveaway._id.toString()]?.toString() || '0'}`); 
        console.log('');
      });
    }
  } catch (error) {
    console.error('Error:', error);
    process.exit(1);
  } finally {
    // Close the MongoDB connection
    process.exit(0);
  }
}

// Run the function
checkUserGiveaways(); 