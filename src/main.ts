import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const port = process.env.PORT || 3030;
  console.log();

  const allowedOrigins = [
    'http://localhost:5959',
    `chrome-extension://${process.env.EXTENSION_ID}`,
    `extension://${process.env.EXTENSION_ID}`,
  ];

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
