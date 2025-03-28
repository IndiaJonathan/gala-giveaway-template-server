import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import { Injectable } from '@nestjs/common';
import fs from 'fs';

@Injectable()
export class SecretConfigService {
  async getSecret() {
    const secretsId = process.env.AWS_SECRETS_ID ?? 'local/gala-giveaway';
    // required for secrets manager, so if present prefer using it
    if (!process.env.TESTING && process.env.AWS_REGION) {
      const secretsManager = new SecretsManager({});
      const secret = await secretsManager.getSecretValue({
        SecretId: secretsId,
      });
      if (secret && secret.SecretString) {
        const parsedSecret = JSON.parse(secret.SecretString);
        for (const key in parsedSecret) {
          //parse value as JSON string if it can be parsed
          try {
            parsedSecret[key] = JSON.parse(parsedSecret[key]);
          } catch {
            // do nothing
          }
        }
        return parsedSecret;
      }
    }

    try {
      const secretsLocation = process.env.TESTING
        ? 'secrets.example.json'
        : 'secrets.json';
      // default back to secrets.json otherwise
      const secrets = JSON.parse(fs.readFileSync(secretsLocation, 'utf-8'))[
        secretsId
      ];
      if (secrets == null) {
        console.warn(
          `Secrets is undefined for secretId: ${secretsId}. Double check your secrets.json and .env`,
        );
      }

      return secrets;
    } catch (e) {
      console.error(e);
    }
  }
}
