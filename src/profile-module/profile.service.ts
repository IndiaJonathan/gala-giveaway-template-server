import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import * as crypto from 'crypto';
import { omit } from 'lodash';
import { Model } from 'mongoose';
import { InjectModel } from '@nestjs/mongoose';
import { ProfileDocument } from '../schemas/ProfileSchema';
import { LinkDto } from '../dtos/profile.dto';
import { MongoError, ObjectId } from 'mongodb';
import {
  GalaChainResponseError,
  SigningClient,
  WalletUtils,
} from '@gala-chain/connect';
import { APP_SECRETS } from '../secrets/secrets.module';
import { GalachainApi } from '../web3-module/galachain.api';

@Injectable()
export class ProfileService {
  constructor(
    @InjectModel('Profile') // Inject the Mongoose model for Profile
    private readonly profileModel: Model<ProfileDocument>,
    @Inject(APP_SECRETS) private secrets: Record<string, any>,
    @Inject(GalachainApi) private galaChainApi: GalachainApi,
  ) {}

  public checkTelegramAuthorization(authData: any, botToken: string): boolean {
    const checkHash = authData.hash;
    if (!checkHash) {
      console.warn('[TelegramAuth] Missing hash in auth data.');
      return false;
    }

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

    const isValid = hmac === checkHash;

    return isValid;
  }

  // Create a new profile
  async createProfile(ethAddress: string) {
    const registrationURL = await this.secrets['REGISTRATION_ENDPOINT'];

    const galachainAlias = await this.galaChainApi.isRegistered(ethAddress);
    if (!galachainAlias.alias) {
      throw new UnauthorizedException('Must create a galachain account first');
    }
    const giveawayWalletAddress =
      await WalletUtils.createAndRegisterRandomWallet(registrationURL);
    // Create a new profile object with the unique fields
    const newProfile = new this.profileModel({
      ethAddress: ethAddress,
      galaChainAddress: galachainAlias.alias,
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

  async findProfileByGC(gcAddress: string) {
    const profile = await this.profileModel
      .findOne({ galaChainAddress: gcAddress })
      .exec();

    // If the profile is not found, throw a NotFoundException
    if (!profile) {
      throw new NotFoundException(
        `Profile with GC address ${gcAddress} not found`,
      );
    }

    return profile;
  }

  async findProfileByEth(ethAddress: string, createIfNotFound = false) {
    const profile = await this.profileModel
      .findOne({ ethAddress: ethAddress })
      .exec();

    // If the profile is not found, throw a NotFoundException
    if (!profile) {
      if (createIfNotFound) {
        const profile = this.createProfile(ethAddress);
        return profile;
      } else {
        throw new NotFoundException(
          `Profile with ETH address ${ethAddress} not found`,
        );
      }
    }

    return profile;
  }

  async getSafeUserByEth(ethAddress: string, createIfNotFound = false) {
    const profile = await this.findProfileByEth(ethAddress, createIfNotFound);
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

    const client = new SigningClient(privateKey);
    const publicKey = await client.getPublicKey();
    try {
      const profile = await this.galaChainApi.isRegistered(
        client.ethereumAddress,
      );
      if (profile.exists) {
        //Good to go
        return;
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
        throw e;
      }
    }
  }
}
