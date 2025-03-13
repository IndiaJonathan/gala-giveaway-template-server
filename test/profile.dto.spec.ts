import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { LinkDto } from '../src/dtos/profile.dto';

describe('LinkDto', () => {
  it('should validate with firstName and lastName properties', async () => {
    const linkDto = plainToInstance(LinkDto, {
      signature: 'valid-signature',
      'GalaChain Address': 'eth|0x1234567890abcdef1234567890abcdef12345678',
      id: '12345',
      firstName: 'John',
      lastName: 'Doe',
    });

    const errors = await validate(linkDto);
    expect(errors.length).toBe(0);
  });

  it('should fail validation when required firstName is missing', async () => {
    const linkDto = plainToInstance(LinkDto, {
      signature: 'valid-signature',
      'GalaChain Address': 'eth|0x1234567890abcdef1234567890abcdef12345678',
      id: '12345',
      // firstName is missing
      lastName: 'Doe',
    });

    const errors = await validate(linkDto);
    expect(errors.length).toBeGreaterThan(0);
  });

  it('should pass validation when optional lastName is missing', async () => {
    const linkDto = plainToInstance(LinkDto, {
      signature: 'valid-signature',
      'GalaChain Address': 'eth|0x1234567890abcdef1234567890abcdef12345678',
      id: '12345',
      firstName: 'John',
      // lastName is optional and can be missing
    });

    const errors = await validate(linkDto);
    expect(errors.length).toBe(0);
  });

  it('should handle numeric id in validation', async () => {
    // Create DTO with numeric id
    const rawData = {
      signature: 'valid-signature',
      'GalaChain Address': 'eth|0x1234567890abcdef1234567890abcdef12345678',
      id: 12345, // Numeric id
      firstName: 'John',
      lastName: 'Doe',
    };

    const linkDto = plainToInstance(LinkDto, rawData);

    const errors = await validate(linkDto);
    expect(errors.length).toBe(0);
  });
});
