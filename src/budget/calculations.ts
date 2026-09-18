import { BadRequestException } from '@nestjs/common';
import { Split } from './entities';

export const TIMEZONE = 'America/Argentina/Buenos_Aires';
export const cents = (n: number) => Math.round(n * 100);
export const amount = (n: number) => n / 100;
export const sumMoney = (values: number[]) =>
  amount(values.reduce((s, n) => s + cents(n), 0));
export function today(now = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (key: string) => parts.find((p) => p.type === key)!.value;
  return `${value('year')}-${value('month')}-${value('day')}`;
}
export function realizedDate(date: string) {
  if (date > today())
    throw new BadRequestException(
      'Un movimiento realizado no puede tener fecha futura',
    );
}
export function dueDate(month: string, day: number) {
  const [year, m] = month.split('-').map(Number);
  return `${month}-${String(Math.min(day, new Date(Date.UTC(year, m, 0)).getUTCDate())).padStart(2, '0')}`;
}
export function splitAmount(
  total: number,
  members: number[],
  splits?: Split[] | null,
) {
  const ids = [...new Set(members)].sort((a, b) => a - b);
  if (!ids.length)
    throw new BadRequestException('El grupo no tiene integrantes');
  if (
    splits &&
    (!splits.length ||
      new Set(splits.map((s) => s.userId)).size !== splits.length ||
      splits.some((s) => !ids.includes(s.userId)) ||
      splits.reduce((s, p) => s + cents(p.percent), 0) !== 10000)
  ) {
    throw new BadRequestException(
      'El reparto debe sumar 100% y usar integrantes únicos del grupo',
    );
  }
  const weights = splits
    ? [...splits]
        .sort((a, b) => a.userId - b.userId)
        .map((s) => ({ id: s.userId, weight: cents(s.percent) }))
    : ids.map((id) => ({ id, weight: 1 }));
  const denominator = weights.reduce((s, w) => s + w.weight, 0);
  const rows = weights.map((w) => ({
    userId: w.id,
    value: Math.floor((cents(total) * w.weight) / denominator),
    remainder: (cents(total) * w.weight) % denominator,
  }));
  let remaining = cents(total) - rows.reduce((s, r) => s + r.value, 0);
  for (const row of [...rows].sort(
    (a, b) => b.remainder - a.remainder || a.userId - b.userId,
  )) {
    if (remaining-- > 0) row.value++;
  }
  return rows.map((row) => ({ userId: row.userId, amount: amount(row.value) }));
}
export interface Obligation {
  id: number;
  description: string;
  remaining: number;
  priority: number;
  dueDate: string;
}
export function allocation(
  balance: number,
  obligations: Obligation[],
  savingsPercent: number,
  reservePercent: number,
  savedInPeriod = 0,
) {
  let available = Math.max(0, cents(balance));
  const alreadySaved = Math.max(0, cents(savedInPeriod));
  const ordered = [...obligations].sort(
    (a, b) =>
      b.priority - a.priority ||
      a.dueDate.localeCompare(b.dueDate) ||
      a.id - b.id,
  );
  const expenses = ordered.map((e) => {
    const allocated = Math.min(available, cents(e.remaining));
    available -= allocated;
    return {
      ...e,
      allocated: amount(allocated),
      shortfall: amount(cents(e.remaining) - allocated),
    };
  });
  const planningSurplus = available + alreadySaved;
  const savingsTarget = Math.floor((planningSurplus * savingsPercent) / 100);
  const savings = Math.min(
    available,
    Math.max(0, savingsTarget - alreadySaved),
  );
  const reserveTarget = Math.floor((planningSurplus * reservePercent) / 100);
  const reserve = Math.min(Math.max(0, available - savings), reserveTarget);
  return {
    expenses,
    pending: sumMoney(obligations.map((e) => e.remaining)),
    shortfall: sumMoney(expenses.map((e) => e.shortfall)),
    surplus: amount(available),
    suggestedSavings: amount(savings),
    reserve: amount(reserve),
    discretionary: amount(available - savings - reserve),
  };
}
// This is an explicit configurable budgeting rule, never an automatic purchase.
export function goalRecommendation(
  target: number,
  assigned: number,
  pool: number,
  otherActiveGoals: number,
  bufferPercent: number,
) {
  const buffer = Math.round(
    (cents(target) * otherActiveGoals * bufferPercent) / 100,
  );
  const required = cents(target) + buffer;
  return {
    progressPercent: Math.min(
      100,
      Math.round((assigned / target) * 10000) / 100,
    ),
    funded: cents(assigned) >= cents(target),
    otherActiveGoals,
    bufferPercent,
    buffer: amount(buffer),
    requiredSavings: amount(required),
    remainingToTarget: amount(Math.max(0, cents(target) - cents(assigned))),
    remainingForRecommendation: amount(Math.max(0, required - cents(pool))),
    recommendedToBuy:
      cents(assigned) >= cents(target) && cents(pool) >= required,
  };
}
