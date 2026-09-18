import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { DataSource } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { AuditService } from './audit';
import { Category, Organization, User } from './entities';

@Injectable()
export class SeedService implements OnApplicationBootstrap {
  private readonly logger = new Logger(SeedService.name);
  constructor(
    private readonly db: DataSource,
    private readonly audit: AuditService,
  ) {}
  async onApplicationBootstrap() {
    if (process.env.SEED_ENABLED === 'false') return;
    const queryRunner = this.db.createQueryRunner();
    try {
      if (!(await queryRunner.hasTable('organizations')))
        throw new Error(
          'La base de datos no tiene las tablas iniciales. Ejecutá npm run migration:run antes de iniciar el backend.',
        );
    } finally {
      await queryRunner.release();
    }
    const slug = process.env.SEED_ORGANIZATION_SLUG ?? 'principal';
    const name = process.env.SEED_ORGANIZATION_NAME ?? 'Mi organización';
    const email = (process.env.SEED_ADMIN_EMAIL ?? process.env.SEED_USER_EMAIL)
      ?.trim()
      .toLowerCase();
    const password =
      process.env.SEED_ADMIN_PASSWORD ?? process.env.SEED_USER_PASSWORD;
    const userName =
      process.env.SEED_ADMIN_NAME ??
      process.env.SEED_USER_NAME ??
      'Administrador';
    if (
      !email ||
      !password ||
      password.length < 10 ||
      Buffer.byteLength(password) > 72
    )
      throw new Error(
        'Configurar SEED_ADMIN_EMAIL y SEED_ADMIN_PASSWORD (10 a 72 bytes)',
      );
    const hash = await bcrypt.hash(password, 12);
    await this.db.transaction(async (m) => {
      // PostgreSQL transaction advisory lock makes the seed safe across app replicas.
      await m.query('SELECT pg_advisory_xact_lock($1)', [742319]);
      let organization = await m.findOneBy(Organization, { slug });
      if (!organization) {
        organization = await m.save(
          Organization,
          m.create(Organization, { slug, name }),
        );
        await this.audit.record(m, null, 'SEED', 'organizations', {
          ...organization,
          organizationId: organization.id,
        });
      }
      const existing = await m.findOneBy(User, { email });
      if (existing && existing.organizationId !== organization.id)
        throw new Error('El email del seed pertenece a otra organización');
      if (existing) {
        if (existing.role !== 'owner') {
          const before = { ...existing };
          existing.role = 'owner';
          const user = await m.save(User, existing);
          await this.audit.record(m, null, 'UPDATE', 'users', user, before);
        }
      } else {
        const user = await m.save(
          User,
          m.create(User, {
            organizationId: organization.id,
            name: userName,
            email,
            password: hash,
            role: 'owner',
          }),
        );
        await this.audit.record(m, null, 'SEED', 'users', user);
      }
      // Existing credentials, roles and names are never overwritten on restart.
      const defaults = [
        { name: 'Vivienda', priority: 100, discretionary: false },
        { name: 'Servicios', priority: 90, discretionary: false },
        { name: 'Alimentación', priority: 80, discretionary: false },
        { name: 'Transporte', priority: 70, discretionary: false },
        { name: 'Compras planificadas', priority: 40, discretionary: false },
        { name: 'Gastos varios', priority: 10, discretionary: true },
      ];
      for (const item of defaults) {
        if (
          !(await m.existsBy(Category, {
            organizationId: organization.id,
            name: item.name,
          }))
        ) {
          const category = await m.save(
            Category,
            m.create(Category, { ...item, organizationId: organization.id }),
          );
          await this.audit.record(m, null, 'SEED', 'categories', category);
        }
      }
    });
    this.logger.log('Organización inicial verificada');
  }
}
