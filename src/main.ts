import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const logger = new Logger('Main');

  const port = process.env.PORT || 3030;

  const allowedOrigins = ['http://localhost:5959'];

  if (process.env.EXTENSION_ID) {
    allowedOrigins.push(`chrome-extension://${process.env.EXTENSION_ID}`);
    allowedOrigins.push(`extension://${process.env.EXTENSION_ID}`);
  }

  logger.log(`EXTENSION_ID = ${process.env.EXTENSION_ID}`);

  const app = await NestFactory.create(AppModule);

  // Add CORS configs.
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        console.log('origin ', origin);
        callback(new Error('Not allowed by CORS'), false);
      }
    },
  });
  await app.listen(port);
}
bootstrap();
