/**
 * This is mostly for testing purposes
 */

import axios from 'axios';

// Define the structure of a single transaction based on the example
export interface GalascanTransaction {
  TransactionHash: string;
  Method: string;
  Channel: string;
  Block: string;
  SecondsAgo: number;
  CreatedAt: string;
  FromWallet: string;
  ToWallet: string;
  Amount: string; // Format seems to be "quantity:tokenSymbol"
  token_path: string;
  Fee: string; // Or number
  is_nft: number; // Or boolean
}

// Add a type for the token object structure
export interface TokenDetails {
    collection: string;
    category: string;
    type: string;
    additionalKey: string;
}

// Galascan API Base URL (using staging as requested)
const GALASCAN_API_BASE = 'https://galascan-stg.gala.com/api';

/**
 * Parses a token_path string and compares it to a token object.
 * Handles paths like "Collection|Category|Type|AdditionalKey" and simple symbols.
 * @param tokenPath The token_path string from Galascan (e.g., "GALA|Unit|none|none")
 * @param tokenObject The token object to compare against (e.g., HARDCODED_TOKEN)
 * @returns True if the token path matches the object, false otherwise.
 */
export function isTokenPathMatch(tokenPath: string | null | undefined, tokenObject: TokenDetails): boolean {
    if (!tokenPath) {
        return false;
    }

    // Simple check for common symbols like GALA, Materium (if path doesn't contain '|')
    if (!tokenPath.includes('|')) {
        // Assumes the tokenObject.collection is the symbol in this case
        return tokenPath.toUpperCase() === tokenObject.collection.toUpperCase();
    }

    // Parse the path string
    const parts = tokenPath.split('|');
    if (parts.length < 4) {
        // Might be an incomplete path, treat as non-match for robustness
        return false; 
    }

    const [collection, category, type, additionalKey] = parts;

    // Compare parts with the token object
    return (
        collection.toUpperCase() === tokenObject.collection.toUpperCase() &&
        category.toUpperCase() === tokenObject.category.toUpperCase() &&
        type.toUpperCase() === tokenObject.type.toUpperCase() &&
        additionalKey.toUpperCase() === tokenObject.additionalKey.toUpperCase()
    );
}

/**
 * Fetches all transactions for a given wallet address from the Galascan (Staging) API.
 * @param walletAddress The GalaChain wallet address (e.g., "eth|...")
 * @returns A promise that resolves to an array of transactions or null if an error occurs.
 */
export async function getGalascanTransactions(
  walletAddress: string,
): Promise<GalascanTransaction[] | null> {
  if (!walletAddress) {
    console.error('No wallet address provided for Galascan lookup.');
    return null;
  }

  console.log(`\n🔍 Fetching Galascan transactions for wallet: ${walletAddress}`);
  console.log('====================');
  const galascanUrl = `${GALASCAN_API_BASE}/all-transactions/${walletAddress}`;

  try {
    // Note: Ensure axios is installed and working
    const response = await axios.get<GalascanTransaction[]>(galascanUrl); // Use the type here
    if (response.data && response.data.length > 0) {
      console.log(`Found ${response.data.length} transactions.`);
      return response.data;
    } else {
      console.log('No transactions found for this wallet on Galascan (Staging).');
      return []; // Return empty array if none found
    }
  } catch (apiError: any) {
    console.error(`Error fetching transactions from Galascan: ${apiError.message}`);
    if (apiError.response) {
      console.error(`  Status: ${apiError.response.status}`);
      console.error(`  Data: ${JSON.stringify(apiError.response.data)}`);
    }
    return null; // Return null on error
  }
} 