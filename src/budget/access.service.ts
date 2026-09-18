import { UnitOfWork } from './unit-of-work';
import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Actor, AuditService } from './audit';
import { Group, GroupMember } from './entities';
import { QueryDto } from './dto';

@Injectable()
export class AccessService {
  constructor(
    readonly db: DataSource,
    readonly audit: AuditService,
    private readonly unitOfWork: UnitOfWork,
  ) {}
  admin(a: Actor) {
    if (a.role !== 'owner' && a.role !== 'admin')
      throw new ForbiddenException(
        'Se requiere administrador de la organización',
      );
  }
  owner(a: Actor) {
    if (a.role !== 'owner')
      throw new ForbiddenException('Se requiere dueño de la organización');
  }
  write<T>(a: Actor, work: (m: EntityManager) => Promise<T>) {
    return this.unitOfWork.run(a, work);
  }
  async group(m: EntityManager, a: Actor, id: string, owner = false) {
    const group = await m.findOneBy(Group, {
      id,
      organizationId: a.organizationId,
    });
    if (
      !group ||
      !(await m.existsBy(GroupMember, {
        organizationId: a.organizationId,
        groupId: id,
        userId: a.id,
      }))
    )
      throw new NotFoundException('Grupo no encontrado');
    if (owner && group.ownerId !== a.id)
      throw new ForbiddenException('Solo el creador puede modificar el grupo');
    return group;
  }
  async groupIds(m: EntityManager, a: Actor) {
    return (
      await m.findBy(GroupMember, {
        organizationId: a.organizationId,
        userId: a.id,
      })
    ).map((g) => g.groupId);
  }
  personal(a: Actor, q: QueryDto) {
    if (q.userId && q.userId !== a.id)
      throw new ForbiddenException(
        'Los saldos e ingresos de otros usuarios son privados',
      );
    if (q.groupId)
      throw new BadRequestException(
        'Este recurso es personal; no admite groupId',
      );
  }
  async scope(a: Actor, q: QueryDto, m = this.db.manager) {
    if (q.dateFrom && q.dateTo && q.dateFrom > q.dateTo)
      throw new BadRequestException('Rango de fechas inválido');
    if (q.groupId) {
      await this.group(m, a, q.groupId);
      if (
        q.userId &&
        !(await m.existsBy(GroupMember, {
          organizationId: a.organizationId,
          groupId: q.groupId,
          userId: q.userId,
        }))
      )
        throw new NotFoundException('Integrante no encontrado');
    } else if (q.userId && q.userId !== a.id)
      throw new ForbiddenException(
        'Para filtrar otro integrante se requiere un grupo compartido',
      );
  }
  paginate<T>(rows: T[], q: QueryDto) {
    const page = q.page ?? 1,
      limit = q.limit ?? 25;
    return {
      data: rows.slice((page - 1) * limit, page * limit),
      total: rows.length,
      page,
      limit,
    };
  }
}
