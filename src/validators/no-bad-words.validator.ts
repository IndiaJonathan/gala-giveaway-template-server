import { registerDecorator, ValidationOptions, ValidationArguments } from 'class-validator';
import { profanity } from '@2toad/profanity'; 

/**
 * Custom decorator to check if text contains bad words using the @2toad/profanity package
 * @param validationOptions Options for the validator
 * @returns PropertyDecorator
 */
export function NoBadWords(validationOptions?: ValidationOptions) {
  return function (object: object, propertyName: string) {
    registerDecorator({
      name: 'noBadWords',
      target: object.constructor,
      propertyName: propertyName,
      options: validationOptions,
      validator: {
        validate(value: any, args: ValidationArguments): boolean {
          if (typeof value !== 'string') return true; // Only validate strings

          return !profanity.exists(value);
        },
        defaultMessage(args: ValidationArguments) {
          return validationOptions?.message as string || 'Name contains inappropriate language that is not allowed';
        },
      },
    });
  };
} 