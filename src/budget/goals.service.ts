import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { AccessService } from './access.service';
import { Actor } from './audit';
import { Goal, SavingMovement, User } from './entities';
import { GoalDto, QueryDto, UpdateGoalDto } from './dto';
import { FinanceService } from './finance.service';
import {
  amount,
  cents,
  goalRecommendation,
  sumMoney,
  today,
} from './calculations';

@Injectable()
export class GoalsService {
  constructor(
    readonly access: AccessService,
    readonly finance: FinanceService,
  ) {}
  async create(a: Actor, dto: GoalDto) {
    return this.access.write(a, async (m) => {
      if (dto.groupId) await this.access.group(m, a, dto.groupId);
      const goal = await m.save(
        Goal,
        m.create(Goal, {
          ...dto,
          organizationId: a.organizationId,
          ownerId: a.id,
          groupId: dto.groupId ?? null,
          targetDate: dto.targetDate ?? null,
        }),
      );
      await this.access.audit.record(m, a, 'CREATE', 'goals', goal);
      return goal;
    });
  }
  async update(a: Actor, id: number, dto: UpdateGoalDto) {
    return this.access.write(a, async (m) => {
      const goal = await this.finance.visibleGoal(m, a, id);
      if (goal.ownerId !== a.id)
        throw new ForbiddenException('Solo el creador puede editar la meta');
      if (goal.status !== 'active')
        throw new BadRequestException('La meta ya está cerrada');
      const before = { ...goal };
      Object.assign(goal, dto);
      await m.save(goal);
      await this.access.audit.record(m, a, 'UPDATE', 'goals', goal, before);
      return goal;
    });
  }
  async close(a: Actor, id: number, status: 'completed' | 'cancelled') {
    return this.access.write(a, async (m) => {
      const goal = await this.finance.visibleGoal(m, a, id);
      if (goal.ownerId !== a.id)
        throw new ForbiddenException('Solo el creador puede cerrar la meta');
      if (goal.status !== 'active')
        throw new BadRequestException('La meta ya está cerrada');
      if (status === 'completed') {
        const spent = await m.findBy(SavingMovement, {
          organizationId: a.organizationId,
          goalId: id,
          direction: 'spend',
        });
        if (
          cents(sumMoney(spent.map((s) => s.amount))) < cents(goal.targetAmount)
        )
          throw new BadRequestException(
            'Registrá la compra con los ahorros antes de completar la meta',
          );
      }
      const before = { ...goal };
      goal.status = status;
      await m.save(goal);
      await this.access.audit.record(
        m,
        a,
        status === 'completed' ? 'COMPLETE' : 'CANCEL',
        'goals',
        goal,
        before,
      );
      return goal;
    });
  }
  async deleteCancelled(a: Actor, id: number) {
    return this.access.write(a, async (m) => {
      const goal = await this.finance.visibleGoal(m, a, id);
      if (goal.ownerId !== a.id)
        throw new ForbiddenException('Solo el creador puede eliminar la meta');
      if (goal.status !== 'cancelled')
        throw new BadRequestException(
          'Solo se pueden eliminar metas canceladas',
        );
      const before = { ...goal };
      goal.status = 'deleted';
      await m.save(goal);
      await this.access.audit.record(m, a, 'DELETE', 'goals', goal, before);
      return { deleted: true };
    });
  }
  async details(m: EntityManager, a: Actor, id: number, asOf = today()) {
    const goal = await this.finance.visibleGoal(m, a, id);
    if (goal.status === 'deleted') throw new NotFoundException();
    const goals = await m.find(Goal, {
      where: {
        organizationId: a.organizationId,
        ...(goal.groupId ? { groupId: goal.groupId } : { ownerId: a.id }),
      },
    });
    const scopeGoals = goals.filter((g) =>
      goal.groupId ? g.groupId === goal.groupId : g.groupId === null,
    );
    const active = scopeGoals.filter((g) => g.status === 'active');
    const q = m
      .getRepository(SavingMovement)
      .createQueryBuilder('s')
      .where('s.organizationId = :org AND s.date <= :date', {
        org: a.organizationId,
        date: asOf,
      });
    if (goal.groupId)
      q.andWhere('s.goalId IN (:...ids)', { ids: scopeGoals.map((g) => g.id) });
    else
      q.andWhere(
        's.userId = :user AND (s.goalId IS NULL OR s.goalId IN (:...ids))',
        {
          user: a.id,
          ids: scopeGoals.length ? scopeGoals.map((g) => g.id) : [-1],
        },
      );
    const movements = await q.getMany();
    const specific = movements.filter((s) => s.goalId === id);
    const net = (items: SavingMovement[]) =>
      sumMoney(
        items.map((s) => (s.direction === 'deposit' ? s.amount : -s.amount)),
      );
    const saved = net(specific);
    const spent = sumMoney(
      specific.filter((s) => s.direction === 'spend').map((s) => s.amount),
    );
    const pool = net(movements.filter((s) => s.currency === goal.currency));
    // For a shared goal the creator defines one policy for the entire group.
    const policyUser = await m.findOneByOrFail(User, {
      id: goal.ownerId,
      organizationId: a.organizationId,
    });
    const targetRemaining = amount(
      Math.max(0, cents(goal.targetAmount) - cents(spent)),
    );
    const recommendation = goalRecommendation(
      goal.targetAmount,
      saved + spent,
      pool + spent,
      active.filter((g) => g.id !== id).length,
      policyUser.goalBufferPercent,
    );
    const otherAssigned = net(
      movements.filter(
        (s) =>
          s.currency === goal.currency && s.goalId !== null && s.goalId !== id,
      ),
    );
    const requiredSavings = amount(
      cents(targetRemaining) +
        Math.max(cents(recommendation.buffer), cents(otherAssigned)),
    );
    const contributors = [...new Set(specific.map((s) => s.userId))].map(
      (userId) => ({
        userId,
        saved: net(specific.filter((s) => s.userId === userId)),
        spent: sumMoney(
          specific
            .filter((s) => s.userId === userId && s.direction === 'spend')
            .map((s) => s.amount),
        ),
      }),
    );
    return {
      ...goal,
      asOf,
      saved,
      spent,
      contributors,
      recommendation: {
        ...recommendation,
        pool,
        otherAssigned,
        requiredSavings,
        remainingForRecommendation: amount(
          Math.max(0, cents(requiredSavings) - cents(pool)),
        ),
        recommendedToBuy:
          goal.status === 'active' &&
          targetRemaining > 0 &&
          cents(saved) >= cents(targetRemaining) &&
          cents(pool) >= cents(requiredSavings),
        explanation:
          'El ahorro asignado cubre la meta y, después de comprar, conserva las otras asignaciones y el margen por otras metas activas. Nunca se completa automáticamente.',
      },
    };
  }
  async list(a: Actor, q: QueryDto) {
    await this.access.scope(a, q);
    const ids = await this.access.groupIds(this.access.db.manager, a);
    const qb = this.access.db.manager
      .getRepository(Goal)
      .createQueryBuilder('g')
      .where('g.organizationId = :org', { org: a.organizationId })
      .andWhere('g.status != :deleted', { deleted: 'deleted' });
    if (q.groupId) qb.andWhere('g.groupId = :group', { group: q.groupId });
    else
      qb.andWhere(
        '(g.groupId IS NULL AND g.ownerId = :user OR g.groupId IN (:...ids))',
        { user: a.id, ids: ids.length ? ids : [-1] },
      );
    if (q.userId) qb.andWhere('g.ownerId = :owner', { owner: q.userId });
    if (q.dateFrom) qb.andWhere('g.targetDate >= :from', { from: q.dateFrom });
    if (q.dateTo) qb.andWhere('g.targetDate <= :to', { to: q.dateTo });
    const [data, total] = await qb
      .orderBy('g.id', 'DESC')
      .skip(((q.page ?? 1) - 1) * (q.limit ?? 25))
      .take(q.limit ?? 25)
      .getManyAndCount();
    return { data, total, page: q.page ?? 1, limit: q.limit ?? 25 };
  }
}
