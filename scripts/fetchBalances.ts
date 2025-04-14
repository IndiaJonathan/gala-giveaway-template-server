// Script to fetch balances for a given GC address with hardcoded token check
// Usage: ts-node scripts/fetchBalances.ts <gc_address>

import * as dotenv from 'dotenv';
import { 
  SigningClient,
  TokenApi 
} from '@gala-chain/connect';
import { 
  FetchBalancesDto,
  FetchAllowancesDto,
  createValidDTO,
  TokenClassKeyProperties 
} from '@gala-chain/api';
import { BigNumber } from 'bignumber.js';

// Hardcoded token information
const HARDCODED_TOKEN = {
  collection: 'GTRUMP',
  category: 'Unit',
  type: 'none',
  additionalKey: 'none'
};

// Define token types as string literals
type TokenType = 'ALLOWANCE' | 'BALANCE';

// Hardcoded token type
const HARDCODED_TOKEN_TYPE: TokenType = 'BALANCE';

// Load environment variables from .env file
async function fetchBalances() {
  dotenv.config();

  // Get environment variables
  const tokenApiEndpoint = process.env.TOKEN_API_ENDPOINT;
  const privateKey = process.env.GIVEAWAY_PRIVATE_KEY;

  if (!tokenApiEndpoint || !privateKey) {
    console.error('TOKEN_API_ENDPOINT or GIVEAWAY_PRIVATE_KEY not set in .env file');
    process.exit(1);
  }

  // Get the address from command line arguments
  const address = process.argv[2];
  if (!address) {
    console.error('Please provide a GC address as an argument');
    console.error('Usage: ts-node scripts/fetchBalances.ts <gc_address>');
    process.exit(1);
  }

  try {
    // Create a signing client with the private key
    const adminSigner = new SigningClient(privateKey);
    
    // Create a token API instance
    const tokenApi = new TokenApi(tokenApiEndpoint, adminSigner);
    
    // Fetch regular balances
    const fetchBalancesDto = await createValidDTO<FetchBalancesDto>(
      FetchBalancesDto,
      {
        owner: address,
      },
    );
    
    console.log(`Fetching balances for address: ${address}`);
    const balances = await tokenApi.FetchBalances(fetchBalancesDto);
    
    // Filter tokens by category if needed
    const unitTokens = balances.Data.filter((token) => token.category === 'Unit');
    
    // Output the results
    console.log('All Balances:');
    console.log(JSON.stringify(balances.Data, null, 2));
    
    console.log('\nUnit Tokens:');
    console.log(JSON.stringify(unitTokens, null, 2));

    // Get net available quantity for the hardcoded token
    const tokenClassKey: TokenClassKeyProperties = HARDCODED_TOKEN;
    
    console.log(`\nChecking net available quantity for hardcoded token:`, tokenClassKey);
    console.log(`Token type: ${HARDCODED_TOKEN_TYPE}`);

    let tokenQuantity = new BigNumber(0);
    
    if (HARDCODED_TOKEN_TYPE === 'ALLOWANCE') {
      // Get allowances
      const fetchAllowancesDto = await createValidDTO<FetchAllowancesDto>(
        FetchAllowancesDto,
        {
          grantedTo: address,
          ...tokenClassKey,
          instance: '0'
        }
      );
      
      const allowances = await tokenApi.FetchAllowances(fetchAllowancesDto);
      const allowanceData = (allowances as any).Data?.results || allowances.Data;
      
      console.log('\nAllowances for hardcoded token:');
      console.log(JSON.stringify(allowanceData, null, 2));
      
      // Sum up allowance quantities
      if (allowanceData && Array.isArray(allowanceData) && allowanceData.length > 0) {
        allowanceData.forEach(allowance => {
          if (allowance.quantity) {
            tokenQuantity = tokenQuantity.plus(allowance.quantity);
          }
        });
      }
    } else if (HARDCODED_TOKEN_TYPE === 'BALANCE') {
      // Get balance for specific token
      const specificFetchBalancesDto = await createValidDTO<FetchBalancesDto>(
        FetchBalancesDto,
        {
          owner: address,
          ...tokenClassKey
        }
      );
      
      const specificBalances = await tokenApi.FetchBalances(specificFetchBalancesDto);
      console.log('\nBalance for hardcoded token:');
      console.log(JSON.stringify(specificBalances.Data, null, 2));
      
      // Get the balance quantity
      if (specificBalances.Data && specificBalances.Data.length > 0) {
        specificBalances.Data.forEach(balance => {
          if (balance.quantity) {
            tokenQuantity = tokenQuantity.plus(balance.quantity);
          }
        });
      }
    }
    
    console.log(`\nTotal ${HARDCODED_TOKEN_TYPE} quantity for token:`, tokenQuantity.toString());
    console.log('\nNote: This does not account for tokens reserved in active giveaways.');
    
    return balances;
  } catch (error) {
    console.error('Error fetching balances:', error);
    process.exit(1);
  }
}

// Run the function
fetchBalances(); 