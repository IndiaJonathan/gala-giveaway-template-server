import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { Profanity } from '@2toad/profanity';

// Create a custom profanity filter instance with more aggressive settings
const customProfanity = new Profanity({
  wholeWord: false // This will detect 'FUCKFUCK' by matching on 'fuck'
});

// Add common compound variations explicitly if needed
const commonProfanity = ['fuck', 'shit', 'ass', 'bitch', 'cunt', 'dick'];
const compoundVariations = commonProfanity.map(word => word + word);
customProfanity.addWords([...compoundVariations]);

/**
 * Custom decorator to check if text contains bad words using the @2toad/profanity package
 * @param validationOptions Options for the validator
 * @returns PropertyDecorator
 */
export function NoBadWords(validationOptions?: ValidationOptions) {
  return function (object: Object, propertyName: string) {
    registerDecorator({
      name: 'noBadWords',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments): boolean {
          if (typeof value !== 'string') return true; // Only validate strings

          // Use our custom profanity instance with more aggressive settings
          return !customProfanity.exists(value);
        },
        defaultMessage(args: ValidationArguments) {
          return validationOptions?.message as string || 'Name contains inappropriate language that is not allowed';
        },
      },
    });
  };
} 