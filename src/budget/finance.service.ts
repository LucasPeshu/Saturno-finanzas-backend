import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import { EntityManager, EntityTarget, FindOptionsWhere } from 'typeorm';
import { AccessService } from './access.service';
import { Actor } from './audit';
import {
  Currency,
  ExpensePayment,
  ExpenseShare,
  Goal,
  Income,
  SavingMovement,
  WalletMovement,
} from './entities';
import { IncomeDto, MoneyDto, QueryDto, ReversalDto, SavingDto } from './dto';
import { amount, cents, realizedDate, sumMoney, today } from './calculations';
import { ExpensesService } from './expenses.service';

function canonical(value: unknown): string {
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  if (value && typeof value === 'object')
    return (
      '{' +
      Object.keys(value)
        .sort()
        .map(
          (k) =>
            JSON.stringify(k) +
            ':' +
            canonical((value as Record<string, unknown>)[k]),
        )
        .join(',') +
      '}'
    );
  return JSON.stringify(value) ?? 'null';
}
@Injectable()
export class FinanceService {
  constructor(
    readonly access: AccessService,
    readonly expenses: ExpensesService,
  ) {}
  async wallet(m: EntityManager, a: Actor, asOf = today()) {
    const result = await m
      .getRepository(WalletMovement)
      .createQueryBuilder('w')
      .select('COALESCE(SUM(w.amount),0)', 'balance')
      .where(
        'w.organizationId = :org AND w.userId = :user AND w.date <= :date',
        { org: a.organizationId, user: a.id, date: asOf },
      )
      .getRawOne<{ balance: string }>();
    return Number(result?.balance ?? 0);
  }
  async assertWalletHistory(m: EntityManager, a: Actor) {
    const rows = await m
      .getRepository(WalletMovement)
      .createQueryBuilder('w')
      .select('w.date', 'date')
      .addSelect('SUM(w.amount)', 'amount')
      .where('w.organizationId = :org AND w.userId = :user', {
        org: a.organizationId,
        user: a.id,
      })
      .groupBy('w.date')
      .orderBy('w.date', 'ASC')
      .getRawMany<{ amount: string }>();
    let balance = 0;
    for (const row of rows) {
      balance += cents(Number(row.amount));
      if (balance < 0)
        throw new BadRequestException(
          'Saldo insuficiente en la fecha del movimiento o en una fecha posterior',
        );
    }
  }
  async savingsBalance(
    m: EntityManager,
    a: Actor,
    currency: Currency,
    goalId: number | null,
    asOf = today(),
  ) {
    const q = m
      .getRepository(SavingMovement)
      .createQueryBuilder('s')
      .select(
        "COALESCE(SUM(CASE WHEN s.direction = 'deposit' THEN s.amount ELSE -s.amount END),0)",
        'balance',
      )
      .where(
        's.organizationId = :org AND s.userId = :user AND s.currency = :currency AND s.date <= :date',
        { org: a.organizationId, user: a.id, currency, date: asOf },
      );
    if (goalId === null) q.andWhere('s.goalId IS NULL');
    else q.andWhere('s.goalId = :goal', { goal: goalId });
    return Number((await q.getRawOne<{ balance: string }>())?.balance ?? 0);
  }
  async assertSavingsHistory(
    m: EntityManager,
    a: Actor,
    currency: Currency,
    goalId: number | null,
  ) {
    const q = m
      .getRepository(SavingMovement)
      .createQueryBuilder('s')
      .select('s.date', 'date')
      .addSelect(
        "SUM(CASE WHEN s.direction = 'deposit' THEN s.amount ELSE -s.amount END)",
        'amount',
      )
      .where(
        's.organizationId = :org AND s.userId = :user AND s.currency = :currency',
        { org: a.organizationId, user: a.id, currency },
      );
    if (goalId === null) q.andWhere('s.goalId IS NULL');
    else q.andWhere('s.goalId = :goal', { goal: goalId });
    const rows = await q
      .groupBy('s.date')
      .orderBy('s.date', 'ASC')
      .getRawMany<{ amount: string }>();
    let balance = 0;
    for (const row of rows) {
      balance += cents(Number(row.amount));
      if (balance < 0)
        throw new BadRequestException(
          'Ahorro insuficiente en esa moneda y objetivo para la fecha indicada',
        );
    }
  }
  async command<
    T extends { id: number; organizationId: number; userId: number },
  >(
    a: Actor,
    operation: string,
    dto: { date: string; idempotencyKey: string },
    entity: EntityTarget<T>,
    work: (m: EntityManager) => Promise<{
      record: T;
      kind: WalletMovement['kind'];
      amount: number;
      description: string;
      before?: T | null;
    }>,
  ) {
    realizedDate(dto.date);
    const requestHash = createHash('sha256')
      .update(canonical({ operation, dto }))
      .digest('hex');
    return this.access.write(a, async (m) => {
      const prior = await m.findOneBy(WalletMovement, {
        organizationId: a.organizationId,
        userId: a.id,
        idempotencyKey: dto.idempotencyKey,
      });
      if (prior) {
        if (prior.requestHash !== requestHash)
          throw new ConflictException(
            'La clave de idempotencia ya se usó para otra operación',
          );
        return {
          movement: prior,
          record: await m.getRepository(entity).findOneByOrFail({
            id: prior.referenceId,
            organizationId: a.organizationId,
            userId: a.id,
          } as FindOptionsWhere<T>),
        };
      }
      const result = await work(m);
      const movement = await m.save(
        WalletMovement,
        m.create(WalletMovement, {
          organizationId: a.organizationId,
          userId: a.id,
          kind: result.kind,
          amount: result.amount,
          date: dto.date,
          description: result.description,
          referenceId: result.record.id,
          idempotencyKey: dto.idempotencyKey,
          requestHash,
        }),
      );
      await this.assertWalletHistory(m, a);
      await this.access.audit.record(
        m,
        a,
        operation,
        m.getRepository(entity).metadata.tableName,
        { ...result.record, walletMovement: movement },
        result.before,
      );
      return { movement, record: result.record };
    });
  }
  income(a: Actor, dto: IncomeDto) {
    return this.command(a, 'INCOME', dto, Income, async (m) => {
      const record = await m.save(
        Income,
        m.create(Income, {
          organizationId: a.organizationId,
          userId: a.id,
          source: dto.source,
          amount: dto.amount,
          date: dto.date,
        }),
      );
      return {
        record,
        kind: 'income',
        amount: dto.amount,
        description: dto.source,
      };
    });
  }
  pay(a: Actor, id: number, dto: MoneyDto) {
    return this.command(a, 'PAY:' + id, dto, ExpensePayment, async (m) => {
      const e = await this.expenses.visible(m, a, id);
      if (e.cancelled) throw new BadRequestException('El gasto está cancelado');
      const share = await m.findOneBy(ExpenseShare, {
        organizationId: a.organizationId,
        expenseId: id,
        userId: a.id,
      });
      if (!share)
        throw new NotFoundException(
          'No tenés una parte asignada en este gasto',
        );
      const payments = await m.findBy(ExpensePayment, {
        organizationId: a.organizationId,
        expenseId: id,
        userId: a.id,
        reversed: false,
      });
      if (
        cents(sumMoney(payments.map((p) => p.amount))) + cents(dto.amount) >
        cents(share.amount)
      )
        throw new BadRequestException('El pago supera tu parte pendiente');
      const record = await m.save(
        ExpensePayment,
        m.create(ExpensePayment, {
          organizationId: a.organizationId,
          userId: a.id,
          expenseId: id,
          amount: dto.amount,
          date: dto.date,
        }),
      );
      return {
        record,
        kind: 'payment',
        amount: -dto.amount,
        description: e.description,
      };
    });
  }
  reverseIncome(a: Actor, id: number, dto: ReversalDto) {
    return this.command(a, 'REVERSE_INCOME:' + id, dto, Income, async (m) => {
      const record = await m.findOneBy(Income, {
        id,
        organizationId: a.organizationId,
        userId: a.id,
      });
      if (!record) throw new NotFoundException();
      if (record.reversed)
        throw new BadRequestException('El ingreso ya fue revertido');
      if (dto.date < record.date)
        throw new BadRequestException(
          'La reversión no puede preceder al ingreso',
        );
      const before = { ...record };
      record.reversed = true;
      record.reversedOn = dto.date;
      await m.save(record);
      return {
        record,
        before,
        kind: 'reversal',
        amount: -record.amount,
        description: dto.reason,
      };
    });
  }
  reversePayment(a: Actor, id: number, dto: ReversalDto) {
    return this.command(
      a,
      'REVERSE_PAYMENT:' + id,
      dto,
      ExpensePayment,
      async (m) => {
        const record = await m.findOneBy(ExpensePayment, {
          id,
          organizationId: a.organizationId,
          userId: a.id,
        });
        if (!record) throw new NotFoundException();
        if (record.reversed)
          throw new BadRequestException('El pago ya fue revertido');
        if (dto.date < record.date)
          throw new BadRequestException(
            'La reversión no puede preceder al pago',
          );
        const before = { ...record };
        record.reversed = true;
        record.reversedOn = dto.date;
        await m.save(record);
        return {
          record,
          before,
          kind: 'reversal',
          amount: record.amount,
          description: dto.reason,
        };
      },
    );
  }
  async visibleGoal(m: EntityManager, a: Actor, id: number) {
    const goal = await m.findOneBy(Goal, {
      id,
      organizationId: a.organizationId,
    });
    if (!goal) throw new NotFoundException();
    if (goal.groupId) await this.access.group(m, a, goal.groupId);
    else if (goal.ownerId !== a.id) throw new NotFoundException();
    return goal;
  }
  saving(a: Actor, dto: SavingDto) {
    return this.command(a, 'SAVING', dto, SavingMovement, async (m) => {
      const goal = dto.goalId ? await this.visibleGoal(m, a, dto.goalId) : null;
      if (goal && goal.currency !== dto.currency)
        throw new BadRequestException('La moneda debe coincidir con la meta');
      if (goal && goal.status !== 'active' && dto.direction !== 'withdraw')
        throw new BadRequestException('La meta no está activa');
      if (dto.direction === 'spend' && !goal)
        throw new BadRequestException(
          'Una compra con ahorros requiere una meta',
        );
      if (
        dto.currency === 'ARS' &&
        dto.exchangeRate !== undefined &&
        dto.exchangeRate !== 1
      )
        throw new BadRequestException('Para pesos la tasa es 1');
      const rate = dto.currency === 'ARS' ? 1 : dto.exchangeRate!;
      if (!Number.isFinite(rate) || rate <= 0)
        throw new BadRequestException(
          'Ingresá la cotización manual de compra o venta',
        );
      const arsAmount = amount(Math.round(dto.amount * rate * 100));
      if (arsAmount <= 0 || arsAmount > 1_000_000_000)
        throw new BadRequestException(
          'El importe convertido está fuera del rango permitido',
        );
      const record = await m.save(
        SavingMovement,
        m.create(SavingMovement, {
          organizationId: a.organizationId,
          userId: a.id,
          goalId: dto.goalId ?? null,
          currency: dto.currency,
          amount: dto.amount,
          arsAmount,
          exchangeRate: rate,
          direction: dto.direction,
          date: dto.date,
          description: dto.description,
        }),
      );
      await this.assertSavingsHistory(m, a, dto.currency, dto.goalId ?? null);
      return {
        record,
        kind:
          dto.direction === 'deposit'
            ? 'saving'
            : dto.direction === 'withdraw'
              ? 'withdrawal'
              : 'goal_purchase',
        amount:
          dto.direction === 'deposit'
            ? -arsAmount
            : dto.direction === 'withdraw'
              ? arsAmount
              : 0,
        description: dto.description,
      };
    });
  }
  async list(a: Actor, q: QueryDto, type: 'incomes' | 'wallet' | 'savings') {
    this.access.personal(a, q);
    await this.access.scope(a, q);
    const entity =
      type === 'incomes'
        ? Income
        : type === 'wallet'
          ? WalletMovement
          : SavingMovement;
    const qb = this.access.db.manager
      .getRepository(entity)
      .createQueryBuilder('e')
      .where('e.organizationId = :org AND e.userId = :user', {
        org: a.organizationId,
        user: a.id,
      });
    if (q.dateFrom) qb.andWhere('e.date >= :from', { from: q.dateFrom });
    if (q.dateTo) qb.andWhere('e.date <= :to', { to: q.dateTo });
    if (q.month)
      qb.andWhere("to_char(e.date, 'YYYY-MM') = :month", { month: q.month });
    const [data, total] = await qb
      .orderBy('e.date', 'DESC')
      .addOrderBy('e.id', 'DESC')
      .skip(((q.page ?? 1) - 1) * (q.limit ?? 25))
      .take(q.limit ?? 25)
      .getManyAndCount();
    return { data, total, page: q.page ?? 1, limit: q.limit ?? 25 };
  }
}
