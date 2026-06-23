import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { createCorsOptions } from './cors-options';

async function bootstrap() {
  /** API listen port. */
  const port = process.env.PORT || 3030;
  /** Nest application instance. */
  const app = await NestFactory.create(AppModule);

  app.enableCors(createCorsOptions());
  await app.listen(port);
}
bootstrap();
