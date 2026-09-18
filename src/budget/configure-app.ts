import {
  BadRequestException,
  INestApplication,
  ValidationPipe,
} from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { randomUUID } from 'node:crypto';
import { Request, Response, NextFunction } from 'express';
import { requestContext } from './audit';

// PATCH nulls must not silently bypass IsOptional and violate persistence rules.
function rejectNull(value: unknown) {
  if (value === null)
    throw new BadRequestException(
      'Omitir los campos opcionales en lugar de enviar null',
    );
  if (Array.isArray(value)) value.forEach(rejectNull);
  else if (value && typeof value === 'object')
    Object.values(value).forEach(rejectNull);
}
export function configureApp(app: INestApplication) {
  app.setGlobalPrefix('api/v1');
  app.use((req: Request, res: Response, next: NextFunction) => {
    const requestId = randomUUID();
    res.setHeader('X-Request-Id', requestId);
    requestContext.run({ requestId, ip: req.ip ?? null }, next);
  });
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3001')
      .split(',')
      .map((v) => v.trim()),
    credentials: true,
  });
  app.useGlobalPipes(
    {
      transform: (value: unknown) => {
        rejectNull(value);
        return value;
      },
    },
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  const document = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Control de gastos')
      .setDescription(
        'Organizaciones, grupos, gastos, ingresos, cartera, ahorros, metas y auditoría. Fechas de Argentina; conversión manual ARS/USD.',
      )
      .setVersion('1.0.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, document);
}
