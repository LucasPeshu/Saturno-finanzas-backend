import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Request, Response } from 'express';
import { AuditLog, User } from './entities';
import { AsyncLocalStorage } from 'node:async_hooks';

export type Actor = Pick<User, 'id' | 'organizationId' | 'email' | 'role'>;
export interface RequestContext {
  requestId: string;
  ip: string | null;
  actor?: Actor;
}
export const requestContext = new AsyncLocalStorage<RequestContext>();
const secret = /password|token|secret|authorization/i;
export function sanitize(value: unknown): unknown {
  if (value == null) return null;
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(sanitize);
  if (typeof value === 'object')
    return Object.fromEntries(
      Object.entries(value)
        .filter(([key]) => !secret.test(key))
        .map(([key, v]) => [key, sanitize(v)]),
    );
  return value;
}
@Injectable()
export class AuditService {
  async record(
    manager: EntityManager,
    actor: Actor | null,
    action: string,
    resource: string,
    after: object,
    before: object | null = null,
    success = true,
  ) {
    const context = requestContext.getStore();
    const current = after as Record<string, unknown>;
    const previous = before as Record<string, unknown> | null;
    await manager.save(
      AuditLog,
      manager.create(AuditLog, {
        organizationId:
          actor?.organizationId ??
          (typeof current.organizationId === 'string'
            ? current.organizationId
            : null),
        actorId: actor?.id ?? null,
        actorEmail: actor?.email ?? null,
        action,
        resource,
        entityId:
          typeof current.id === 'string'
            ? current.id
            : typeof previous?.id === 'string'
              ? previous.id
              : null,
        before: sanitize(before) as Record<string, unknown> | null,
        after: sanitize(after) as Record<string, unknown>,
        success,
        requestId: context?.requestId ?? null,
        ip: context?.ip ?? null,
      }),
    );
  }
}
@Catch()
export class ExceptionHandler implements ExceptionFilter {
  private readonly logger = new Logger(ExceptionHandler.name);
  constructor(
    private readonly db: DataSource,
    private readonly audit: AuditService,
  ) {}
  async catch(error: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const req = http.getRequest<Request>();
    const res = http.getResponse<Response>();
    const status =
      error instanceof HttpException
        ? error.getStatus()
        : error &&
            typeof error === 'object' &&
            'code' in error &&
            error.code === '23505'
          ? 409
          : 500;
    const message =
      error instanceof HttpException
        ? error.getResponse()
        : status === 409
          ? 'Ya existe un registro con esos datos'
          : 'Error interno del servidor';
    if (status === 500) this.logger.error(error);
    if (req.method !== 'GET' || status === 401 || status === 403) {
      try {
        await this.audit.record(
          this.db.manager,
          requestContext.getStore()?.actor ?? null,
          'REJECTED',
          req.path,
          { status },
          null,
          false,
        );
      } catch (auditError) {
        this.logger.error('No se pudo registrar el rechazo', auditError);
      }
    }
    res.status(status).json({
      statusCode: status,
      message,
      requestId: requestContext.getStore()?.requestId,
    });
  }
}
