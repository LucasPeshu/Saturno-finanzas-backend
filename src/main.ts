import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './budget/configure-app';

async function bootstrap() {
  process.env.TZ = 'America/Argentina/Buenos_Aires';
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(Number(process.env.PORT ?? 3000));
}
void bootstrap();
