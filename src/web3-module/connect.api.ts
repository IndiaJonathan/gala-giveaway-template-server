import { Inject, Injectable } from '@nestjs/common';
import { ethers } from 'ethers';
import { APP_SECRETS } from '../secrets/secrets.module';

@Injectable()
export class GalaConnectApiService {
  constructor(@Inject(APP_SECRETS) private secrets: Record<string, any>) {}

  async createWallet(publicKey: string) {
    const galaConnectUri = await this.secrets['GALA_CONNECT_URI'];

    const response = await fetch(`${galaConnectUri}/v1/CreateHeadlessWallet`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ publicKey }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to create GalaChain wallet: ${await response.text()}`,
      );
    }

    const parsedBody: { walletAddress: string } = await response.json();
    return parsedBody;
  }

  async isRegistered(address: string) {
    const galaConnectUri = await this.secrets['GALA_CONNECT_URI'];

    const checksummedAddress = ethers.getAddress(address);
    const response = await fetch(`${galaConnectUri}/v1/registered`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ address: checksummedAddress }),
    });

    if (!response.ok) {
      throw new Error(
        `Failed to check if wallet is registered: ${await response.text()}`,
      );
    }
    const parsedBody: { exists: boolean; walletAlias?: string } =
      await response.json();
    return parsedBody;
  }
}
