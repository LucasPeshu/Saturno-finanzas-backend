import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EntityManager, In } from 'typeorm';
import { Actor } from './audit';
import { AccessService } from './access.service';
import {
  Category,
  Expense,
  ExpensePayment,
  ExpenseShare,
  ExpenseTemplate,
  GroupMember,
  Tag,
  User,
} from './entities';
import {
  ExpenseDto,
  ExpenseFieldsDto,
  QueryDto,
  TemplateDto,
  UpdateTemplateDto,
} from './dto';
import { amount, cents, dueDate, splitAmount } from './calculations';

@Injectable()
export class ExpensesService {
  constructor(readonly access: AccessService) {}
  async fields(m: EntityManager, a: Actor, dto: ExpenseFieldsDto) {
    const category = await m.findOneBy(Category, {
      id: dto.categoryId,
      organizationId: a.organizationId,
      active: true,
    });
    if (!category) throw new NotFoundException('Categoría no encontrada');
    const tagIds = [...new Set(dto.tagIds ?? [])];
    if (
      tagIds.length &&
      (await m.countBy(Tag, {
        id: In(tagIds),
        organizationId: a.organizationId,
        active: true,
      })) !== tagIds.length
    )
      throw new NotFoundException('Tag no encontrado');
    let members = [a.id];
    if (dto.groupId) {
      await this.access.group(m, a, dto.groupId);
      const membership = await m.findBy(GroupMember, {
        groupId: dto.groupId,
        organizationId: a.organizationId,
      });
      const users = await m.findBy(User, {
        id: In(membership.map((v) => v.userId)),
        organizationId: a.organizationId,
        active: true,
      });
      members = users.map((u) => u.id);
    } else if (dto.splits)
      throw new BadRequestException('Un gasto personal no admite reparto');
    const shares = splitAmount(dto.amount, members, dto.splits);
    return { category, tagIds, shares };
  }
  async createIn(
    m: EntityManager,
    a: Actor,
    dto: ExpenseFieldsDto & {
      kind: 'fixed' | 'extra' | 'daily';
      dueDate: string;
    },
    templateId: number | null = null,
  ) {
    const { category, tagIds, shares } = await this.fields(m, a, dto);
    const expense = await m.save(
      Expense,
      m.create(Expense, {
        organizationId: a.organizationId,
        ownerId: a.id,
        description: dto.description,
        amount: dto.amount,
        groupId: dto.groupId ?? null,
        categoryId: category.id,
        tagIds,
        priority: category.priority,
        categoryName: category.name,
        discretionary: category.discretionary,
        kind: dto.kind,
        dueDate: dto.dueDate,
        month: dto.dueDate.slice(0, 7),
        templateId,
      }),
    );
    const savedShares = await m.save(
      ExpenseShare,
      shares.map((s) =>
        m.create(ExpenseShare, {
          ...s,
          organizationId: a.organizationId,
          expenseId: expense.id,
        }),
      ),
    );
    await this.access.audit.record(m, a, 'CREATE', 'expenses', {
      ...expense,
      shares: savedShares,
    });
    return { ...expense, shares: savedShares };
  }
  create(a: Actor, dto: ExpenseDto) {
    return this.access.write(a, (m) => this.createIn(m, a, dto));
  }
  async createTemplate(a: Actor, dto: TemplateDto) {
    return this.access.write(a, async (m) => {
      await this.fields(m, a, dto);
      if (dto.endMonth && dto.endMonth < dto.startMonth)
        throw new BadRequestException('El fin no puede ser anterior al inicio');
      const template = await m.save(
        ExpenseTemplate,
        m.create(ExpenseTemplate, {
          ...dto,
          organizationId: a.organizationId,
          ownerId: a.id,
          groupId: dto.groupId ?? null,
          splits: dto.splits ?? null,
          tagIds: dto.tagIds ?? [],
          endMonth: dto.endMonth ?? null,
        }),
      );
      await this.access.audit.record(
        m,
        a,
        'CREATE',
        'expense-templates',
        template,
      );
      return template;
    });
  }
  async updateTemplate(a: Actor, id: number, dto: UpdateTemplateDto) {
    return this.access.write(a, async (m) => {
      const template = await m.findOneBy(ExpenseTemplate, {
        id,
        organizationId: a.organizationId,
        ownerId: a.id,
      });
      if (!template) throw new NotFoundException();
      const before = { ...template };
      const next = { ...template, ...dto };
      if (next.endMonth && next.endMonth < next.startMonth)
        throw new BadRequestException('Rango de meses inválido');
      // Archiving still works if a category or a group member was deactivated.
      if (dto.active !== false)
        await this.fields(m, a, {
          ...next,
          groupId: next.groupId ?? undefined,
          splits: next.splits ?? undefined,
        });
      Object.assign(template, dto);
      await m.save(template);
      await this.access.audit.record(
        m,
        a,
        'UPDATE',
        'expense-templates',
        template,
        before,
      );
      return template;
    });
  }
  async generate(a: Actor, id: number, month: string) {
    return this.access.write(a, async (m) => {
      const template = await m.findOneBy(ExpenseTemplate, {
        id,
        organizationId: a.organizationId,
        ownerId: a.id,
      });
      if (!template) throw new NotFoundException();
      const existing = await m.findOneBy(Expense, {
        organizationId: a.organizationId,
        templateId: id,
        month,
      });
      if (existing) return this.detail(m, a, existing.id);
      if (
        !template.active ||
        month < template.startMonth ||
        (template.endMonth && month > template.endMonth)
      )
        throw new BadRequestException(
          'La plantilla no está vigente para ese mes',
        );
      return this.createIn(
        m,
        a,
        {
          ...template,
          groupId: template.groupId ?? undefined,
          splits: template.splits ?? undefined,
          kind: 'fixed',
          dueDate: dueDate(month, template.dueDay),
        },
        id,
      );
    });
  }
  async visible(m: EntityManager, a: Actor, id: number) {
    const expense = await m.findOneBy(Expense, {
      id,
      organizationId: a.organizationId,
    });
    if (!expense) throw new NotFoundException();
    if (expense.groupId) await this.access.group(m, a, expense.groupId);
    else if (expense.ownerId !== a.id) throw new NotFoundException();
    return expense;
  }
  async detail(m: EntityManager, a: Actor, id: number) {
    const expense = await this.visible(m, a, id);
    const shares = await m.findBy(ExpenseShare, {
      organizationId: a.organizationId,
      expenseId: id,
    });
    const payments = await m.find(ExpensePayment, {
      where: { organizationId: a.organizationId, expenseId: id },
      order: { date: 'ASC', id: 'ASC' },
    });
    return {
      ...expense,
      shares: shares.map((s) => {
        const paid = payments
          .filter((p) => p.userId === s.userId && !p.reversed)
          .reduce((v, p) => v + cents(p.amount), 0);
        return {
          ...s,
          paid: amount(paid),
          remaining: amount(cents(s.amount) - paid),
        };
      }),
      payments,
    };
  }
  async list(a: Actor, q: QueryDto, templates = false) {
    await this.access.scope(a, q);
    const m = this.access.db.manager;
    const ids = await this.access.groupIds(m, a);
    const repo = templates
      ? m.getRepository(ExpenseTemplate)
      : m.getRepository(Expense);
    const qb = repo
      .createQueryBuilder('e')
      .where('e.organizationId = :org', { org: a.organizationId });
    if (q.groupId) qb.andWhere('e.groupId = :group', { group: q.groupId });
    else
      qb.andWhere(
        '(e.groupId IS NULL AND e.ownerId = :user OR e.groupId IN (:...ids))',
        { user: a.id, ids: ids.length ? ids : [-1] },
      );
    if (q.userId) {
      if (templates) qb.andWhere('e.ownerId = :owner', { owner: q.userId });
      else
        qb.andWhere(
          'EXISTS (SELECT 1 FROM expense_shares s WHERE s."expenseId" = e.id AND s."userId" = :member AND s."organizationId" = :org)',
          { member: q.userId },
        );
    }
    if (!templates) {
      if (q.month) qb.andWhere('e.month = :month', { month: q.month });
      if (q.dateFrom) qb.andWhere('e.dueDate >= :from', { from: q.dateFrom });
      if (q.dateTo) qb.andWhere('e.dueDate <= :to', { to: q.dateTo });
    }
    const [data, total] = await qb
      .orderBy('e.id', 'DESC')
      .skip(((q.page ?? 1) - 1) * (q.limit ?? 25))
      .take(q.limit ?? 25)
      .getManyAndCount();
    return { data, total, page: q.page ?? 1, limit: q.limit ?? 25 };
  }
  async cancel(a: Actor, id: number) {
    return this.access.write(a, async (m) => {
      const e = await this.visible(m, a, id);
      if (e.ownerId !== a.id)
        throw new ForbiddenException('Solo el creador puede cancelar el gasto');
      if (
        await m.existsBy(ExpensePayment, {
          organizationId: a.organizationId,
          expenseId: id,
          reversed: false,
        })
      )
        throw new BadRequestException('Primero hay que revertir los pagos');
      const before = { ...e };
      e.cancelled = true;
      await m.save(e);
      await this.access.audit.record(m, a, 'CANCEL', 'expenses', e, before);
      return e;
    });
  }
}
