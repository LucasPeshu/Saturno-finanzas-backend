import { INestApplication } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcryptjs';
import request = require('supertest');
import { AppModule } from '../src/app.module';
import { databaseOptions } from '../src/budget/database';
import { configureApp } from '../src/budget/configure-app';
import {
  AuditLog,
  Category,
  Expense,
  Income,
  Organization,
  User,
  WalletMovement,
} from '../src/budget/entities';
import { AuditService } from '../src/budget/audit';
import { FinanceService } from '../src/budget/finance.service';
import { SeedService } from '../src/budget/seed';

describe('Budget API with isolated PostgreSQL', () => {
  let app: INestApplication, db: DataSource;
  let a: User, b: User, outsider: User, alien: User;
  let tokenA: string,
    tokenB: string,
    tokenOut: string,
    tokenAlien: string,
    category: Category;
  const date = '2026-01-10',
    password = 'test-password-123';
  const money = (amount: number) => ({
    amount,
    date,
    idempotencyKey: randomUUID(),
  });
  const post = (token: string, path: string, body: object = {}) =>
    request(app.getHttpServer())
      .post('/api/v1/' + path)
      .auth(token, { type: 'bearer' })
      .send(body);
  const get = (token: string, path: string) =>
    request(app.getHttpServer())
      .get('/api/v1/' + path)
      .auth(token, { type: 'bearer' });
  const patch = (token: string, path: string, body: object) =>
    request(app.getHttpServer())
      .patch('/api/v1/' + path)
      .auth(token, { type: 'bearer' })
      .send(body);
  async function login(user: User) {
    const res = await request(app.getHttpServer())
      .post('/api/v1/auth/login')
      .send({ email: user.email, password })
      .expect(200);
    expect(res.body.user.password).toBeUndefined();
    return res.body.token;
  }
  beforeAll(async () => {
    if (process.env.POSTGRES_DATABASE !== 'control_gastos_test')
      throw new Error('Tests require an isolated database');
    const setup = new DataSource(databaseOptions());
    await setup.initialize();
    await setup.runMigrations();
    await setup.destroy();
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    db = app.get(DataSource);
    const org = await db.manager.save(Organization, {
      name: 'Test A',
      slug: 'test-a',
    });
    const orgB = await db.manager.save(Organization, {
      name: 'Test B',
      slug: 'test-b',
    });
    const hash = await bcrypt.hash(password, 4);
    const create = (
      name: string,
      organizationId: number,
      role: 'owner' | 'admin' | 'member',
    ) =>
      db.manager.save(
        User,
        db.manager.create(User, {
          name,
          email: name + '@example.test',
          organizationId,
          password: hash,
          role,
        }),
      );
    a = await create('alice', org.id, 'owner');
    b = await create('bob', org.id, 'member');
    outsider = await create('outsider', org.id, 'member');
    alien = await create('alien', orgB.id, 'admin');
    category = await db.manager.save(Category, {
      organizationId: org.id,
      name: 'Alquiler',
      priority: 100,
    });
    tokenA = await login(a);
    tokenB = await login(b);
    tokenOut = await login(outsider);
    tokenAlien = await login(alien);
  });
  afterAll(async () => {
    if (app) await app.close();
  });
  it('rejects incomplete, mismatched and legacy session claims', async () => {
    const jwt = app.get(JwtService);
    for (const claims of [
      {},
      { sub: a.id },
      { organizationId: a.organizationId },
      { sub: String(a.id), organizationId: a.organizationId },
      { sub: a.id, organizationId: alien.organizationId },
    ]) {
      await get(await jwt.signAsync(claims), 'users/me').expect(401);
    }
    const legacy = new JwtService({ secret: process.env.JWT_SECRET });
    await get(
      await legacy.signAsync({ sub: a.id, organizationId: a.organizationId }),
      'users/me',
    ).expect(401);
  });
  it('removes old routes and rejects unauthenticated and cross-tenant reads', async () => {
    await get(tokenA, 'whatsapp').expect(404);
    await get(tokenA, 'clients').expect(404);
    await request(app.getHttpServer()).get('/api/v1/incomes').expect(401);
    await get(tokenA, 'incomes?userId=' + b.id).expect(403);
    await get(tokenAlien, 'categories')
      .expect(200)
      .then((r) => expect(r.body.total).toBe(0));
    await post(tokenAlien, 'expenses', {
      description: 'foreign',
      amount: 100,
      categoryId: category.id,
      kind: 'extra',
      dueDate: date,
    }).expect(404);
  });
  it('creates users only inside the session organization and never leaks credentials', async () => {
    await post(tokenB, 'users', {
      name: 'bad',
      email: 'bad@example.test',
      password,
    }).expect(403);
    const result = await post(tokenA, 'users', {
      name: 'New',
      email: 'new@example.test',
      password,
    }).expect(201);
    expect(result.body.organizationId).toBe(a.organizationId);
    expect(result.body.password).toBeUndefined();
    await post(tokenA, 'users', {
      name: 'Injected',
      email: 'injected@example.test',
      password,
      organizationId: alien.organizationId,
    }).expect(400);
  });
  it('keeps shared expense snapshots and pays only each member share', async () => {
    const group = (await post(tokenA, 'groups', { name: 'Casa' }).expect(201))
      .body;
    await post(tokenA, 'groups/' + group.id + '/invitations', {
      userId: alien.id,
    }).expect(404);
    const invitation = (
      await post(tokenA, 'groups/' + group.id + '/invitations', {
        userId: b.id,
      }).expect(201)
    ).body;
    await post(tokenOut, 'group-invitations/' + invitation.id + '/respond', {
      status: 'accepted',
    }).expect(404);
    await post(tokenB, 'group-invitations/' + invitation.id + '/respond', {
      status: 'accepted',
    }).expect(201);
    const template = (
      await post(tokenA, 'expense-templates', {
        description: 'Alquiler mensual',
        amount: 600000,
        categoryId: category.id,
        groupId: group.id,
        dueDay: 31,
        startMonth: '2026-01',
      }).expect(201)
    ).body;
    const january = (
      await post(tokenA, 'expense-templates/' + template.id + '/generate', {
        month: '2026-01',
      }).expect(201)
    ).body;
    expect(january.shares.map((s: { amount: number }) => s.amount)).toEqual([
      300000, 300000,
    ]);
    await patch(tokenA, 'expense-templates/' + template.id, {
      amount: 700000,
    }).expect(200);
    const february = (
      await post(tokenA, 'expense-templates/' + template.id + '/generate', {
        month: '2026-02',
      }).expect(201)
    ).body;
    expect(february.amount).toBe(700000);
    expect(february.dueDate).toBe('2026-02-28');
    const again = (
      await post(tokenA, 'expense-templates/' + template.id + '/generate', {
        month: '2026-01',
      }).expect(201)
    ).body;
    expect(again.id).toBe(january.id);
    expect(again.amount).toBe(600000);
    await get(tokenOut, 'expenses/' + january.id).expect(404);
    await get(tokenAlien, 'expenses/' + january.id).expect(404);
    await post(tokenA, 'incomes', {
      ...money(1100000),
      source: 'Trabajo',
    }).expect(201);
    await post(tokenB, 'incomes', {
      ...money(400000),
      source: 'Trabajo',
    }).expect(201);
    const payment = (
      await post(
        tokenA,
        'expenses/' + january.id + '/payments',
        money(300000),
      ).expect(201)
    ).body;
    await post(tokenA, 'expenses/' + january.id + '/payments', money(1)).expect(
      400,
    );
    await post(
      tokenB,
      'expenses/' + january.id + '/payments',
      money(300000),
    ).expect(201);
    const detail = (await get(tokenB, 'expenses/' + january.id).expect(200))
      .body;
    expect(
      detail.shares.every((s: { remaining: number }) => s.remaining === 0),
    ).toBe(true);
    const dashboard = (
      await get(
        tokenA,
        'stats/dashboard?dateFrom=2026-01-01&dateTo=2026-01-31',
      ).expect(200)
    ).body;
    expect(dashboard.balance).toBe(800000);
    expect(dashboard.expenses).toBe(300000);
    await post(tokenA, 'payments/' + payment.record.id + '/reverse', {
      date: '2026-02-01',
      reason: 'Corrección',
      idempotencyKey: randomUUID(),
    }).expect(201);
    const historical = (
      await get(
        tokenA,
        'stats/dashboard?dateFrom=2026-01-01&dateTo=2026-01-31',
      ).expect(200)
    ).body;
    expect(historical.expenses).toBe(300000);
    expect(historical.balance).toBe(800000);
    const groupStats = (
      await get(
        tokenB,
        'stats/dashboard?groupId=' +
          group.id +
          '&dateFrom=2026-01-01&dateTo=2026-01-31',
      ).expect(200)
    ).body;
    expect(groupStats.paid).toBe(600000);
    expect(groupStats.balance).toBeUndefined();
    await get(tokenOut, 'stats/dashboard?groupId=' + group.id).expect(404);
  });
  it('keeps USD savings separate, uses manual rates and reserves for other goals', async () => {
    await post(tokenOut, 'incomes', {
      ...money(2000000),
      source: 'Trabajo',
    }).expect(201);
    const phone = (
      await post(tokenOut, 'goals', {
        name: 'iPhone',
        currency: 'USD',
        targetAmount: 700,
      }).expect(201)
    ).body;
    await post(tokenOut, 'savings/movements', {
      ...money(700),
      currency: 'USD',
      direction: 'deposit',
      goalId: phone.id,
      description: 'Ahorro',
    }).expect(400);
    await post(tokenOut, 'savings/movements', {
      ...money(700),
      currency: 'USD',
      direction: 'deposit',
      exchangeRate: 1000,
      goalId: phone.id,
      description: 'Compra USD',
    }).expect(201);
    let detail = (await get(tokenOut, 'goals/' + phone.id).expect(200)).body;
    expect(detail.saved).toBe(700);
    expect(detail.status).toBe('active');
    expect(detail.recommendation.recommendedToBuy).toBe(true);
    await post(tokenOut, 'goals', {
      name: 'Auto',
      currency: 'USD',
      targetAmount: 15000,
    }).expect(201);
    detail = (await get(tokenOut, 'goals/' + phone.id).expect(200)).body;
    expect(detail.recommendation.recommendedToBuy).toBe(false);
    await post(tokenOut, 'savings/movements', {
      ...money(600),
      currency: 'USD',
      direction: 'deposit',
      exchangeRate: 1000,
      description: 'Reserva otras metas',
    }).expect(201);
    detail = (await get(tokenOut, 'goals/' + phone.id).expect(200)).body;
    expect(detail.recommendation.recommendedToBuy).toBe(true);
    await post(tokenOut, 'goals/' + phone.id + '/complete').expect(400);
    let stats = (
      await get(
        tokenOut,
        'stats/dashboard?dateFrom=2026-01-01&dateTo=2026-01-31',
      ).expect(200)
    ).body;
    expect(stats.balance).toBe(700000);
    expect(stats.savings.USD).toBe(1300);
    await post(tokenOut, 'savings/movements', {
      ...money(100),
      currency: 'USD',
      direction: 'withdraw',
      exchangeRate: 1200,
      description: 'Venta USD',
    }).expect(201);
    stats = (
      await get(
        tokenOut,
        'stats/dashboard?dateFrom=2026-01-01&dateTo=2026-01-31',
      ).expect(200)
    ).body;
    expect(stats.balance).toBe(820000);
    expect(stats.savings.USD).toBe(1200);
    await post(tokenOut, 'savings/movements', {
      ...money(700),
      currency: 'USD',
      direction: 'spend',
      exchangeRate: 1100,
      goalId: phone.id,
      description: 'Compra iPhone',
    }).expect(201);
    await post(tokenOut, 'goals/' + phone.id + '/complete').expect(201);
    stats = (
      await get(
        tokenOut,
        'stats/dashboard?dateFrom=2026-01-01&dateTo=2026-01-31',
      ).expect(200)
    ).body;
    expect(stats.balance).toBe(820000);
    expect(stats.savings.USD).toBe(500);
  });
  it('protects shared goals and each member savings ownership', async () => {
    const group = (await post(tokenA, 'groups', { name: 'Viaje' })).body;
    const invite = (
      await post(tokenA, 'groups/' + group.id + '/invitations', {
        userId: b.id,
      })
    ).body;
    await post(tokenB, 'group-invitations/' + invite.id + '/respond', {
      status: 'accepted',
    }).expect(201);
    const goal = (
      await post(tokenA, 'goals', {
        name: 'Viaje',
        currency: 'ARS',
        targetAmount: 100000,
        groupId: group.id,
      }).expect(201)
    ).body;
    await post(tokenA, 'savings/movements', {
      ...money(70000),
      currency: 'ARS',
      direction: 'deposit',
      goalId: goal.id,
      description: 'Mi parte',
    }).expect(201);
    await post(tokenB, 'savings/movements', {
      ...money(30000),
      currency: 'ARS',
      direction: 'deposit',
      goalId: goal.id,
      description: 'Mi parte',
    }).expect(201);
    const details = (await get(tokenB, 'goals/' + goal.id).expect(200)).body;
    expect(details.saved).toBe(100000);
    expect(details.contributors).toHaveLength(2);
    await post(tokenB, 'savings/movements', {
      ...money(40000),
      currency: 'ARS',
      direction: 'withdraw',
      goalId: goal.id,
      description: 'Exceso',
    }).expect(400);
    await get(tokenOut, 'goals/' + goal.id).expect(404);
    await get(tokenAlien, 'goals/' + goal.id).expect(404);
    await get(tokenB, 'wallet/movements?userId=' + a.id).expect(403);
  });
  it('deduplicates concurrent commands and rejects key reuse with changed payload', async () => {
    const body = { ...money(1234), source: 'Idempotencia' };
    const [x, y] = await Promise.all([
      post(tokenA, 'incomes', body),
      post(tokenA, 'incomes', body),
    ]);
    expect(x.status).toBe(201);
    expect(y.status).toBe(201);
    expect(x.body.movement.id).toBe(y.body.movement.id);
    expect(
      await db.manager.countBy(WalletMovement, {
        idempotencyKey: body.idempotencyKey,
      }),
    ).toBe(1);
    await post(tokenA, 'incomes', { ...body, amount: 1235 }).expect(409);
  });
  it('prevents concurrent overspending and backdated negative balances', async () => {
    const user = (
      await post(tokenA, 'users', {
        name: 'Concurrent',
        email: 'concurrent@example.test',
        password,
      })
    ).body;
    const token = await login(user);
    await post(token, 'incomes', { ...money(100), source: 'Base' }).expect(201);
    const e = (
      await post(token, 'expenses', {
        description: 'Pago',
        amount: 200,
        categoryId: category.id,
        kind: 'daily',
        dueDate: date,
      })
    ).body;
    const results = await Promise.all([
      post(token, 'expenses/' + e.id + '/payments', money(80)),
      post(token, 'expenses/' + e.id + '/payments', money(80)),
    ]);
    expect(results.map((r) => r.status).sort()).toEqual([201, 400]);
    await post(token, 'expenses/' + e.id + '/payments', {
      ...money(10),
      date: '2026-01-01',
    }).expect(400);
    const stats = (
      await get(token, 'stats/dashboard?dateFrom=2026-01-01&dateTo=2026-01-31')
    ).body;
    expect(stats.balance).toBe(20);
  });
  it('rolls back the financial change when transactional audit fails', async () => {
    const audit = app.get(AuditService);
    const before = await db.manager.count(Income);
    const spy = jest
      .spyOn(audit, 'record')
      .mockRejectedValueOnce(new Error('Audit storage unavailable'));
    await expect(
      app.get(FinanceService).income(a, { ...money(99), source: 'Rollback' }),
    ).rejects.toThrow('Audit storage unavailable');
    spy.mockRestore();
    expect(await db.manager.count(Income)).toBe(before);
  });
  it('enforces database tenancy and immutable journals, and redacts secrets', async () => {
    await expect(
      db.manager.save(Expense, {
        organizationId: alien.organizationId,
        ownerId: alien.id,
        description: 'Invalid cross tenant',
        amount: 10,
        categoryId: category.id,
        categoryName: 'Alquiler',
        priority: 100,
        discretionary: false,
        kind: 'extra',
        month: '2026-01',
        dueDate: date,
      }),
    ).rejects.toThrow();
    const movement = await db.manager.findOneByOrFail(WalletMovement, {
      userId: a.id,
    });
    await expect(
      db.manager.update(WalletMovement, movement.id, { amount: 1 }),
    ).rejects.toThrow('Immutable journal');
    const log = await db.manager.findOneByOrFail(AuditLog, {
      organizationId: a.organizationId,
    });
    await expect(db.manager.delete(AuditLog, log.id)).rejects.toThrow(
      'Immutable journal',
    );
    const logs = await get(tokenA, 'audit-logs').expect(200);
    expect(JSON.stringify(logs.body)).not.toContain(password);
    expect(
      logs.body.data.every(
        (l: { organizationId: number }) =>
          l.organizationId === a.organizationId,
      ),
    ).toBe(true);
    const mine = (await get(tokenB, 'audit-logs').expect(200)).body.data;
    expect(mine.every((l: { actorId: number }) => l.actorId === b.id)).toBe(
      true,
    );
  });
  it('seeds the organization idempotently without resetting an existing user', async () => {
    process.env.SEED_ENABLED = 'true';
    process.env.SEED_ORGANIZATION_SLUG = 'seed-test';
    process.env.SEED_ADMIN_EMAIL = 'seed@example.test';
    process.env.SEED_ADMIN_PASSWORD = password;
    const seed = app.get(SeedService);
    await seed.onApplicationBootstrap();
    const first = await db.manager.count(AuditLog);
    await seed.onApplicationBootstrap();
    expect(await db.manager.count(AuditLog)).toBe(first);
    expect(await db.manager.countBy(Organization, { slug: 'seed-test' })).toBe(
      1,
    );
    process.env.SEED_ENABLED = 'false';
  });
});
