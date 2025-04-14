// Script to check required tokens for a specific giveaway by ID
// Usage: ts-node scripts/checkRequiredTokens.ts <giveawayId>

import * as dotenv from 'dotenv';
import { Schema, model, connect, Types } from 'mongoose';
import { ObjectId } from 'mongodb';
import { GiveawaySchema } from '../src/schemas/giveaway.schema';
import { ProfileSchema } from '../src/schemas/ProfileSchema';
import { WinSchema } from '../src/schemas/ClaimableWin.schema';
import { BigNumber } from 'bignumber.js';
import { SigningClient, TokenApi } from '@gala-chain/connect';
import { FetchBalancesDto, FetchAllowancesDto, createValidDTO, TokenClassKeyProperties } from '@gala-chain/api';

// Constants from the main app
const GALA_TOKEN = {
  additionalKey: 'none',
  category: 'Unit',
  collection: 'GALA',
  type: 'none',
};

// Enum from the main app
enum GiveawayTokenType {
  BALANCE = 'Balance',
  ALLOWANCE = 'Allowance',
}

/**
 * Reimplementation of getRequiredTokensForGiveaway from the GiveawayService
 */
function getRequiredTokensForGiveaway(giveaway: any) {
  switch (giveaway.giveawayType) {
    case 'FirstComeFirstServe':
      // For FCFS, we need to calculate based on remaining claims
      if (giveaway.winners && giveaway.winners.length) {
        // Calculate remaining tokens to reserve based on remaining potential winners
        const claimedWinners = giveaway.winners.length;
        const remainingWinners = Math.max(
          0,
          giveaway.maxWinners - claimedWinners,
        );
        return new BigNumber(giveaway.winPerUser).multipliedBy(
          remainingWinners,
        );
      }
      // If no winners yet, return the full amount
      return new BigNumber(giveaway.winPerUser).multipliedBy(
        giveaway.maxWinners,
      );
    case 'DistributedGiveaway':
      return new BigNumber(giveaway.winPerUser).multipliedBy(
        giveaway.maxWinners,
      );
    default:
      console.error('Unsupported giveaway type');
      process.exit(1);
  }
}

/**
 * Reimplementation of getRequiredGalaGasFeeForGiveaway from the GiveawayService
 */
function getRequiredGalaGasFeeForGiveaway(giveawayDoc: any) {
  // Check if it's a fully claimed FCFS giveaway
  if (giveawayDoc.giveawayType === 'FirstComeFirstServe') {
    let gasFee = giveawayDoc.maxWinners;
    if (giveawayDoc.winners && giveawayDoc.winners.length) {
      gasFee = giveawayDoc.maxWinners - giveawayDoc.winners.length;
    }
    return gasFee;
  } else if (giveawayDoc.giveawayType === 'DistributedGiveaway') {
    return 1;
  }
  console.error(`Giveaway type ${giveawayDoc.giveawayType} not supported`);
  process.exit(1);
}

/**
 * Check if two tokens are equal
 */
function checkTokenEquality(token1: any, token2: any) {
  return (
    token1.collection === token2.collection &&
    token1.category === token2.category &&
    token1.type === token2.type &&
    token1.additionalKey === token2.additionalKey
  );
}

/**
 * Simplified implementation to get balance quantity
 */
async function getBalanceQuantity(
  tokenApi: TokenApi,
  walletAddress: string, 
  tokenClassKey: TokenClassKeyProperties
): Promise<BigNumber> {
  const fetchBalancesDto = await createValidDTO<FetchBalancesDto>(
    FetchBalancesDto,
    {
      owner: walletAddress,
      ...tokenClassKey,
    }
  );
  
  const balances = await tokenApi.FetchBalances(fetchBalancesDto);
  let quantity = new BigNumber(0);
  
  if (balances.Data && balances.Data.length > 0) {
    balances.Data.forEach(balance => {
      if (balance.quantity) {
        quantity = quantity.plus(balance.quantity);
      }
    });
  }
  
  return quantity;
}

/**
 * Simplified implementation to get allowance quantity
 */
async function getAllowanceQuantity(
  tokenApi: TokenApi,
  walletAddress: string, 
  tokenClassKey: TokenClassKeyProperties
): Promise<BigNumber> {
  const fetchAllowancesDto = await createValidDTO<FetchAllowancesDto>(
    FetchAllowancesDto,
    {
      grantedTo: walletAddress,
      ...tokenClassKey,
      instance: '0',
    }
  );
  
  const allowances = await tokenApi.FetchAllowances(fetchAllowancesDto);
  const allowanceData = (allowances as any).Data?.results || allowances.Data;
  let quantity = new BigNumber(0);
  
  if (allowanceData && Array.isArray(allowanceData) && allowanceData.length > 0) {
    allowanceData.forEach(allowance => {
      if (allowance.quantity) {
        quantity = quantity.plus(allowance.quantity);
      }
    });
  }
  
  return quantity;
}

/**
 * Simplified implementation of getNetAvailableTokenQuantity
 */
async function getNetAvailableTokenQuantity(
  tokenApi: TokenApi,
  giveawayWalletAddress: string,
  tokenClassKey: TokenClassKeyProperties,
  giveawayTokenType: GiveawayTokenType,
  allGiveaways: any[]
): Promise<BigNumber> {
  let totalQuantity: BigNumber;
  
  // Get the total quantity based on token type
  if (giveawayTokenType === GiveawayTokenType.ALLOWANCE) {
    totalQuantity = await getAllowanceQuantity(
      tokenApi,
      giveawayWalletAddress,
      tokenClassKey
    );
  } else if (giveawayTokenType === GiveawayTokenType.BALANCE) {
    totalQuantity = await getBalanceQuantity(
      tokenApi,
      giveawayWalletAddress,
      tokenClassKey
    );
  } else {
    throw new Error('Invalid token type');
  }
  
  // Subtract amounts reserved for other active giveaways
  allGiveaways
    .filter(giveaway => 
      giveaway.giveawayTokenType === giveawayTokenType &&
      checkTokenEquality(giveaway.giveawayToken, tokenClassKey))
    .forEach(giveaway => {
      switch (giveaway.giveawayType) {
        case 'DistributedGiveaway':
          totalQuantity = BigNumber(totalQuantity).minus(
            new BigNumber(giveaway.winPerUser).multipliedBy(
              giveaway.maxWinners
            )
          );
          break;
        case 'FirstComeFirstServe':
          // Calculate remaining tokens to reserve based on remaining potential winners
          const claimedWinners = giveaway.winners ? giveaway.winners.length : 0;
          const remainingWinners = Math.max(0, giveaway.maxWinners - claimedWinners);
          
          totalQuantity = BigNumber(totalQuantity).minus(
            new BigNumber(remainingWinners).multipliedBy(giveaway.winPerUser)
          );
          break;
      }
    });
  
  return totalQuantity;
}

async function checkRequiredTokens() {
  // Load environment variables
  dotenv.config();
  const mongoUri = process.env.MONGO_URI;
  const tokenApiEndpoint = process.env.TOKEN_API_ENDPOINT;
  const privateKey = process.env.GIVEAWAY_PRIVATE_KEY;

  if (!mongoUri) {
    console.error('MONGO_URI not set in .env file');
    process.exit(1);
  }

  if (!tokenApiEndpoint || !privateKey) {
    console.error('TOKEN_API_ENDPOINT or GIVEAWAY_PRIVATE_KEY not set in .env file');
    console.log('Cannot calculate net available tokens without these values');
  }

  // Get the giveaway ID from command line
  const giveawayId = process.argv[2];
  if (!giveawayId) {
    console.error('Please provide a giveaway ID as an argument');
    console.error('Usage: ts-node scripts/checkRequiredTokens.ts <giveawayId>');
    process.exit(1);
  }

  let giveawayIdObj: ObjectId;
  
  try {
    giveawayIdObj = new Types.ObjectId(giveawayId);
  } catch (error) {
    console.error('Invalid giveaway ID format. Please provide a valid MongoDB ObjectId');
    process.exit(1);
  }

  try {
    // Connect to MongoDB
    await connect(mongoUri, { dbName: 'gala-giveaway' });
    console.log('Connected to MongoDB');

    // Define models
    const GiveawayModel = model('Giveaway', GiveawaySchema);
    const ProfileModel = model('Profile', ProfileSchema);
    const WinModel = model('Win', WinSchema);

    // Find the specific giveaway
    const giveaway = await GiveawayModel.findById(giveawayIdObj);
    if (!giveaway) {
      console.error(`Giveaway with ID ${giveawayId} not found`);
      process.exit(1);
    }

    console.log(`\n🎁 GIVEAWAY DETAILS`);
    console.log('====================');
    console.log(`Name: ${giveaway.name}`);
    console.log(`Type: ${giveaway.giveawayType}`);
    console.log(`Status: ${giveaway.giveawayStatus}`);
    console.log(`Token: ${giveaway.giveawayToken.collection} ${giveaway.giveawayToken.category} ${giveaway.giveawayToken.type} (${giveaway.giveawayTokenType})`);
    console.log(`Max Winners: ${giveaway.maxWinners}`);
    console.log(`Tokens Per User: ${giveaway.winPerUser}`);
    console.log(`Current Winners: ${giveaway.winners ? giveaway.winners.length : 0}`);
    
    if (giveaway.endDateTime) {
      const now = new Date();
      const isExpired = giveaway.endDateTime <= now;
      console.log(`End Date: ${giveaway.endDateTime.toLocaleString()} (${isExpired ? 'EXPIRED' : 'ACTIVE'})`);
    } else {
      console.log('End Date: No end date specified');
    }

    console.log(`\n🏆 WIN DETAILS (from Win Collection)`);
    console.log('====================');

    // Find all wins associated with this giveaway
    const wins = await WinModel.find({ giveaway: giveawayIdObj });

    let totalClaimedFromWins = new BigNumber(0);
    if (wins && wins.length > 0) {
      console.log(`Found ${wins.length} associated win documents.`);
      wins.forEach(win => {
        // Ensure amountWon exists and is a valid number before adding
        if (win.amountWon && !isNaN(Number(win.amountWon))) { 
          totalClaimedFromWins = totalClaimedFromWins.plus(new BigNumber(win.amountWon));
        } else {
          console.warn(`Win document ${win._id} has missing or invalid amountWon: ${win.amountWon}`);
        }
      });
      console.log(`Total Claimed Quantity (from Wins): ${totalClaimedFromWins.toString()}`);
    } else {
      console.log('No associated win documents found in the Win collection.');
    }

    //Change winners
    giveaway.winners = [];

    // Calculate required tokens
    const requiredTokens = getRequiredTokensForGiveaway(giveaway);
    console.log(`\n💰 TOKEN REQUIREMENTS`);
    console.log('====================');
    console.log(`Required Tokens: ${requiredTokens.toString()}`);
    
    // Calculate required GALA gas fee
    const requiredGalaFee = getRequiredGalaGasFeeForGiveaway(giveaway);
    console.log(`Required GALA Gas Fee: ${requiredGalaFee}`);

    // If giving away GALA, add the escrow amount
    let totalGalaRequired = new BigNumber(requiredGalaFee);
    if (checkTokenEquality(giveaway.giveawayToken, GALA_TOKEN)) {
      console.log(`Also giving away GALA token. Adding to gas requirement.`);
      totalGalaRequired = totalGalaRequired.plus(requiredTokens);
      console.log(`Total GALA Required: ${totalGalaRequired.toString()}`);
    }

    if (giveaway.burnToken) {
      console.log(`\n🔥 BURN REQUIREMENTS`);
      console.log('====================');
      console.log(`Burn Token: ${giveaway.burnToken.collection} ${giveaway.burnToken.category} ${giveaway.burnToken.type}`);
      console.log(`Burn Quantity: ${giveaway.burnTokenQuantity}`);
    }

    // Get the creator's profile to find their wallet information
    if (tokenApiEndpoint && privateKey) {
      try {
        const creatorId = giveaway.creator;
        const profile = await ProfileModel.findById(creatorId);
        
        if (profile) {
          console.log(`\n👤 CREATOR INFORMATION`);
          console.log('====================');
          console.log(`ETH Address: ${profile.ethAddress}`);
          console.log(`GC Address: ${profile.galaChainAddress}`);
          console.log(`Giveaway Wallet: ${profile.giveawayWalletAddress}`);
          
          // Initialize TokenApi
          const adminSigner = new SigningClient(privateKey);
          const tokenApi = new TokenApi(tokenApiEndpoint, adminSigner);
          
          // Get all active giveaways for this creator
          const allCreatorGiveaways = await GiveawayModel.find({
            creator: creatorId,
            giveawayStatus: { $ne: 'completed' },
          });
          
          // Calculate net available tokens
          console.log(`\n💼 NET AVAILABLE TOKENS`);
          console.log('====================');
          console.log('Checking available tokens for the giveaway token...');
          
          const netAvailable = await getNetAvailableTokenQuantity(
            tokenApi,
            profile.giveawayWalletAddress,
            giveaway.giveawayToken,
            giveaway.giveawayTokenType,
            allCreatorGiveaways
          );
          
          console.log(`Net Available: ${netAvailable.toString()}`);
          
          // Calculate balance/allowance without considering other giveaways
          let rawBalance: BigNumber;
          if (giveaway.giveawayTokenType === GiveawayTokenType.ALLOWANCE) {
            rawBalance = await getAllowanceQuantity(
              tokenApi,
              profile.giveawayWalletAddress,
              giveaway.giveawayToken
            );
            console.log(`Raw Allowance: ${rawBalance.toString()}`);
          } else {
            rawBalance = await getBalanceQuantity(
              tokenApi,
              profile.giveawayWalletAddress,
              giveaway.giveawayToken
            );
            console.log(`Raw Balance: ${rawBalance.toString()}`);
          }
          
          // Compare with required tokens
          const diff = netAvailable.minus(requiredTokens);
          console.log(`Surplus/Deficit: ${diff.toString()} ${diff.isNegative() ? '⚠️ INSUFFICIENT TOKENS' : '✅ SUFFICIENT'}`);
          
          if (checkTokenEquality(giveaway.giveawayToken, GALA_TOKEN)) {
            // Also check GALA gas fee
            const galaNetAvailable = await getNetAvailableTokenQuantity(
              tokenApi,
              profile.giveawayWalletAddress,
              GALA_TOKEN,
              GiveawayTokenType.BALANCE,
              allCreatorGiveaways
            );
            
            console.log(`\nGALA Gas Fee Balance: ${galaNetAvailable.toString()}`);
            const galaDiff = galaNetAvailable.minus(requiredGalaFee);
            console.log(`GALA Gas Surplus/Deficit: ${galaDiff.toString()} ${galaDiff.isNegative() ? '⚠️ INSUFFICIENT GAS' : '✅ SUFFICIENT'}`);
          }
        } else {
          console.log(`\nCould not find creator profile for ID: ${creatorId}`);
        }
      } catch (error) {
        console.error('Error getting creator information:', error);
      }
    } else {
      console.log(`\nSkipping net available token calculation due to missing API credentials`);
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
checkRequiredTokens(); 