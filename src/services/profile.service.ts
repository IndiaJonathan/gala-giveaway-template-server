import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { omit } from 'lodash';
import { Model, ObjectId } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { ProfileDocument } from '../schemas/ProfileSchema';
import { LinkDto } from '../dtos/profile.dto';
import { MongoError } from 'mongodb';
import {
  GalaChainResponseError,
  PublicKeyApi,
  SigningClient,
  WalletUtils,
} from '@gala-chain/connect';
import { APP_SECRETS } from '../secrets/secrets.module';

@Injectable()
export class ProfileService {
  constructor(
    @InjectModel('Profile') // Inject the Mongoose model for Profile
    private readonly profileModel: Model<ProfileDocument>,
    @Inject(APP_SECRETS) private secrets: Record<string, any>,
  ) {}

  // Method to check Telegram authorization using HMAC
  public checkTelegramAuthorization(authData: any, botToken: string): boolean {
    const checkHash = authData.hash;
    if (!checkHash) return false;

    // Filter out unnecessary fields from authData
    const filteredAuthData = omit(authData, [
      'hash',
      'GalaChain Address',
      'domain',
      'prefix',
      'types',
      'signature',
    ]);

    // Create a sorted string from the filtered auth data
    const dataCheckArr = Object.keys(filteredAuthData)
      .map((key) => `${key}=${filteredAuthData[key]}`)
      .sort();
    const dataCheckString = dataCheckArr.join('\n');

    // Generate the HMAC to verify the hash
    const secretKey = crypto.createHash('sha256').update(botToken).digest();
    const hmac = crypto
      .createHmac('sha256', secretKey)
      .update(dataCheckString)
      .digest('hex');

    // Return whether the HMAC matches the checkHash
    return hmac === checkHash;
  }

  // Create a new profile
  async createProfile(ethAddress: string, galaChainAddress: string) {
    const registrationURL = await this.secrets['REGISTRATION_ENDPOINT'];

    const giveawayWalletAddress =
      await WalletUtils.createAndRegisterRandomWallet(registrationURL);
    // Create a new profile object with the unique fields
    const newProfile = new this.profileModel({
      ethAddress: ethAddress,
      galaChainAddress: galaChainAddress,
      giveawayWalletAddress: giveawayWalletAddress.galachainAddress,
      giveawayWalletAddressPrivateKey: giveawayWalletAddress.privateKey,
      giveawayWalletPublicKey: giveawayWalletAddress.publicKey,
    });

    try {
      const result = await newProfile.save();
      return result;
    } catch (error) {
      if (error instanceof MongoError && error.code === 11000) {
        // Handle duplicate key error (error code 11000 indicates duplicate key violation)
        if (error.message.includes('ethAddress')) {
          throw new ConflictException('EthAddress already exists.');
        } else if (error.message.includes('telegramId')) {
          throw new ConflictException('TelegramId already exists.');
        }
      }
      console.error(error);
      throw new Error('An error occurred while creating the profile.');
    }
  }

  // Find all profiles
  async findAllProfiles(): Promise<ProfileDocument[]> {
    return this.profileModel.find().exec();
  }

  // Find profile by id
  async findProfile(profileId: ObjectId): Promise<ProfileDocument> {
    return this.profileModel.findOne({ _id: profileId }).exec();
  }

  async findProfileByGC(gcAddress: string, createIfNotFound = false) {
    const profile = await this.profileModel
      .findOne({ galaChainAddress: gcAddress })
      .exec();

    // If the profile is not found, throw a NotFoundException
    if (!profile) {
      if (createIfNotFound) {
        const profile = this.createProfile(
          gcAddress.replace('eth|', '0x'),
          gcAddress,
        );
        return profile;
      } else {
        throw new NotFoundException(
          `Profile with GC address ${gcAddress} not found`,
        );
      }
    }

    return profile;
  }

  async getSafeUserByGC(gcAddress: string, createIfNotFound = false) {
    const profile = await this.findProfileByGC(gcAddress, createIfNotFound);
    return {
      id: profile._id as ObjectId,
      galaChainAddress: profile.galaChainAddress,
      ethAddress: profile.ethAddress,
      hasTelegramLinked: !!profile.telegramId,
      giveawayWalletAddress: profile.giveawayWalletAddress,
    };
  }

  // Update a profile by ID
  async updateProfile(
    profileId: string,
    updateData: Partial<LinkDto>,
  ): Promise<ProfileDocument> {
    const updatedProfile = await this.profileModel
      .findByIdAndUpdate(
        profileId,
        { $set: updateData },
        { new: true }, // Return the updated profile
      )
      .exec();

    // If the profile is not found, throw a NotFoundException
    if (!updatedProfile) {
      throw new NotFoundException(`Profile with ID ${profileId} not found`);
    }

    return updatedProfile;
  }

  async checkAndRegisterProfile(privateKey: string) {
    const registrationEndpoint = await this.secrets['REGISTRATION_ENDPOINT'];
    const publicKeyEndpoint = await this.secrets['PUBLIC_KEY_API_ENDPOINT'];

    const client = new SigningClient(privateKey);
    const publicKeyApi = new PublicKeyApi(publicKeyEndpoint, client);
    const publicKey = await client.getPublicKey();

    try {
      const profile = await publicKeyApi.GetMyProfile();
      if (profile.Data) {
        //Good to go
        return;
        // console.log(`Profile found: ${profile.Data.alias}`);
      } else {
        const registerWallet = await WalletUtils.registerWallet(
          registrationEndpoint,
          publicKey.publicKey,
        );
        console.warn(registerWallet);
      }
    } catch (e) {
      if (e instanceof GalaChainResponseError) {
        if (e.ErrorCode === 400) {
          //Not signed up, sign up
          const registerWallet = await WalletUtils.registerWallet(
            registrationEndpoint,
            publicKey.publicKey,
          );
          console.warn(registerWallet);
        }
      } else {
        console.error(e);
      }
    }
  }
}
