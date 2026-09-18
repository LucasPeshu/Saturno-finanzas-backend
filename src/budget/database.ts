import { DataSource, DataSourceOptions } from 'typeorm';
import { config } from 'dotenv';
import { resolve } from 'node:path';
import { ENTITIES } from './entities';
import { InitialBudget1790000000000 } from './migrations/1790000000000-initial-budget';
import { UserRolesOwnerMember1790000000001 } from './migrations/1790000000001-user-roles-owner-member';
import { IdsToUuid1790000000002 } from './migrations/1790000000002-ids-to-uuid';
config({ path: resolve(__dirname, '../../.env'), quiet: true });
export function databaseOptions(): DataSourceOptions {
  const database = process.env.POSTGRES_DATABASE ?? 'control_gastos';
  const host = process.env.POSTGRES_HOST ?? '127.0.0.1';
  // This backend is a fork: refuse the copied database name even when .env is stale.
  const isProjectDatabase = /^control_gastos(?:_[a-z0-9_]+)?$/.test(database);
  const isSupabaseDefaultDatabase =
    database === 'postgres' &&
    (/\.supabase\.co$/i.test(host) || /\.pooler\.supabase\.com$/i.test(host));
  const isSupabasePooler = /\.pooler\.supabase\.com$/i.test(host);
  if (!isProjectDatabase && !isSupabaseDefaultDatabase)
    throw new Error(
      'POSTGRES_DATABASE debe ser control_gastos, control_gastos_<entorno> o postgres en Supabase',
    );
  const rejectUnauthorized =
    process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED === undefined
      ? !isSupabasePooler
      : process.env.POSTGRES_SSL_REJECT_UNAUTHORIZED !== 'false';
  return {
    type: 'postgres',
    host,
    port: Number(process.env.POSTGRES_PORT ?? 5437),
    username: process.env.POSTGRES_USERNAME ?? 'postgres',
    password: process.env.POSTGRES_PASSWORD,
    database,
    ssl: process.env.POSTGRES_SSL === 'true' ? { rejectUnauthorized } : false,
    entities: ENTITIES,
    migrations: [
      InitialBudget1790000000000,
      UserRolesOwnerMember1790000000001,
      IdsToUuid1790000000002,
    ],
    synchronize: false,
    invalidWhereValuesBehavior: { null: 'throw', undefined: 'throw' },
    migrationsRun: false,
    extra: { options: '-c timezone=America/Argentina/Buenos_Aires' },
  };
}
export default new DataSource(databaseOptions());
