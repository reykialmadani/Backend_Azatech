import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: process.env['FRONTEND_URL'], credentials: true });
  app.enableShutdownHooks();
  await app.listen(process.env['PORT'] ?? 4000);
}
await bootstrap();
