import { Request } from 'express';
import {
  Body,
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  HttpCode,
  Injectable,
  Post,
  UnauthorizedException,
  UseGuards,
  createParamDecorator,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actor, AuditService, requestContext } from './audit';
import { User } from './entities';
import { LoginDto } from './dto';

export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext) =>
    context.switchToHttp().getRequest<Request & { user: Actor }>().user,
);
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly jwt: JwtService,
    private readonly db: DataSource,
  ) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request & { user: Actor }>();
    const [scheme, token] = (req.headers.authorization ?? '').split(' ');
    if (scheme !== 'Bearer' || !token) throw new UnauthorizedException();
    try {
      const payload = await this.jwt.verifyAsync<{
        sub: string;
        organizationId: string;
      }>(token);
      const uuid =
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
      if (!uuid.test(payload.sub) || !uuid.test(payload.organizationId)) {
        throw new UnauthorizedException();
      }
      const user = await this.db.getRepository(User).findOneBy({
        id: payload.sub,
        organizationId: payload.organizationId,
        active: true,
      });
      if (!user) throw new UnauthorizedException();
      req.user = {
        id: user.id,
        organizationId: user.organizationId,
        email: user.email,
        role: user.role,
      };
      const store = requestContext.getStore();
      if (store) store.actor = req.user;
      return true;
    } catch {
      throw new UnauthorizedException();
    }
  }
}
@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly db: DataSource,
    private readonly jwt: JwtService,
    private readonly audit: AuditService,
  ) {}
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto) {
    const user = await this.db
      .getRepository(User)
      .createQueryBuilder('u')
      .addSelect('u.password')
      .where('u.email = :email AND u.active = true', { email: dto.email })
      .getOne();
    // Always compare, including unknown users, to reduce account enumeration.
    const valid = await bcrypt.compare(
      dto.password,
      user?.password ??
        '$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy',
    );
    if (!user || !valid)
      throw new UnauthorizedException('Credenciales inválidas');
    await this.audit.record(this.db.manager, user, 'LOGIN', 'auth', {
      id: user.id,
    });
    return {
      token: await this.jwt.signAsync({
        sub: user.id,
        organizationId: user.organizationId,
      }),
      user: sanitizeUser(user),
    };
  }
  @Get('profile')
  @ApiBearerAuth()
  @UseGuards(SessionGuard)
  async profile(@CurrentUser() actor: Actor) {
    return this.db
      .getRepository(User)
      .findOneByOrFail({ id: actor.id, organizationId: actor.organizationId });
  }
}
export function sanitizeUser(user: User) {
  const { password: _password, ...safe } = user;
  return safe;
}
