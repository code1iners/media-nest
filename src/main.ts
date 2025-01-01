import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const port = process.env.PORT || 3030;

  const allowedOrigins = [
    'http://localhost:5959',
    'chrome-extension://ioeimgdkibkanjcldfbbpmpabiibdkom',
  ];

  const app = await NestFactory.create(AppModule);

  // Add CORS configs.
  app.enableCors({
    origin: (origin, callback) => {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'), false);
      }
    },
  });
  await app.listen(port);
}
bootstrap();
