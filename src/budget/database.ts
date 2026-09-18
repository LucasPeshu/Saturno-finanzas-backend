import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { ENTITIES } from './entities';
import { InitialBudget1790000000000 } from './migrations/1790000000000-initial-budget';
import { UserRolesOwnerMember1790000000001 } from './migrations/1790000000001-user-roles-owner-member';
config({ path: resolve(__dirname, '../../.env'), quiet: true });
export function databaseOptions(): DataSourceOptions {
  const database = process.env.POSTGRES_DATABASE ?? 'control_gastos';
  // This backend is a fork: refuse the copied database name even when .env is stale.
  if (!/^control_gastos(?:_[a-z0-9_]+)?$/.test(database))
    throw new Error(
      'POSTGRES_DATABASE debe ser control_gastos o control_gastos_<entorno>',
    );
  return {
    type: 'postgres',
    host: process.env.POSTGRES_HOST ?? '127.0.0.1',
    port: Number(process.env.POSTGRES_PORT ?? 5437),
    username: process.env.POSTGRES_USERNAME ?? 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    database,
    ssl:
      process.env.POSTGRES_SSL === 'true'
        ? { rejectUnauthorized: true }
        : false,
    entities: ENTITIES,
    migrations: [InitialBudget1790000000000, UserRolesOwnerMember1790000000001],
    synchronize: false,
    invalidWhereValuesBehavior: { null: 'throw', undefined: 'throw' },
    migrationsRun: false,
    extra: { options: '-c timezone=America/Argentina/Buenos_Aires' },
  };
}
export default new DataSource(databaseOptions());
