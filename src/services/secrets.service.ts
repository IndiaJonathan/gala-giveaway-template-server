import { SecretsManager } from '@aws-sdk/client-secrets-manager';
import { Injectable, Logger } from '@nestjs/common';
import fs from 'fs';

const logger = new Logger('SecretConfigService');

@Injectable()
export class SecretConfigService {
  async getSecret(key?: string) {
    if (!process.env.AWS_SECRETS_ID) {
      logger.warn('AWS_SECRETS_ID not set, defaulting to local/gala-giveway');
    }

    const secretsId = process.env.AWS_SECRETS_ID ?? 'local/gala-giveaway';

    // required for secrets manager, so if present prefer using it
    if (!process.env.TESTING && process.env.AWS_REGION) {
      const secretsManager = new SecretsManager({});
      const secret = await secretsManager.getSecretValue({
        SecretId: key || secretsId,
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
      if (key) {
        return secrets[key];
      }

      return secrets;
    } catch (e) {
      console.error(e);
    }
  }
}
