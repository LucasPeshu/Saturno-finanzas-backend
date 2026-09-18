import { UnitOfWork } from './budget/unit-of-work';
import { WorkspaceService } from './budget/workspace.service';
import { Module } from '@nestjs/common';
import { APP_FILTER } from '@nestjs/core';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { JwtModule } from '@nestjs/jwt';
import { AuthController, SessionGuard } from './budget/auth';
import { AuditService, ExceptionHandler } from './budget/audit';
import { AccessService } from './budget/access.service';
import { ExpensesService } from './budget/expenses.service';
import { FinanceService } from './budget/finance.service';
import { GoalsService } from './budget/goals.service';
import { StatsService } from './budget/stats.service';
import { CONTROLLERS } from './budget/controllers';
import { databaseOptions } from './budget/database';
import { SeedService } from './budget/seed';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    TypeOrmModule.forRootAsync({ useFactory: () => databaseOptions() }),
    JwtModule.registerAsync({
      global: true,
      useFactory: () => {
        const secret = process.env.JWT_SECRET;
        if (!secret || secret.length < 32)
          throw new Error('JWT_SECRET debe tener al menos 32 caracteres');
        const scope = {
          issuer: 'saturno-control-gastos',
          audience: 'saturno-web',
        };
        return {
          secret,
          signOptions: { expiresIn: '12h', ...scope },
          verifyOptions: scope,
        };
      },
    }),
  ],
  controllers: [AuthController, ...CONTROLLERS],
  providers: [
    UnitOfWork,
    WorkspaceService,
    AuditService,
    AccessService,
    ExpensesService,
    FinanceService,
    GoalsService,
    StatsService,
    SessionGuard,
    SeedService,
    { provide: APP_FILTER, useClass: ExceptionHandler },
  ],
})
export class AppModule {}
