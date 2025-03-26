import { IsString, IsNotEmpty, IsOptional, IsNumber } from 'class-validator';
import { SignedPayloadBaseDto } from './SignedPayloadBase.dto';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class LinkDto extends SignedPayloadBaseDto {
  @IsString()
  @IsNotEmpty()
  signature: string;

  @IsString()
  @IsNotEmpty()
  'GalaChain Address': string;

  @ApiProperty({
    description: 'The GalaChain address of the user',
    example: '0x1234567890abcdef1234567890abcdef12345678',
  })
  @ApiProperty({
    description: 'Telegram user ID',
    example: 123456789,
  })
  @IsNotEmpty()
  @IsNumber()
  'Telegram User ID': number;

  @ApiProperty({
    description: 'Telegram user first name',
    example: 'John',
  })
  @IsNotEmpty()
  @IsString()
  'Telegram First Name': string;

  @ApiProperty({
    description: 'Telegram authentication date (unix timestamp)',
    example: 1632150000,
  })
  @IsNotEmpty()
  @IsNumber()
  'Telegram Auth Date': number;

  @ApiProperty({
    description: 'Telegram authentication hash',
    example: 'a1b2c3d4e5f6g7h8i9j0',
  })
  @IsNotEmpty()
  @IsString()
  'Telegram Hash': string;

  @ApiPropertyOptional({
    description: 'Telegram user last name (optional)',
    example: 'Doe',
  })
  @IsOptional()
  @IsString()
  'Telegram Last Name'?: string;

  @ApiPropertyOptional({
    description: 'Telegram username (optional)',
    example: 'johndoe',
  })
  @IsOptional()
  @IsString()
  'Telegram Username'?: string;

  @ApiPropertyOptional({
    description: 'Telegram user profile photo URL (optional)',
    example: 'https://t.me/i/userpic/320/username.jpg',
  })
  @IsOptional()
  @IsString()
  'Telegram Photo URL'?: string;
}
