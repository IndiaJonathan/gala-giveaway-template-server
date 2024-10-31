import { Schema, Document, Model, model } from 'mongoose';
import * as crypto from 'crypto';
import { SecretConfigService } from '../secrets/secrets.service';

export interface ProfileDocument extends Document {
  ethAddress: string;
  galaChainAddress: string;
  telegramId: string;
  firstName: string;
  lastName: string;
  createdAt: Date;
  giveawayWalletAddress: string;
  giveawayWalletAddressPrivateKey: string;
  decryptPrivateKey(): Promise<string>;
}

export const ProfileSchema = new Schema<ProfileDocument>({
  ethAddress: {
    type: String,
    required: true,
    unique: true,
  },
  galaChainAddress: {
    type: String,
    required: true,
    unique: true,
    validate: {
      validator: function (value: string) {
        return value.startsWith('eth|');
      },
      message: (props) =>
        `${props.value} is invalid. The address must start with "eth|".`,
    },
  },
  telegramId: {
    type: String,
    required: false,
  },
  firstName: {
    type: String,
    required: false,
  },
  lastName: {
    type: String,
    required: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  giveawayWalletAddress: {
    type: String,
    required: true,
  },
  giveawayWalletAddressPrivateKey: {
    type: String,
    required: true,
  },
});

ProfileSchema.index(
  { telegramId: 1 },
  {
    unique: true,
    partialFilterExpression: { telegramId: { $type: 'string' } },
  },
);

// Encryption and decryption logic
const algorithm = 'aes-256-cbc';
const ivLength = 16;

// Mongoose pre-save hook to encrypt the private key before saving
ProfileSchema.pre('save', async function (next) {
  const profile = this as ProfileDocument;
  const secretService = new SecretConfigService();

  const secrets = await secretService.getSecret();
  const encryptionKey = await getEncryptionKey(secrets['ENCRYPTION_KEY']);
  if (
    profile.giveawayWalletAddressPrivateKey &&
    profile.isModified('giveawayWalletAddressPrivateKey')
  ) {
    // Generate a random IV
    const iv = crypto.randomBytes(ivLength);
    const cipher = crypto.createCipheriv(algorithm, encryptionKey, iv);

    let encrypted = cipher.update(
      profile.giveawayWalletAddressPrivateKey,
      'utf8',
      'hex',
    );
    encrypted += cipher.final('hex');

    // Store the IV alongside the encrypted data, base64 encoded
    profile.giveawayWalletAddressPrivateKey =
      iv.toString('hex') + ':' + encrypted;
  }

  next();
});

async function getEncryptionKey(encryptionKeyPartial: string) {

  if (!encryptionKeyPartial) throw new Error('Encryption key not set');
  // Derive a 32-byte key from the encryption key using scrypt
  const key = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(encryptionKeyPartial, 'salt', 32, (err, derivedKey) => {
      if (err) reject(err);
      resolve(derivedKey);
    });
  });
  return key;
}
// Helper function to decrypt the private key when needed
ProfileSchema.methods.decryptPrivateKey = async function (
  encryptionKeyPartial: string,
): Promise<string> {
  if (!this.giveawayWalletAddressPrivateKey) return null;

  const encryptionKeyFull = await getEncryptionKey(encryptionKeyPartial);
  const [ivHex, encrypted] = this.giveawayWalletAddressPrivateKey.split(':');
  const iv = Buffer.from(ivHex, 'hex');

  const decipher = crypto.createDecipheriv(algorithm, encryptionKeyFull, iv);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');

  return decrypted;
};

// Create the Mongoose model for the Profile
export const ProfileModel: Model<ProfileDocument> = model<ProfileDocument>(
  'Profile',
  ProfileSchema,
);
