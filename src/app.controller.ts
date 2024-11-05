import { Controller, Get } from '@nestjs/common';

@Controller()
export class AppController {
  constructor() {}

  @Get('api/health')
  healthCheck(): string {
    return 'Healthy';
  }
}
