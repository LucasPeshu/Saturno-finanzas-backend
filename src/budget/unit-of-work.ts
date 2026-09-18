import { ForbiddenException, Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Actor } from './audit';
import { Organization, User } from './entities';

/** Unit of Work: business changes and their audit entries commit or roll back together. */
@Injectable()
export class UnitOfWork {
  constructor(private readonly db: DataSource) {}
  async run<T>(
    actor: Actor,
    work: (manager: EntityManager) => Promise<T>,
  ): Promise<T> {
    return this.db.transaction(async (manager) => {
      // Serializes all financial commands within an organization.
      // Concurrent requests cannot both spend the same available funds.
      await manager.findOneOrFail(Organization, {
        where: { id: actor.organizationId },
        lock: { mode: 'pessimistic_write' },
      });
      const current = await manager.findOneBy(User, {
        id: actor.id,
        organizationId: actor.organizationId,
        active: true,
      });
      if (!current || current.role !== actor.role)
        throw new ForbiddenException(
          'La sesión cambió; iniciar sesión nuevamente',
        );
      return work(manager);
    });
  }
}
