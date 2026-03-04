import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AppModule } from './app.module';

type CorsCallback = (err: Error | null, allow?: boolean) => void;

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  const configService = app.get(ConfigService);

  app.setGlobalPrefix('api');

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  const configuredOrigins = (
    configService.get<string>('CORS_ORIGINS') ??
    configService.get<string>('CORS_ORIGIN') ??
    'http://localhost:3004,http://localhost:3001,http://localhost:3000'
  )
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: (origin: string | undefined, callback: CorsCallback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      if (
        configuredOrigins.includes('*') ||
        configuredOrigins.includes(origin) ||
        origin.startsWith('http://localhost:')
      ) {
        callback(null, true);
        return;
      }

      callback(new Error(`Origin ${origin} not allowed by CORS`), false);
    },
    credentials: true,
  });

  const port = configService.get<number>('PORT', 3005);
  await app.listen(port);
  console.log(`Control Plane API running on port ${port}`);
}
bootstrap();
