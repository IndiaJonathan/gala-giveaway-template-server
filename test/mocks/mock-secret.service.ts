import { Injectable } from '@nestjs/common';

@Injectable()
export class MockSecretConfigService {
  private secretsRecord: Record<string, string>;

  constructor(secretsRecord: Record<string, string>) {
    this.secretsRecord = secretsRecord;
  }

  async getSecret(secretKey: string) {
    console.log('---------------------');
    console.log(secretKey);
    console.log('---------------------');
    return this.secretsRecord[secretKey];
  }
}
