// scripts/simulateGiveawayBalance.ts
import * as dotenv from 'dotenv';
import { Schema, model, connect, Types, disconnect as mongooseDisconnect } from 'mongoose'; // Import disconnect
import { ObjectId } from 'mongodb';
import { GiveawaySchema, GiveawayDocument } from '../src/schemas/giveaway.schema'; // Import GiveawayDocument
import { ProfileSchema } from '../src/schemas/ProfileSchema';
import { WinSchema, WinDocument } from '../src/schemas/ClaimableWin.schema'; // Import WinDocument
import { BigNumber } from 'bignumber.js';
import { getGalascanTransactions, GalascanTransaction, isTokenPathMatch, TokenDetails } from './galascanUtils';
import { SigningClient, TokenApi } from '@gala-chain/connect'; // Added
import { FetchBalancesDto, FetchAllowancesDto, createValidDTO, TokenClassKeyProperties } from '@gala-chain/api'; // Added
import { getRequiredTokensForGiveaway, getNetAvailableTokenQuantity } from '../src/giveway-module/giveaway-logic.utils';

// Import the real function
// ConstagetNetAvailableTokenQuantity, nts from the main app (Copied from checkRequiredTokens)
const GALA_TOKEN = {
  additionalKey: 'none',
  category: 'Unit',
  collection: 'GALA',
  type: 'none',
};

// Enum from the main app (Copied from checkRequiredTokens)
enum GiveawayTokenType {
  BALANCE = 'Balance',
  ALLOWANCE = 'Allowance',
}

// Hardcoded token information - sync with userGiveaways.ts or pass via args
const SIMULATION_TOKEN: TokenDetails = {
  collection: 'GTRUMP',
  category: 'Unit',
  type: 'none',
  additionalKey: 'none'
};

interface TimelineEvent {
  timestamp: Date;
  type: 'TRANSFER_IN' | 'WIN_CLAIMED' | 'GIVEAWAY_CREATED'; // Added GIVEAWAY_CREATED for context
  amount: BigNumber; // Change in balance (positive for IN, negative for OUT)
  details: string;
  relatedId: string; // Giveaway ID or Transaction Hash
}

// Helper to parse Galascan amount string "quantity:Symbol"
function parseGalaAmount(amountStr: string): BigNumber {
    try {
        const parts = amountStr.split(':');
        if (parts.length > 0 && !isNaN(Number(parts[0]))) {
            return new BigNumber(parts[0]);
        }
    } catch (e) {
       // Ignore parsing errors, return 0
    }
    return new BigNumber(0);
}

// --- Helper Functions Copied/Adapted from checkRequiredTokens.ts --- 

/**
 * Check if two tokens are equal (Copied from checkRequiredTokens)
 */
function checkTokenEquality(token1: any, token2: any): boolean {
    if (!token1 || !token2) return false;
    return (
      token1.collection === token2.collection &&
      token1.category === token2.category &&
      token1.type === token2.type &&
      token1.additionalKey === token2.additionalKey
    );
}

/**
 * Simplified implementation to get balance quantity (Copied from checkRequiredTokens)
 */
async function getBalanceQuantity(
    tokenApi: TokenApi | null, // Allow null if API not available
    walletAddress: string, 
    tokenClassKey: TokenClassKeyProperties
  ): Promise<BigNumber> {
    if (!tokenApi) return new BigNumber(0); // Return 0 if no API client
    try {
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
    } catch (error) {
        console.error(`Error fetching balance for ${tokenClassKey.collection}:`, error);
        return new BigNumber(0);
    }
}

/**
 * Simplified implementation to get allowance quantity (Copied from checkRequiredTokens)
 */
async function getAllowanceQuantity(
    tokenApi: TokenApi | null, // Allow null
    walletAddress: string, 
    tokenClassKey: TokenClassKeyProperties
  ): Promise<BigNumber> {
    if (!tokenApi) return new BigNumber(0);
    try {
        const fetchAllowancesDto = await createValidDTO<FetchAllowancesDto>(
            FetchAllowancesDto,
            {
            grantedTo: walletAddress,
            ...tokenClassKey,
            instance: '0', // Assuming instance 0, might need adjustment
            }
        );
        
        const allowances = await tokenApi.FetchAllowances(fetchAllowancesDto);
        // Handle potential variations in response structure
        const allowanceData = (allowances as any).Data?.results || (allowances as any).Data || [];
        let quantity = new BigNumber(0);
        
        if (Array.isArray(allowanceData) && allowanceData.length > 0) {
            allowanceData.forEach(allowance => {
            if (allowance.quantity) {
                quantity = quantity.plus(allowance.quantity);
            }
            });
        }
        return quantity;
    } catch (error) {
        console.error(`Error fetching allowance for ${tokenClassKey.collection}:`, error);
        return new BigNumber(0);
    }
}

// --- End Helper Functions ---

async function runSimulation() {
  let tokenApi: TokenApi | null = null; // Initialize tokenApi as null
  try { // Wrap main logic in try block
    // --- Boilerplate: Load Env, Get Args, Connect DB ---
    dotenv.config();
    const mongoUri = process.env.MONGO_URI;
    const tokenApiEndpoint = process.env.TOKEN_API_ENDPOINT;
    const privateKey = process.env.GIVEAWAY_PRIVATE_KEY;

    if (!mongoUri) {
      console.error('MONGO_URI not set in .env file');
      process.exit(1);
    }

    const userId = process.argv[2];
    if (!userId) {
      console.error('Please provide a user ID as an argument');
      console.error('Usage: ts-node scripts/simulateGiveawayBalance.ts <userId>');
      process.exit(1);
    }

    let userIdObj: ObjectId;
    try {
      userIdObj = new Types.ObjectId(userId);
    } catch (error) {
      console.error('Invalid user ID format. Please provide a valid MongoDB ObjectId');
      process.exit(1);
    }

    // Setup Token API Client if credentials exist
    if (tokenApiEndpoint && privateKey) {
        try {
            const adminSigner = new SigningClient(privateKey);
            tokenApi = new TokenApi(tokenApiEndpoint, adminSigner);
            console.log('TokenApi client initialized.');
        } catch (e) {
            console.warn('Failed to initialize TokenApi client:', e);
        }
    } else {
        console.warn('Token API credentials not found in .env, skipping real-time balance/allowance checks in simulation.');
    }

    await connect(mongoUri, { dbName: 'gala-giveaway' });
    console.log('Connected to MongoDB');

    const GiveawayModel = model<GiveawayDocument>('Giveaway', GiveawaySchema);
    const ProfileModel = model('Profile', ProfileSchema);
    const WinModel = model<WinDocument>('Win', WinSchema);

    // --- 1. Fetch Data ---
    console.log(`Simulating balance for token: ${SIMULATION_TOKEN.collection}`);
    const user = await ProfileModel.findById(userIdObj);
    if (!user || !user.giveawayWalletAddress) {
      console.error(`User ${userId} not found or has no giveawayWalletAddress.`);
      await disconnect(); // Disconnect before exiting
      process.exit(1);
    }
    const giveawayWalletAddress = user.giveawayWalletAddress;
    console.log(`User: ${user.ethAddress}, Giveaway Wallet: ${giveawayWalletAddress}`);

    const userGiveaways = await GiveawayModel.find({
      creator: userIdObj,
      'giveawayToken.collection': SIMULATION_TOKEN.collection,
      'giveawayToken.category': SIMULATION_TOKEN.category,
      'giveawayToken.type': SIMULATION_TOKEN.type,
      'giveawayToken.additionalKey': SIMULATION_TOKEN.additionalKey
    }).sort({ startDateTime: 1 }); // Sort giveaways by start time
    console.log(`Found ${userGiveaways.length} giveaways created by user for this token.`);

    const giveawayIds = userGiveaways.map(g => g._id);
    const relevantWins = await WinModel.find({ giveaway: { $in: giveawayIds } });
    console.log(`Found ${relevantWins.length} associated win records.`);

    const allTransactions = await getGalascanTransactions(giveawayWalletAddress);

    // --- 2. Filter Transactions & Calculate Total Deposits ---
    const incomingTokenTransactions = (allTransactions || []).filter(tx =>
      tx.ToWallet === giveawayWalletAddress && isTokenPathMatch(tx.token_path, SIMULATION_TOKEN)
    );
    console.log(`Found ${incomingTokenTransactions.length} incoming Galascan transactions for this token.`);

    let totalDeposited = new BigNumber(0);
    incomingTokenTransactions.forEach(tx => {
        const amount = parseGalaAmount(tx.Amount);
        if (amount.gt(0)) {
            totalDeposited = totalDeposited.plus(amount);
        }
    });
    console.log(`Total deposited amount (frontloaded): ${totalDeposited.toString()}`);

    // --- 3. Create Timeline Events (EXCLUDING TRANSFERS) ---
    const timeline: TimelineEvent[] = [];

    // Add Win Claims (Out)
    relevantWins.forEach(win => {
       if (win.amountWon && !isNaN(Number(win.amountWon))) {
          const winAmount = new BigNumber(win.amountWon);
          // Use timeClaimed if available, otherwise timeWon (Mongoose timestamp)
          const claimTimestamp = win.timeClaimed ? new Date(win.timeClaimed) : new Date(win.timeWon);
          timeline.push({
              timestamp: claimTimestamp,
              type: 'WIN_CLAIMED',
              amount: winAmount.negated(), // Negative amount for outgoing
              details: `Win claimed by ${win.gcAddress} for giveaway ${win.giveaway.toString()}`,
              relatedId: win._id.toString()
          });
       }
    });

    // Add Giveaway Creation Events (for context, 0 amount change)
    userGiveaways.forEach(giveaway => {
        timeline.push({
            timestamp: new Date(giveaway.startDateTime),
            type: 'GIVEAWAY_CREATED',
            amount: new BigNumber(0), // No direct balance change modeled here
            details: `Giveaway '${giveaway.name}' created/started. Type: ${giveaway.giveawayTokenType}`,
            relatedId: giveaway._id.toString()
        });
    });


    // --- 4. Sort Events ---
    timeline.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

    // --- 5. Run Simulation ---
    console.log('\n--- Balance Simulation Start (Deposits Frontloaded) ---');
    let currentBalance = totalDeposited; // Start with the total deposited amount
    // Keep track of active giveaways for the checks
    let activeGiveawaysForCheck: GiveawayDocument[] = []; 
    console.log(`${new Date(0).toISOString()} | START           | Initial Balance (Frontloaded): ${currentBalance.toString()}`); // Updated log

    // Need the full giveaway documents mapped by ID for easy lookup
    const giveawayMap = new Map(userGiveaways.map(g => [g._id.toString(), g]));

    for (const event of timeline) { // Use for...of to allow await inside
      const previousBalance = currentBalance;
      let possible = true; // Flag to track if the event could happen balance-wise
      let additionalLogInfo = ''; // Store extra info for the log line

      if (event.type === 'GIVEAWAY_CREATED') {
        const createdGiveaway = giveawayMap.get(event.relatedId);
        if (createdGiveaway) {
          // *** FIX: Reset winners for simulation state when giveaway starts ***
          createdGiveaway.winners = []; 

          // Add to our list of active giveaways for subsequent checks
          activeGiveawaysForCheck.push(createdGiveaway);

          // Calculate actual requirements at this point (using IMPORTED function)
          const requiredTokens = getRequiredTokensForGiveaway(createdGiveaway);
          additionalLogInfo += ` | Required: ${requiredTokens.toString()}`;

          // Simulate the buggy availability check (using LOCAL buggy function)
          // Find giveaways that were active *before* this one started
          const otherActiveGiveaways = activeGiveawaysForCheck.filter(
            g => g._id.toString() !== createdGiveaway._id.toString() && 
                 new Date(g.startDateTime) <= event.timestamp && // Started before or at the same time
                 (!g.endDateTime || new Date(g.endDateTime) > event.timestamp) // Not ended yet
          );

          const simulatedAvailable = await getNetAvailableTokenQuantity(
            giveawayWalletAddress,
            userIdObj,
            createdGiveaway.giveawayToken,
            createdGiveaway.giveawayTokenType as GiveawayTokenType, // Cast to enum
            otherActiveGiveaways,
            currentBalance
          );
          additionalLogInfo += ` | Sim Check: ${simulatedAvailable.toString()}`;
          
          // Optional: Compare and warn if check would have failed
          if (simulatedAvailable.lt(requiredTokens)) {
              additionalLogInfo += ` (CHECK FAILED!)`;
          }

        } else {
            additionalLogInfo = ' | (Giveaway details not found)';
        }

      } else if (event.type === 'WIN_CLAIMED') {
        // Validation check for claims (existing logic)
        const requiredAmount = event.amount.abs(); 
        if (currentBalance.lt(requiredAmount)) {
          possible = false;
          console.warn(
            `${event.timestamp.toISOString()} | IMPOSSIBLE CLAIM  | ${event.details.padEnd(70)} | Needs: ${requiredAmount.toString().padStart(8)}, Has: ${currentBalance.toString().padStart(8)}`
          );
        }
        
        // Also update the state of the claimed giveaway in our active list for future checks
        const winDetailsMatch = event.details.match(/giveaway (\w+)/);
        if (winDetailsMatch && winDetailsMatch[1]) {
            const giveawayId = winDetailsMatch[1];
            const claimedGiveaway = activeGiveawaysForCheck.find(g => g._id.toString() === giveawayId);
            if (claimedGiveaway) {
                // Simulate adding a winner to the giveaway doc for future requirement checks
                if (!claimedGiveaway.winners) claimedGiveaway.winners = [];
                // We don't have full winner details, add a placeholder including 'completed'
                claimedGiveaway.winners.push({ 
                    gcAddress: 'simulated_winner', 
                    winAmount: requiredAmount.toString(), 
                    completed: true // Added missing required field
                }); 
            }
        }

      } else if (event.type === 'TRANSFER_IN') {
        // No specific checks needed for transfer in, just update balance
      }
      
      // Update balance regardless of possibility to follow the recorded timeline
      currentBalance = currentBalance.plus(event.amount);
      
      // Log the event
      const eventTypeString = possible ? event.type : `(${event.type})`; 
      console.log(
        `${event.timestamp.toISOString()} | ${eventTypeString.padEnd(17)} | ${event.details.padEnd(70)} | Amount: ${event.amount.toString().padStart(10)} | New Balance: ${currentBalance.toString().padEnd(15)}` + additionalLogInfo // Append extra info
      );

      if (currentBalance.isNegative() && previousBalance.isPositive()) {
          console.warn(`          INFO: Balance went negative after this step.`);
      }
      
      // Remove finished giveaways from active list (refined check)
      const currentEventTimestamp = event.timestamp; // Use event's timestamp as 'now'
      activeGiveawaysForCheck = activeGiveawaysForCheck.filter(g => {
        const giveawayIdStr = g._id.toString(); // For logging
        const hasEndedByTime = g.endDateTime && new Date(g.endDateTime) <= currentEventTimestamp;
        let keep = false;
        let reason = '';

        if (g.giveawayType === 'FirstComeFirstServe') {
          const currentWinners = g.winners?.length || 0;
          const maxWinners = g.maxWinners || Infinity;
          const hasReachedMaxWinners = currentWinners >= maxWinners;
          keep = !hasEndedByTime && !hasReachedMaxWinners; 
          reason = `FCFS: endedTime=${hasEndedByTime}, reachedMax=${hasReachedMaxWinners} (winners=${currentWinners}, max=${maxWinners})`;
        } else if (g.giveawayType === 'DistributedGiveaway') {
          keep = !hasEndedByTime; 
          reason = `Distributed: endedTime=${hasEndedByTime}`;
        } else {
          console.warn(`Unknown giveaway type encountered during active check: ${g.giveawayType} for ID ${giveawayIdStr}`);
          keep = true; // Keep unknown types just in case
          reason = 'Unknown Type';
        }
        
        // --- DEBUG LOGGING --- 
        if (giveawayIdStr === '67f8008228feac5685d96316') { // Log specifically for the problematic giveaway
            console.log(`[DEBUG FILTER] Checking ${giveawayIdStr} at ${currentEventTimestamp.toISOString()}: ${reason}. Keep = ${keep}`);
        }
        // --- END DEBUG LOGGING ---

        return keep;
      });
    }

    console.log('--- Balance Simulation End ---');
    console.log(`\nFinal Simulated Balance: ${currentBalance.toString()}`);

    // --- Cleanup ---
    await disconnect(); // Assuming disconnect is available, otherwise remove
    console.log('Disconnected from MongoDB');
    process.exit(0);

  } catch (error) {
      console.error('Simulation Error:', error);
      // Ensure disconnection even on error
      await disconnect();
      process.exit(1);
    }
  }

// Function to disconnect mongoose (add if not already present globally)
async function disconnect(): Promise<void> {
    if (mongooseDisconnect && typeof mongooseDisconnect === 'function') {
        try {
            await mongooseDisconnect();
        } catch (e) {
            console.error("Error during mongoose disconnect:", e);
        }
    }
}

// Run the simulation
runSimulation(); 