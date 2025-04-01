import { validate } from 'class-validator';
import { NoBadWords } from './no-bad-words.validator';

// Test class using the NoBadWords decorator
class TestClass {
  @NoBadWords()
  name: string;

  constructor(name: string) {
    this.name = name;
  }
}

describe('NoBadWords Validator', () => {
  it('should pass validation for a clean string', async () => {
    const instance = new TestClass('This is a perfectly fine name');
    const errors = await validate(instance);
    expect(errors.length).toBe(0);
  });

  it('should fail validation for a string containing a bad word', async () => {
    // Using a word commonly included in default bad-words lists
    const instance = new TestClass('This name contains profanity like shit');
    const errors = await validate(instance);
    expect(errors.length).toBe(1);
    expect(errors[0].constraints).toHaveProperty('noBadWords');
    expect(errors[0].property).toBe('name');
  });

  it('should pass validation if the value is not a string', async () => {
    const instance = new TestClass(12345 as any); // Test with a non-string value
    const errors = await validate(instance);
    expect(errors.length).toBe(0);
  });

  it('should use the custom message if provided', async () => {
    class TestClassWithCustomMessage {
      @NoBadWords({ message: 'Inappropriate name detected!' })
      name: string;

      constructor(name: string) {
        this.name = name;
      }
    }

    const instance = new TestClassWithCustomMessage('This name contains profanity like shit');
    const errors = await validate(instance);
    expect(errors.length).toBe(1);
    expect(errors[0].constraints).toHaveProperty('noBadWords');
    expect(errors[0].constraints.noBadWords).toBe('Inappropriate name detected!');
  });

  it('should detect uppercase compound profanity', async () => {
    const instance = new TestClass('FUCKFUCK');
    const errors = await validate(instance);
    expect(errors.length).toBe(1);
    expect(errors[0].constraints).toHaveProperty('noBadWords');
    expect(errors[0].property).toBe('name');
  });
}); 