import { BadRequestException, Injectable } from '@nestjs/common';
import { In } from 'typeorm';
import { AccessService } from './access.service';
import { Actor } from './audit';
import {
  Expense,
  ExpensePayment,
  ExpenseShare,
  Income,
  SavingMovement,
  User,
  WalletMovement,
} from './entities';
import { QueryDto } from './dto';
import { FinanceService } from './finance.service';
import {
  allocation,
  amount,
  cents,
  dueDate,
  sumMoney,
  TIMEZONE,
  today,
} from './calculations';

@Injectable()
export class StatsService {
  constructor(
    readonly access: AccessService,
    readonly finance: FinanceService,
  ) {}
  async dashboard(a: Actor, q: QueryDto) {
    await this.access.scope(a, q);
    const dateTo =
      q.dateTo ??
      (q.month ? [dueDate(q.month, 31), today()].sort()[0] : today());
    const dateFrom =
      q.dateFrom ?? (q.month ? q.month + '-01' : dateTo.slice(0, 7) + '-01');
    if (dateFrom > dateTo || dateTo > today())
      throw new BadRequestException(
        'El dashboard de movimientos realizados requiere un rango válido hasta hoy',
      );
    const inRange = (date: string) => date >= dateFrom && date <= dateTo;
    return this.access.db.transaction('REPEATABLE READ', async (m) => {
      if (q.groupId) {
        await this.access.group(m, a, q.groupId);
        const expenses = await m.findBy(Expense, {
          organizationId: a.organizationId,
          groupId: q.groupId,
          cancelled: false,
        });
        const ids = expenses.map((e) => e.id);
        const shares = await m.findBy(ExpenseShare, {
          organizationId: a.organizationId,
          expenseId: In(ids),
          ...(q.userId ? { userId: q.userId } : {}),
        });
        const payments = await m.findBy(ExpensePayment, {
          organizationId: a.organizationId,
          expenseId: In(ids),
          ...(q.userId ? { userId: q.userId } : {}),
        });
        const netPaid = (p: ExpensePayment) =>
          (inRange(p.date) ? cents(p.amount) : 0) -
          (p.reversedOn && inRange(p.reversedOn) ? cents(p.amount) : 0);
        const pending = shares
          .filter((s) =>
            expenses.some((e) => e.id === s.expenseId && e.dueDate <= dateTo),
          )
          .map((s) => {
            const paid = payments
              .filter(
                (p) =>
                  p.expenseId === s.expenseId &&
                  p.userId === s.userId &&
                  p.date <= dateTo &&
                  (!p.reversedOn || p.reversedOn > dateTo),
              )
              .reduce((v, p) => v + cents(p.amount), 0);
            return Math.max(0, cents(s.amount) - paid);
          })
          .reduce((v, n) => v + n, 0);
        return {
          scope: 'group',
          groupId: q.groupId,
          dateFrom,
          dateTo,
          timezone: TIMEZONE,
          planned: sumMoney(
            shares
              .filter((s) =>
                expenses.some(
                  (e) => e.id === s.expenseId && inRange(e.dueDate),
                ),
              )
              .map((s) => s.amount),
          ),
          paid: amount(payments.reduce((v, p) => v + netPaid(p), 0)),
          pending: amount(pending),
        };
      }
      this.access.personal(a, q);
      const user = await m.findOneByOrFail(User, {
        id: a.id,
        organizationId: a.organizationId,
      });
      const wallet = await m.findBy(WalletMovement, {
        organizationId: a.organizationId,
        userId: a.id,
      });
      const history = wallet.filter((w) => w.date <= dateTo);
      const period = history.filter((w) => inRange(w.date));
      const incomeRecords = await m.findBy(Income, {
        organizationId: a.organizationId,
        userId: a.id,
      });
      const payments = await m.findBy(ExpensePayment, {
        organizationId: a.organizationId,
        userId: a.id,
      });
      const shares = await m.findBy(ExpenseShare, {
        organizationId: a.organizationId,
        userId: a.id,
      });
      const expenses = await m.findBy(Expense, {
        organizationId: a.organizationId,
        id: In(shares.map((s) => s.expenseId)),
        cancelled: false,
      });
      const endOfMonth = dueDate(dateTo.slice(0, 7), 31);
      const obligations = expenses
        .filter((e) => e.dueDate <= endOfMonth)
        .map((e) => {
          const share = shares.find((s) => s.expenseId === e.id)!;
          const paid = payments
            .filter(
              (p) =>
                p.expenseId === e.id &&
                p.date <= dateTo &&
                (!p.reversedOn || p.reversedOn > dateTo),
            )
            .reduce((v, p) => v + cents(p.amount), 0);
          return {
            id: e.id,
            description: e.description,
            priority: e.priority,
            dueDate: e.dueDate,
            remaining: amount(Math.max(0, cents(share.amount) - paid)),
          };
        })
        .filter((e) => e.remaining > 0);
      const balance = sumMoney(history.map((w) => w.amount));
      const savings = (
        await m.findBy(SavingMovement, {
          organizationId: a.organizationId,
          userId: a.id,
        })
      ).filter((s) => s.date <= dateTo);
      const netSaving = (currency: 'ARS' | 'USD', items: SavingMovement[]) =>
        sumMoney(
          items
            .filter((s) => s.currency === currency)
            .map((s) => (s.direction === 'deposit' ? s.amount : -s.amount)),
        );
      const periodSavedArs = sumMoney(
        savings
          .filter((s) => inRange(s.date))
          .map((s) => (s.direction === 'deposit' ? s.arsAmount : -s.arsAmount)),
      );
      const netRealized = (rows: (Income | ExpensePayment)[]) =>
        amount(
          rows.reduce(
            (v, row) =>
              v +
              (inRange(row.date) ? cents(row.amount) : 0) -
              (row.reversedOn && inRange(row.reversedOn)
                ? cents(row.amount)
                : 0),
            0,
          ),
        );
      const byCategory = expenses
        .map((e) => {
          const paid = payments.filter((p) => p.expenseId === e.id);
          return {
            categoryId: e.categoryId,
            name: e.categoryName,
            discretionary: e.discretionary,
            paid: netRealized(paid),
          };
        })
        .reduce(
          (rows, item) => {
            const found = rows.find(
              (r) => r.categoryId === item.categoryId && r.name === item.name,
            );
            if (found)
              found.paid = amount(cents(found.paid) + cents(item.paid));
            else rows.push(item);
            return rows;
          },
          [] as {
            categoryId: string;
            name: string;
            discretionary: boolean;
            paid: number;
          }[],
        );
      const daily = [...new Set(period.map((w) => w.date))]
        .sort()
        .map((date) => ({
          date,
          net: sumMoney(
            period.filter((w) => w.date === date).map((w) => w.amount),
          ),
        }));
      return {
        scope: 'personal',
        dateFrom,
        dateTo,
        timezone: TIMEZONE,
        currency: 'ARS',
        openingBalance: sumMoney(
          history.filter((w) => w.date < dateFrom).map((w) => w.amount),
        ),
        balance,
        income: netRealized(incomeRecords),
        expenses: netRealized(payments),
        savings: {
          ARS: netSaving('ARS', savings),
          USD: netSaving('USD', savings),
          period: {
            ARS: netSaving(
              'ARS',
              savings.filter((s) => inRange(s.date)),
            ),
            USD: netSaving(
              'USD',
              savings.filter((s) => inRange(s.date)),
            ),
          },
          depositedArs: sumMoney(
            savings
              .filter((s) => s.direction === 'deposit' && inRange(s.date))
              .map((s) => s.arsAmount),
          ),
          withdrawnArs: sumMoney(
            savings
              .filter((s) => s.direction === 'withdraw' && inRange(s.date))
              .map((s) => s.arsAmount),
          ),
          spentArs: sumMoney(
            savings
              .filter((s) => s.direction === 'spend' && inRange(s.date))
              .map((s) => s.arsAmount),
          ),
        },
        allocation: allocation(
          balance,
          obligations,
          user.savingsPercent,
          user.reservePercent,
          periodSavedArs,
        ),
        byCategory,
        daily,
      };
    });
  }
}
