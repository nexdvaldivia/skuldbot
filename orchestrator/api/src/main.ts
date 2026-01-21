import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Enable CORS for frontend
  app.enableCors({
    origin: ['http://localhost:3000', 'http://localhost:3002'],
    credentials: true,
  });

  // Set global prefix for API routes
  app.setGlobalPrefix('api');

  const port = process.env.PORT || 3002;
  await app.listen(port);
  console.log(`🤖 SkuldBot Orchestrator API running on port ${port}`);
}
bootstrap();
