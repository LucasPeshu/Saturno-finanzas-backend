import { MigrationInterface, QueryRunner } from 'typeorm';

export class IdsToUuid1790000000002 implements MigrationInterface {
  name = 'IdsToUuid1790000000002';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');
    await queryRunner.query(`
      DO $$
      DECLARE
        r record;
      BEGIN
        FOR r IN
          SELECT conrelid::regclass::text AS table_name, conname
          FROM pg_constraint
          WHERE connamespace = 'public'::regnamespace
            AND contype IN ('f', 'p', 'u')
        LOOP
          EXECUTE format('ALTER TABLE %s DROP CONSTRAINT IF EXISTS %I CASCADE', r.table_name, r.conname);
        END LOOP;
      END $$;
    `);
    await queryRunner.query(`
      DROP TRIGGER IF EXISTS "audit_logs_immutable" ON audit_logs;
      DROP TRIGGER IF EXISTS "wallet_movements_immutable" ON wallet_movements;
      DROP TRIGGER IF EXISTS "saving_movements_immutable" ON saving_movements;
    `);
    await queryRunner.query(`
      CREATE TEMP TABLE _map_organizations AS SELECT id old_id, gen_random_uuid() new_id FROM organizations;
      CREATE TEMP TABLE _map_users AS SELECT id old_id, gen_random_uuid() new_id FROM users;
      CREATE TEMP TABLE _map_groups AS SELECT id old_id, gen_random_uuid() new_id FROM groups;
      CREATE TEMP TABLE _map_group_members AS SELECT id old_id, gen_random_uuid() new_id FROM group_members;
      CREATE TEMP TABLE _map_group_invitations AS SELECT id old_id, gen_random_uuid() new_id FROM group_invitations;
      CREATE TEMP TABLE _map_categories AS SELECT id old_id, gen_random_uuid() new_id FROM categories;
      CREATE TEMP TABLE _map_tags AS SELECT id old_id, gen_random_uuid() new_id FROM tags;
      CREATE TEMP TABLE _map_expense_templates AS SELECT id old_id, gen_random_uuid() new_id FROM expense_templates;
      CREATE TEMP TABLE _map_expenses AS SELECT id old_id, gen_random_uuid() new_id FROM expenses;
      CREATE TEMP TABLE _map_expense_shares AS SELECT id old_id, gen_random_uuid() new_id FROM expense_shares;
      CREATE TEMP TABLE _map_incomes AS SELECT id old_id, gen_random_uuid() new_id FROM incomes;
      CREATE TEMP TABLE _map_expense_payments AS SELECT id old_id, gen_random_uuid() new_id FROM expense_payments;
      CREATE TEMP TABLE _map_goals AS SELECT id old_id, gen_random_uuid() new_id FROM goals;
      CREATE TEMP TABLE _map_saving_movements AS SELECT id old_id, gen_random_uuid() new_id FROM saving_movements;
      CREATE TEMP TABLE _map_wallet_movements AS SELECT id old_id, gen_random_uuid() new_id FROM wallet_movements;
      CREATE TEMP TABLE _map_audit_logs AS SELECT id old_id, gen_random_uuid() new_id FROM audit_logs;
    `);
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION _uuid_id(table_name text, map_name text) RETURNS void LANGUAGE plpgsql AS $$
      BEGIN
        EXECUTE format('ALTER TABLE %I ADD COLUMN id_uuid uuid', table_name);
        EXECUTE format('UPDATE %I t SET id_uuid = m.new_id FROM %I m WHERE t.id = m.old_id', table_name, map_name);
        EXECUTE format('ALTER TABLE %I DROP COLUMN id', table_name);
        EXECUTE format('ALTER TABLE %I RENAME COLUMN id_uuid TO id', table_name);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET NOT NULL', table_name);
        EXECUTE format('ALTER TABLE %I ALTER COLUMN id SET DEFAULT gen_random_uuid()', table_name);
      END $$;

      CREATE OR REPLACE FUNCTION _uuid_fk(table_name text, column_name text, map_name text, required boolean DEFAULT true) RETURNS void LANGUAGE plpgsql AS $$
      BEGIN
        EXECUTE format('ALTER TABLE %I ADD COLUMN %I uuid', table_name, column_name || '_uuid');
        EXECUTE format('UPDATE %I t SET %I = m.new_id FROM %I m WHERE t.%I = m.old_id', table_name, column_name || '_uuid', map_name, column_name);
        EXECUTE format('ALTER TABLE %I DROP COLUMN %I', table_name, column_name);
        EXECUTE format('ALTER TABLE %I RENAME COLUMN %I TO %I', table_name, column_name || '_uuid', column_name);
        IF required THEN
          EXECUTE format('ALTER TABLE %I ALTER COLUMN %I SET NOT NULL', table_name, column_name);
        END IF;
      END $$;
    `);
    await queryRunner.query(`
      SELECT _uuid_id('organizations', '_map_organizations');
      SELECT _uuid_id('users', '_map_users');
      SELECT _uuid_id('groups', '_map_groups');
      SELECT _uuid_id('group_members', '_map_group_members');
      SELECT _uuid_id('group_invitations', '_map_group_invitations');
      SELECT _uuid_id('categories', '_map_categories');
      SELECT _uuid_id('tags', '_map_tags');
      SELECT _uuid_id('expense_templates', '_map_expense_templates');
      SELECT _uuid_id('expenses', '_map_expenses');
      SELECT _uuid_id('expense_shares', '_map_expense_shares');
      SELECT _uuid_id('incomes', '_map_incomes');
      SELECT _uuid_id('expense_payments', '_map_expense_payments');
      SELECT _uuid_id('goals', '_map_goals');
      SELECT _uuid_id('saving_movements', '_map_saving_movements');
      SELECT _uuid_id('wallet_movements', '_map_wallet_movements');
      SELECT _uuid_id('audit_logs', '_map_audit_logs');

      SELECT _uuid_fk('users', 'organizationId', '_map_organizations');
      SELECT _uuid_fk('groups', 'organizationId', '_map_organizations');
      SELECT _uuid_fk('groups', 'ownerId', '_map_users');
      SELECT _uuid_fk('group_members', 'organizationId', '_map_organizations');
      SELECT _uuid_fk('group_members', 'groupId', '_map_groups');
      SELECT _uuid_fk('group_members', 'userId', '_map_users');
      SELECT _uuid_fk('group_invitations', 'organizationId', '_map_organizations');
      SELECT _uuid_fk('group_invitations', 'groupId', '_map_groups');
      SELECT _uuid_fk('group_invitations', 'userId', '_map_users');
      SELECT _uuid_fk('group_invitations', 'invitedById', '_map_users');
      SELECT _uuid_fk('categories', 'organizationId', '_map_organizations');
      SELECT _uuid_fk('tags', 'organizationId', '_map_organizations');
      SELECT _uuid_fk('expense_templates', 'organizationId', '_map_organizations');
      SELECT _uuid_fk('expense_templates', 'ownerId', '_map_users');
      SELECT _uuid_fk('expense_templates', 'groupId', '_map_groups', false);
      SELECT _uuid_fk('expense_templates', 'categoryId', '_map_categories');
      SELECT _uuid_fk('expenses', 'organizationId', '_map_organizations');
      SELECT _uuid_fk('expenses', 'ownerId', '_map_users');
      SELECT _uuid_fk('expenses', 'groupId', '_map_groups', false);
      SELECT _uuid_fk('expenses', 'categoryId', '_map_categories');
      SELECT _uuid_fk('expenses', 'templateId', '_map_expense_templates', false);
      SELECT _uuid_fk('expense_shares', 'organizationId', '_map_organizations');
      SELECT _uuid_fk('expense_shares', 'expenseId', '_map_expenses');
      SELECT _uuid_fk('expense_shares', 'userId', '_map_users');
      SELECT _uuid_fk('incomes', 'organizationId', '_map_organizations');
      SELECT _uuid_fk('incomes', 'userId', '_map_users');
      SELECT _uuid_fk('expense_payments', 'organizationId', '_map_organizations');
      SELECT _uuid_fk('expense_payments', 'expenseId', '_map_expenses');
      SELECT _uuid_fk('expense_payments', 'userId', '_map_users');
      SELECT _uuid_fk('goals', 'organizationId', '_map_organizations');
      SELECT _uuid_fk('goals', 'ownerId', '_map_users');
      SELECT _uuid_fk('goals', 'groupId', '_map_groups', false);
      SELECT _uuid_fk('saving_movements', 'organizationId', '_map_organizations');
      SELECT _uuid_fk('saving_movements', 'userId', '_map_users');
      SELECT _uuid_fk('saving_movements', 'goalId', '_map_goals', false);
      SELECT _uuid_fk('wallet_movements', 'organizationId', '_map_organizations');
      SELECT _uuid_fk('wallet_movements', 'userId', '_map_users');
      SELECT _uuid_fk('audit_logs', 'organizationId', '_map_organizations', false);
      SELECT _uuid_fk('audit_logs', 'actorId', '_map_users', false);
    `);
    await queryRunner.query(`
      UPDATE expense_templates
      SET "tagIds" = COALESCE((
        SELECT jsonb_agg(tm.new_id::text)
        FROM jsonb_array_elements_text("tagIds") old_id
        JOIN _map_tags tm ON tm.old_id = old_id::int
      ), '[]'::jsonb);

      UPDATE expenses
      SET "tagIds" = COALESCE((
        SELECT jsonb_agg(tm.new_id::text)
        FROM jsonb_array_elements_text("tagIds") old_id
        JOIN _map_tags tm ON tm.old_id = old_id::int
      ), '[]'::jsonb);

      UPDATE expense_templates
      SET splits = (
        SELECT jsonb_agg(jsonb_set(elem, '{userId}', to_jsonb(um.new_id::text)))
        FROM jsonb_array_elements(splits) elem
        JOIN _map_users um ON um.old_id = (elem->>'userId')::int
      )
      WHERE splits IS NOT NULL;

      ALTER TABLE wallet_movements ADD COLUMN "referenceId_uuid" uuid;
      UPDATE wallet_movements w SET "referenceId_uuid" = m.new_id FROM _map_incomes m WHERE w.kind = 'income' AND w."referenceId" = m.old_id;
      UPDATE wallet_movements w SET "referenceId_uuid" = m.new_id FROM _map_expense_payments m WHERE w.kind = 'payment' AND w."referenceId" = m.old_id;
      UPDATE wallet_movements w SET "referenceId_uuid" = m.new_id FROM _map_saving_movements m WHERE w.kind IN ('saving', 'withdrawal', 'goal_purchase') AND w."referenceId" = m.old_id;
      UPDATE wallet_movements w SET "referenceId_uuid" = m.new_id FROM _map_incomes m WHERE w.kind = 'reversal' AND w.amount < 0 AND w."referenceId" = m.old_id;
      UPDATE wallet_movements w SET "referenceId_uuid" = m.new_id FROM _map_expense_payments m WHERE w.kind = 'reversal' AND w.amount >= 0 AND w."referenceId" = m.old_id;
      ALTER TABLE wallet_movements DROP COLUMN "referenceId";
      ALTER TABLE wallet_movements RENAME COLUMN "referenceId_uuid" TO "referenceId";
      ALTER TABLE wallet_movements ALTER COLUMN "referenceId" SET NOT NULL;

      ALTER TABLE audit_logs ADD COLUMN "entityId_uuid" uuid;
      UPDATE audit_logs a SET "entityId_uuid" = m.new_id FROM _map_organizations m WHERE a.resource = 'organizations' AND a."entityId" = m.old_id;
      UPDATE audit_logs a SET "entityId_uuid" = m.new_id FROM _map_users m WHERE a.resource = 'users' AND a."entityId" = m.old_id;
      UPDATE audit_logs a SET "entityId_uuid" = m.new_id FROM _map_groups m WHERE a.resource = 'groups' AND a."entityId" = m.old_id;
      UPDATE audit_logs a SET "entityId_uuid" = m.new_id FROM _map_group_invitations m WHERE a.resource = 'group-invitations' AND a."entityId" = m.old_id;
      UPDATE audit_logs a SET "entityId_uuid" = m.new_id FROM _map_categories m WHERE a.resource = 'categories' AND a."entityId" = m.old_id;
      UPDATE audit_logs a SET "entityId_uuid" = m.new_id FROM _map_tags m WHERE a.resource = 'tags' AND a."entityId" = m.old_id;
      UPDATE audit_logs a SET "entityId_uuid" = m.new_id FROM _map_expense_templates m WHERE a.resource = 'expense-templates' AND a."entityId" = m.old_id;
      UPDATE audit_logs a SET "entityId_uuid" = m.new_id FROM _map_expenses m WHERE a.resource = 'expenses' AND a."entityId" = m.old_id;
      UPDATE audit_logs a SET "entityId_uuid" = m.new_id FROM _map_incomes m WHERE a.resource = 'incomes' AND a."entityId" = m.old_id;
      UPDATE audit_logs a SET "entityId_uuid" = m.new_id FROM _map_expense_payments m WHERE a.resource = 'expense_payments' AND a."entityId" = m.old_id;
      UPDATE audit_logs a SET "entityId_uuid" = m.new_id FROM _map_goals m WHERE a.resource = 'goals' AND a."entityId" = m.old_id;
      UPDATE audit_logs a SET "entityId_uuid" = m.new_id FROM _map_saving_movements m WHERE a.resource = 'saving_movements' AND a."entityId" = m.old_id;
      UPDATE audit_logs a SET "entityId_uuid" = m.new_id FROM _map_wallet_movements m WHERE a.resource = 'wallet_movements' AND a."entityId" = m.old_id;
      ALTER TABLE audit_logs DROP COLUMN "entityId";
      ALTER TABLE audit_logs RENAME COLUMN "entityId_uuid" TO "entityId";
    `);
    await queryRunner.query(`
      ALTER TABLE organizations ADD CONSTRAINT "PK_organizations" PRIMARY KEY (id);
      ALTER TABLE users ADD CONSTRAINT "PK_users" PRIMARY KEY (id);
      ALTER TABLE groups ADD CONSTRAINT "PK_groups" PRIMARY KEY (id);
      ALTER TABLE group_members ADD CONSTRAINT "PK_group_members" PRIMARY KEY (id);
      ALTER TABLE group_invitations ADD CONSTRAINT "PK_group_invitations" PRIMARY KEY (id);
      ALTER TABLE categories ADD CONSTRAINT "PK_categories" PRIMARY KEY (id);
      ALTER TABLE tags ADD CONSTRAINT "PK_tags" PRIMARY KEY (id);
      ALTER TABLE expense_templates ADD CONSTRAINT "PK_expense_templates" PRIMARY KEY (id);
      ALTER TABLE expenses ADD CONSTRAINT "PK_expenses" PRIMARY KEY (id);
      ALTER TABLE expense_shares ADD CONSTRAINT "PK_expense_shares" PRIMARY KEY (id);
      ALTER TABLE incomes ADD CONSTRAINT "PK_incomes" PRIMARY KEY (id);
      ALTER TABLE expense_payments ADD CONSTRAINT "PK_expense_payments" PRIMARY KEY (id);
      ALTER TABLE goals ADD CONSTRAINT "PK_goals" PRIMARY KEY (id);
      ALTER TABLE saving_movements ADD CONSTRAINT "PK_saving_movements" PRIMARY KEY (id);
      ALTER TABLE wallet_movements ADD CONSTRAINT "PK_wallet_movements" PRIMARY KEY (id);
      ALTER TABLE audit_logs ADD CONSTRAINT "PK_audit_logs" PRIMARY KEY (id);

      ALTER TABLE organizations ADD CONSTRAINT "UQ_organizations_slug" UNIQUE (slug);
      ALTER TABLE users ADD CONSTRAINT "UQ_users_email" UNIQUE (email);
      ALTER TABLE group_members ADD CONSTRAINT "UQ_group_members_group_user" UNIQUE ("groupId", "userId");
      ALTER TABLE group_invitations ADD CONSTRAINT "UQ_group_invitations_group_user" UNIQUE ("groupId", "userId");
      ALTER TABLE categories ADD CONSTRAINT "UQ_categories_org_name" UNIQUE ("organizationId", name);
      ALTER TABLE tags ADD CONSTRAINT "UQ_tags_org_name" UNIQUE ("organizationId", name);
      ALTER TABLE expenses ADD CONSTRAINT "UQ_expenses_template_month" UNIQUE ("templateId", month);
      ALTER TABLE wallet_movements ADD CONSTRAINT "UQ_wallet_user_idempotency" UNIQUE ("userId", "idempotencyKey");

      ALTER TABLE users ADD CONSTRAINT "users_tenant_id" UNIQUE ("organizationId", id);
      ALTER TABLE groups ADD CONSTRAINT "groups_tenant_id" UNIQUE ("organizationId", id);
      ALTER TABLE group_members ADD CONSTRAINT "group_members_tenant_id" UNIQUE ("organizationId", id);
      ALTER TABLE group_invitations ADD CONSTRAINT "group_invitations_tenant_id" UNIQUE ("organizationId", id);
      ALTER TABLE categories ADD CONSTRAINT "categories_tenant_id" UNIQUE ("organizationId", id);
      ALTER TABLE tags ADD CONSTRAINT "tags_tenant_id" UNIQUE ("organizationId", id);
      ALTER TABLE expense_templates ADD CONSTRAINT "expense_templates_tenant_id" UNIQUE ("organizationId", id);
      ALTER TABLE expenses ADD CONSTRAINT "expenses_tenant_id" UNIQUE ("organizationId", id);
      ALTER TABLE expense_shares ADD CONSTRAINT "expense_shares_tenant_id" UNIQUE ("organizationId", id);
      ALTER TABLE incomes ADD CONSTRAINT "incomes_tenant_id" UNIQUE ("organizationId", id);
      ALTER TABLE expense_payments ADD CONSTRAINT "expense_payments_tenant_id" UNIQUE ("organizationId", id);
      ALTER TABLE goals ADD CONSTRAINT "goals_tenant_id" UNIQUE ("organizationId", id);
      ALTER TABLE saving_movements ADD CONSTRAINT "saving_movements_tenant_id" UNIQUE ("organizationId", id);
      ALTER TABLE wallet_movements ADD CONSTRAINT "wallet_movements_tenant_id" UNIQUE ("organizationId", id);
    `);
    await queryRunner.query(`
      ALTER TABLE users ADD CONSTRAINT "FK_users_organizations" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE RESTRICT;
      ALTER TABLE groups ADD CONSTRAINT "FK_groups_organizations" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE RESTRICT;
      ALTER TABLE groups ADD CONSTRAINT "FK_groups_owner" FOREIGN KEY ("ownerId") REFERENCES users(id) ON DELETE RESTRICT;
      ALTER TABLE group_members ADD CONSTRAINT "FK_group_members_organizations" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE RESTRICT;
      ALTER TABLE group_members ADD CONSTRAINT "FK_group_members_groups" FOREIGN KEY ("groupId") REFERENCES groups(id) ON DELETE RESTRICT;
      ALTER TABLE group_members ADD CONSTRAINT "FK_group_members_users" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE RESTRICT;
      ALTER TABLE group_invitations ADD CONSTRAINT "FK_group_invitations_organizations" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE RESTRICT;
      ALTER TABLE group_invitations ADD CONSTRAINT "FK_group_invitations_groups" FOREIGN KEY ("groupId") REFERENCES groups(id) ON DELETE RESTRICT;
      ALTER TABLE group_invitations ADD CONSTRAINT "FK_group_invitations_users" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE RESTRICT;
      ALTER TABLE group_invitations ADD CONSTRAINT "FK_group_invitations_invited_by" FOREIGN KEY ("invitedById") REFERENCES users(id) ON DELETE RESTRICT;
      ALTER TABLE categories ADD CONSTRAINT "FK_categories_organizations" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE RESTRICT;
      ALTER TABLE tags ADD CONSTRAINT "FK_tags_organizations" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE RESTRICT;
      ALTER TABLE expense_templates ADD CONSTRAINT "FK_expense_templates_organizations" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE RESTRICT;
      ALTER TABLE expense_templates ADD CONSTRAINT "FK_expense_templates_owner" FOREIGN KEY ("ownerId") REFERENCES users(id) ON DELETE RESTRICT;
      ALTER TABLE expense_templates ADD CONSTRAINT "FK_expense_templates_groups" FOREIGN KEY ("groupId") REFERENCES groups(id) ON DELETE RESTRICT;
      ALTER TABLE expense_templates ADD CONSTRAINT "FK_expense_templates_categories" FOREIGN KEY ("categoryId") REFERENCES categories(id) ON DELETE RESTRICT;
      ALTER TABLE expenses ADD CONSTRAINT "FK_expenses_organizations" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE RESTRICT;
      ALTER TABLE expenses ADD CONSTRAINT "FK_expenses_owner" FOREIGN KEY ("ownerId") REFERENCES users(id) ON DELETE RESTRICT;
      ALTER TABLE expenses ADD CONSTRAINT "FK_expenses_groups" FOREIGN KEY ("groupId") REFERENCES groups(id) ON DELETE RESTRICT;
      ALTER TABLE expenses ADD CONSTRAINT "FK_expenses_categories" FOREIGN KEY ("categoryId") REFERENCES categories(id) ON DELETE RESTRICT;
      ALTER TABLE expenses ADD CONSTRAINT "FK_expenses_templates" FOREIGN KEY ("templateId") REFERENCES expense_templates(id) ON DELETE RESTRICT;
      ALTER TABLE expense_shares ADD CONSTRAINT "FK_expense_shares_organizations" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE RESTRICT;
      ALTER TABLE expense_shares ADD CONSTRAINT "FK_expense_shares_expenses" FOREIGN KEY ("expenseId") REFERENCES expenses(id) ON DELETE RESTRICT;
      ALTER TABLE expense_shares ADD CONSTRAINT "FK_expense_shares_users" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE RESTRICT;
      ALTER TABLE incomes ADD CONSTRAINT "FK_incomes_organizations" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE RESTRICT;
      ALTER TABLE incomes ADD CONSTRAINT "FK_incomes_users" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE RESTRICT;
      ALTER TABLE expense_payments ADD CONSTRAINT "FK_expense_payments_organizations" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE RESTRICT;
      ALTER TABLE expense_payments ADD CONSTRAINT "FK_expense_payments_expenses" FOREIGN KEY ("expenseId") REFERENCES expenses(id) ON DELETE RESTRICT;
      ALTER TABLE expense_payments ADD CONSTRAINT "FK_expense_payments_users" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE RESTRICT;
      ALTER TABLE goals ADD CONSTRAINT "FK_goals_organizations" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE RESTRICT;
      ALTER TABLE goals ADD CONSTRAINT "FK_goals_owner" FOREIGN KEY ("ownerId") REFERENCES users(id) ON DELETE RESTRICT;
      ALTER TABLE goals ADD CONSTRAINT "FK_goals_groups" FOREIGN KEY ("groupId") REFERENCES groups(id) ON DELETE RESTRICT;
      ALTER TABLE saving_movements ADD CONSTRAINT "FK_saving_movements_organizations" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE RESTRICT;
      ALTER TABLE saving_movements ADD CONSTRAINT "FK_saving_movements_users" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE RESTRICT;
      ALTER TABLE saving_movements ADD CONSTRAINT "FK_saving_movements_goals" FOREIGN KEY ("goalId") REFERENCES goals(id) ON DELETE RESTRICT;
      ALTER TABLE wallet_movements ADD CONSTRAINT "FK_wallet_movements_organizations" FOREIGN KEY ("organizationId") REFERENCES organizations(id) ON DELETE RESTRICT;
      ALTER TABLE wallet_movements ADD CONSTRAINT "FK_wallet_movements_users" FOREIGN KEY ("userId") REFERENCES users(id) ON DELETE RESTRICT;
    `);
    await queryRunner.query(`
      ALTER TABLE groups ADD CONSTRAINT "groups_ownerId_tenant_fk" FOREIGN KEY ("organizationId", "ownerId") REFERENCES users("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE group_members ADD CONSTRAINT "group_members_groupId_tenant_fk" FOREIGN KEY ("organizationId", "groupId") REFERENCES groups("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE group_members ADD CONSTRAINT "group_members_userId_tenant_fk" FOREIGN KEY ("organizationId", "userId") REFERENCES users("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE group_invitations ADD CONSTRAINT "group_invitations_groupId_tenant_fk" FOREIGN KEY ("organizationId", "groupId") REFERENCES groups("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE group_invitations ADD CONSTRAINT "group_invitations_userId_tenant_fk" FOREIGN KEY ("organizationId", "userId") REFERENCES users("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE group_invitations ADD CONSTRAINT "group_invitations_invitedById_tenant_fk" FOREIGN KEY ("organizationId", "invitedById") REFERENCES users("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE expense_templates ADD CONSTRAINT "expense_templates_ownerId_tenant_fk" FOREIGN KEY ("organizationId", "ownerId") REFERENCES users("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE expense_templates ADD CONSTRAINT "expense_templates_groupId_tenant_fk" FOREIGN KEY ("organizationId", "groupId") REFERENCES groups("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE expense_templates ADD CONSTRAINT "expense_templates_categoryId_tenant_fk" FOREIGN KEY ("organizationId", "categoryId") REFERENCES categories("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE expenses ADD CONSTRAINT "expenses_ownerId_tenant_fk" FOREIGN KEY ("organizationId", "ownerId") REFERENCES users("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE expenses ADD CONSTRAINT "expenses_groupId_tenant_fk" FOREIGN KEY ("organizationId", "groupId") REFERENCES groups("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE expenses ADD CONSTRAINT "expenses_categoryId_tenant_fk" FOREIGN KEY ("organizationId", "categoryId") REFERENCES categories("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE expenses ADD CONSTRAINT "expenses_templateId_tenant_fk" FOREIGN KEY ("organizationId", "templateId") REFERENCES expense_templates("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE expense_shares ADD CONSTRAINT "expense_shares_expenseId_tenant_fk" FOREIGN KEY ("organizationId", "expenseId") REFERENCES expenses("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE expense_shares ADD CONSTRAINT "expense_shares_userId_tenant_fk" FOREIGN KEY ("organizationId", "userId") REFERENCES users("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE incomes ADD CONSTRAINT "incomes_userId_tenant_fk" FOREIGN KEY ("organizationId", "userId") REFERENCES users("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE expense_payments ADD CONSTRAINT "expense_payments_expenseId_tenant_fk" FOREIGN KEY ("organizationId", "expenseId") REFERENCES expenses("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE expense_payments ADD CONSTRAINT "expense_payments_userId_tenant_fk" FOREIGN KEY ("organizationId", "userId") REFERENCES users("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE goals ADD CONSTRAINT "goals_ownerId_tenant_fk" FOREIGN KEY ("organizationId", "ownerId") REFERENCES users("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE goals ADD CONSTRAINT "goals_groupId_tenant_fk" FOREIGN KEY ("organizationId", "groupId") REFERENCES groups("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE saving_movements ADD CONSTRAINT "saving_movements_userId_tenant_fk" FOREIGN KEY ("organizationId", "userId") REFERENCES users("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE saving_movements ADD CONSTRAINT "saving_movements_goalId_tenant_fk" FOREIGN KEY ("organizationId", "goalId") REFERENCES goals("organizationId", id) ON DELETE RESTRICT;
      ALTER TABLE wallet_movements ADD CONSTRAINT "wallet_movements_userId_tenant_fk" FOREIGN KEY ("organizationId", "userId") REFERENCES users("organizationId", id) ON DELETE RESTRICT;
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_users_organizationId" ON users ("organizationId");
      CREATE INDEX "IDX_groups_organizationId" ON groups ("organizationId");
      CREATE INDEX "IDX_group_members_organizationId" ON group_members ("organizationId");
      CREATE INDEX "IDX_group_invitations_organizationId" ON group_invitations ("organizationId");
      CREATE INDEX "IDX_categories_organizationId" ON categories ("organizationId");
      CREATE INDEX "IDX_tags_organizationId" ON tags ("organizationId");
      CREATE INDEX "IDX_expense_templates_organizationId" ON expense_templates ("organizationId");
      CREATE INDEX "IDX_expenses_organizationId" ON expenses ("organizationId");
      CREATE INDEX "IDX_expense_shares_organizationId" ON expense_shares ("organizationId");
      CREATE INDEX "IDX_incomes_organizationId" ON incomes ("organizationId");
      CREATE INDEX "IDX_expense_payments_organizationId" ON expense_payments ("organizationId");
      CREATE INDEX "IDX_goals_organizationId" ON goals ("organizationId");
      CREATE INDEX "IDX_saving_movements_organizationId" ON saving_movements ("organizationId");
      CREATE INDEX "IDX_wallet_movements_organizationId" ON wallet_movements ("organizationId");
      CREATE INDEX "IDX_audit_logs_organizationId_createdAt" ON audit_logs ("organizationId", "createdAt");

      CREATE TRIGGER audit_logs_immutable BEFORE UPDATE OR DELETE ON audit_logs FOR EACH ROW EXECUTE FUNCTION budget_immutable();
      CREATE TRIGGER wallet_movements_immutable BEFORE UPDATE OR DELETE ON wallet_movements FOR EACH ROW EXECUTE FUNCTION budget_immutable();
      CREATE TRIGGER saving_movements_immutable BEFORE UPDATE OR DELETE ON saving_movements FOR EACH ROW EXECUTE FUNCTION budget_immutable();

      DROP FUNCTION _uuid_fk(text, text, text, boolean);
      DROP FUNCTION _uuid_id(text, text);
    `);
  }

  down(): Promise<void> {
    return Promise.reject(
      new Error('IdsToUuid1790000000002 is not reversible'),
    );
  }
}
