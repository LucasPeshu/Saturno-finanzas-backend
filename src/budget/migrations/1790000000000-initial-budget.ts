import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialBudget1790000000000 implements MigrationInterface {
  name = 'InitialBudget1790000000000';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'CREATE TABLE "organizations" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "name" character varying(120) NOT NULL, "slug" character varying(80) NOT NULL, CONSTRAINT "UQ_963693341bd612aa01ddf3a4b68" UNIQUE ("slug"), CONSTRAINT "PK_6b031fcd0863e3f6b44230163f9" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE TABLE "users" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" integer NOT NULL, "name" character varying(120) NOT NULL, "email" character varying(254) NOT NULL, "password" character varying NOT NULL, "role" character varying NOT NULL DEFAULT \'member\', "active" boolean NOT NULL DEFAULT true, "savingsPercent" integer NOT NULL DEFAULT \'60\', "reservePercent" integer NOT NULL DEFAULT \'20\', "goalBufferPercent" integer NOT NULL DEFAULT \'25\', CONSTRAINT "UQ_97672ac88f789774dd47f7c8be3" UNIQUE ("email"), CONSTRAINT "CHK_d8ec81157dd736c4e867a2b9b5" CHECK ("savingsPercent" >= 0 AND "reservePercent" >= 0 AND "savingsPercent" + "reservePercent" <= 100), CONSTRAINT "PK_a3ffb1c0c8416b9fc6f907b7433" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_f3d6aea8fcca58182b2e80ce97" ON "users" ("organizationId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "groups" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" integer NOT NULL, "name" character varying(120) NOT NULL, "ownerId" integer NOT NULL, CONSTRAINT "PK_659d1483316afb28afd3a90646e" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_76b7c20054f6c4c89fe317273d" ON "groups" ("organizationId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "group_members" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" integer NOT NULL, "groupId" integer NOT NULL, "userId" integer NOT NULL, CONSTRAINT "UQ_53f644f66a416c1542b743c0295" UNIQUE ("groupId", "userId"), CONSTRAINT "PK_86446139b2c96bfd0f3b8638852" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_8e2bd6bb34899aee001bae3a26" ON "group_members" ("organizationId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "group_invitations" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" integer NOT NULL, "groupId" integer NOT NULL, "userId" integer NOT NULL, "invitedById" integer NOT NULL, "status" character varying NOT NULL DEFAULT \'pending\', CONSTRAINT "UQ_a928923a46e474f3bc634fc7ae2" UNIQUE ("groupId", "userId"), CONSTRAINT "PK_f7d0b290d6079ae9353d794227d" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_f2a775d14e832dad87c1aa1c8f" ON "group_invitations" ("organizationId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "categories" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" integer NOT NULL, "name" character varying(120) NOT NULL, "priority" integer NOT NULL, "discretionary" boolean NOT NULL DEFAULT false, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_50eed20acd1e8a49cc53540d576" UNIQUE ("organizationId", "name"), CONSTRAINT "CHK_251e6e1346361d503c57705f8f" CHECK (priority BETWEEN 1 AND 100), CONSTRAINT "PK_24dbc6126a28ff948da33e97d3b" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_fe443d2de1a8eece18310ef9b2" ON "categories" ("organizationId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "tags" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" integer NOT NULL, "name" character varying(80) NOT NULL, "color" character varying(7) NOT NULL DEFAULT \'#64748b\', "active" boolean NOT NULL DEFAULT true, CONSTRAINT "UQ_826dc0fa70d58e5673cf1de946f" UNIQUE ("organizationId", "name"), CONSTRAINT "PK_e7dc17249a1148a1970748eda99" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_94485bb2eb7f56ef8b78781660" ON "tags" ("organizationId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "expense_templates" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" integer NOT NULL, "description" character varying(160) NOT NULL, "amount" numeric(14,2) NOT NULL, "ownerId" integer NOT NULL, "groupId" integer, "categoryId" integer NOT NULL, "tagIds" jsonb NOT NULL DEFAULT \'[]\', "dueDay" integer NOT NULL, "startMonth" character varying(7) NOT NULL, "endMonth" character varying(7), "splits" jsonb, "active" boolean NOT NULL DEFAULT true, CONSTRAINT "CHK_871b88ea11d1faec35a4554da0" CHECK ("dueDay" BETWEEN 1 AND 31), CONSTRAINT "CHK_2523dd893c5b463e7b940d1c0e" CHECK (amount > 0), CONSTRAINT "PK_6182f5140a115ce5e2101902944" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_d72d45cb42a13612610b840793" ON "expense_templates" ("organizationId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "expenses" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" integer NOT NULL, "description" character varying(160) NOT NULL, "amount" numeric(14,2) NOT NULL, "ownerId" integer NOT NULL, "groupId" integer, "categoryId" integer NOT NULL, "tagIds" jsonb NOT NULL DEFAULT \'[]\', "kind" character varying NOT NULL, "month" character varying(7) NOT NULL, "dueDate" date NOT NULL, "templateId" integer, "priority" integer NOT NULL, "categoryName" character varying NOT NULL, "discretionary" boolean NOT NULL, "cancelled" boolean NOT NULL DEFAULT false, CONSTRAINT "UQ_e04d180d4f07593295c51387a4e" UNIQUE ("templateId", "month"), CONSTRAINT "CHK_3c346e2ebb93d7c7da88d37996" CHECK (amount > 0), CONSTRAINT "PK_94c3ceb17e3140abc9282c20610" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_bf144dfd64fba8948ffb30d6e3" ON "expenses" ("organizationId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "expense_shares" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" integer NOT NULL, "expenseId" integer NOT NULL, "userId" integer NOT NULL, "amount" numeric(14,2) NOT NULL, CONSTRAINT "UQ_dd8aedba86e92fc44ec6bc31ca1" UNIQUE ("expenseId", "userId"), CONSTRAINT "CHK_cf721c3b8a05af26cbbb685fb2" CHECK (amount >= 0), CONSTRAINT "PK_6797467a312af7a82082f86dc91" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_acbf9f7a00726b2a936477c9c7" ON "expense_shares" ("organizationId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "incomes" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" integer NOT NULL, "userId" integer NOT NULL, "source" character varying(160) NOT NULL, "amount" numeric(14,2) NOT NULL, "date" date NOT NULL, "reversed" boolean NOT NULL DEFAULT false, "reversedOn" date, CONSTRAINT "CHK_a997e727e590689ae7fcca6ba9" CHECK (amount > 0), CONSTRAINT "PK_d737b3d0314c1f0da5461a55e5e" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_860175223a06c9d710c06a85d0" ON "incomes" ("organizationId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "expense_payments" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" integer NOT NULL, "expenseId" integer NOT NULL, "userId" integer NOT NULL, "amount" numeric(14,2) NOT NULL, "date" date NOT NULL, "reversed" boolean NOT NULL DEFAULT false, "reversedOn" date, CONSTRAINT "CHK_16c85f5684af0046097020ebf8" CHECK (amount > 0), CONSTRAINT "PK_7cf2ee63bae4c852652405ad292" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_7021632e629ac89ceda3c77bc6" ON "expense_payments" ("organizationId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "goals" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" integer NOT NULL, "name" character varying(160) NOT NULL, "ownerId" integer NOT NULL, "groupId" integer, "currency" character varying(3) NOT NULL, "targetAmount" numeric(14,2) NOT NULL, "targetDate" date, "status" character varying NOT NULL DEFAULT \'active\', CONSTRAINT "CHK_9bad6ebcaeaa8aed930a392bd7" CHECK ("targetAmount" > 0), CONSTRAINT "PK_26e17b251afab35580dff769223" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_0358b9630bedfc358f2e2066c1" ON "goals" ("organizationId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "saving_movements" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" integer NOT NULL, "userId" integer NOT NULL, "goalId" integer, "currency" character varying(3) NOT NULL, "amount" numeric(14,2) NOT NULL, "arsAmount" numeric(14,2) NOT NULL, "exchangeRate" numeric(14,6) NOT NULL, "direction" character varying NOT NULL, "date" date NOT NULL, "description" character varying(160) NOT NULL, CONSTRAINT "CHK_9cc8573255e4f73cb829a18ebf" CHECK (amount > 0 AND "arsAmount" > 0 AND "exchangeRate" > 0), CONSTRAINT "PK_b2ac10d3c4bafecc375e7a3cd84" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_aac2fb583c46a0fc074e7e83cf" ON "saving_movements" ("organizationId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "wallet_movements" ("id" SERIAL NOT NULL, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), "organizationId" integer NOT NULL, "userId" integer NOT NULL, "kind" character varying NOT NULL, "amount" numeric(14,2) NOT NULL, "date" date NOT NULL, "description" character varying(160) NOT NULL, "referenceId" integer NOT NULL, "idempotencyKey" uuid NOT NULL, "requestHash" character varying(64) NOT NULL, CONSTRAINT "UQ_2d8424b0c74092f73bc9e882c2a" UNIQUE ("userId", "idempotencyKey"), CONSTRAINT "PK_721031746a6636132b3269be761" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_9c9d93d9453392b51eb1ba08e2" ON "wallet_movements" ("organizationId") ',
    );
    await queryRunner.query(
      'CREATE TABLE "audit_logs" ("id" SERIAL NOT NULL, "organizationId" integer, "actorId" integer, "actorEmail" character varying, "action" character varying NOT NULL, "resource" character varying NOT NULL, "entityId" integer, "before" jsonb, "after" jsonb, "requestId" uuid, "ip" character varying, "success" boolean NOT NULL DEFAULT true, "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(), CONSTRAINT "PK_1bb179d048bbc581caa3b013439" PRIMARY KEY ("id"))',
    );
    await queryRunner.query(
      'CREATE INDEX "IDX_9885c0f9a2e4081ebae4313d87" ON "audit_logs" ("organizationId", "createdAt") ',
    );
    await queryRunner.query(
      'ALTER TABLE "users" ADD CONSTRAINT "FK_f3d6aea8fcca58182b2e80ce979" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "groups" ADD CONSTRAINT "FK_76b7c20054f6c4c89fe317273d1" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "groups" ADD CONSTRAINT "FK_4d8d8897aef1c049336d8dde13f" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "group_members" ADD CONSTRAINT "FK_8e2bd6bb34899aee001bae3a262" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "group_members" ADD CONSTRAINT "FK_1aa8d31831c3126947e7a713c2b" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "group_members" ADD CONSTRAINT "FK_fdef099303bcf0ffd9a4a7b18f5" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "group_invitations" ADD CONSTRAINT "FK_f2a775d14e832dad87c1aa1c8f8" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "group_invitations" ADD CONSTRAINT "FK_ab934a07e81281d8da148ee641b" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "group_invitations" ADD CONSTRAINT "FK_657b71358f3d34c4f1d4945bb8f" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "categories" ADD CONSTRAINT "FK_fe443d2de1a8eece18310ef9b28" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "tags" ADD CONSTRAINT "FK_94485bb2eb7f56ef8b787816607" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_templates" ADD CONSTRAINT "FK_d72d45cb42a13612610b840793a" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_templates" ADD CONSTRAINT "FK_057b5b2065a313439c477915214" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_templates" ADD CONSTRAINT "FK_8e6b525ee46cce5e16c02e445d7" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_templates" ADD CONSTRAINT "FK_58ba1fcb4946fe2c99a443cc5ef" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "expenses" ADD CONSTRAINT "FK_bf144dfd64fba8948ffb30d6e3d" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "expenses" ADD CONSTRAINT "FK_c1495dd5777eaeea92b8a21843e" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "expenses" ADD CONSTRAINT "FK_c4601c36c8b1326e9427e1aca3b" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "expenses" ADD CONSTRAINT "FK_ac0801a1760c5f9ce43c03bacd0" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "expenses" ADD CONSTRAINT "FK_d44a34e70535e1f959e6cf0d6ae" FOREIGN KEY ("templateId") REFERENCES "expense_templates"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_shares" ADD CONSTRAINT "FK_acbf9f7a00726b2a936477c9c72" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_shares" ADD CONSTRAINT "FK_5cbe064197ad3f66b166a6c9f54" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_shares" ADD CONSTRAINT "FK_254cd355ce58d6053dfd7fd893f" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "incomes" ADD CONSTRAINT "FK_860175223a06c9d710c06a85d0f" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "incomes" ADD CONSTRAINT "FK_f6b7c6bbe04a203dfc67ae627ab" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_payments" ADD CONSTRAINT "FK_7021632e629ac89ceda3c77bc6f" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_payments" ADD CONSTRAINT "FK_34f8d735e63d4666142059af296" FOREIGN KEY ("expenseId") REFERENCES "expenses"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_payments" ADD CONSTRAINT "FK_267d6b2657db6d18ac3c5a7ac75" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "goals" ADD CONSTRAINT "FK_0358b9630bedfc358f2e2066c14" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "goals" ADD CONSTRAINT "FK_aad02eec6766a51b7e9f1e782ef" FOREIGN KEY ("ownerId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "goals" ADD CONSTRAINT "FK_1924893a31d0e5a96e7b54ecdf5" FOREIGN KEY ("groupId") REFERENCES "groups"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "saving_movements" ADD CONSTRAINT "FK_aac2fb583c46a0fc074e7e83cf0" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "saving_movements" ADD CONSTRAINT "FK_46d92310dc9f395ea504c57066b" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "saving_movements" ADD CONSTRAINT "FK_fcbac9ef8611aefe9818a56668b" FOREIGN KEY ("goalId") REFERENCES "goals"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "wallet_movements" ADD CONSTRAINT "FK_9c9d93d9453392b51eb1ba08e22" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "wallet_movements" ADD CONSTRAINT "FK_f65e98c7e3a82f4e0eb3d20db3c" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE NO ACTION',
    );
    await queryRunner.query(
      'ALTER TABLE "users" ADD CONSTRAINT "users_tenant_id" UNIQUE ("organizationId", id)',
    );
    await queryRunner.query(
      'ALTER TABLE "groups" ADD CONSTRAINT "groups_tenant_id" UNIQUE ("organizationId", id)',
    );
    await queryRunner.query(
      'ALTER TABLE "group_members" ADD CONSTRAINT "group_members_tenant_id" UNIQUE ("organizationId", id)',
    );
    await queryRunner.query(
      'ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_tenant_id" UNIQUE ("organizationId", id)',
    );
    await queryRunner.query(
      'ALTER TABLE "categories" ADD CONSTRAINT "categories_tenant_id" UNIQUE ("organizationId", id)',
    );
    await queryRunner.query(
      'ALTER TABLE "tags" ADD CONSTRAINT "tags_tenant_id" UNIQUE ("organizationId", id)',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_templates" ADD CONSTRAINT "expense_templates_tenant_id" UNIQUE ("organizationId", id)',
    );
    await queryRunner.query(
      'ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenant_id" UNIQUE ("organizationId", id)',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_tenant_id" UNIQUE ("organizationId", id)',
    );
    await queryRunner.query(
      'ALTER TABLE "incomes" ADD CONSTRAINT "incomes_tenant_id" UNIQUE ("organizationId", id)',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_tenant_id" UNIQUE ("organizationId", id)',
    );
    await queryRunner.query(
      'ALTER TABLE "goals" ADD CONSTRAINT "goals_tenant_id" UNIQUE ("organizationId", id)',
    );
    await queryRunner.query(
      'ALTER TABLE "saving_movements" ADD CONSTRAINT "saving_movements_tenant_id" UNIQUE ("organizationId", id)',
    );
    await queryRunner.query(
      'ALTER TABLE "wallet_movements" ADD CONSTRAINT "wallet_movements_tenant_id" UNIQUE ("organizationId", id)',
    );
    await queryRunner.query(
      'ALTER TABLE "groups" ADD CONSTRAINT "groups_ownerId_tenant_fk" FOREIGN KEY ("organizationId","ownerId") REFERENCES "users" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "group_members" ADD CONSTRAINT "group_members_groupId_tenant_fk" FOREIGN KEY ("organizationId","groupId") REFERENCES "groups" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "group_members" ADD CONSTRAINT "group_members_userId_tenant_fk" FOREIGN KEY ("organizationId","userId") REFERENCES "users" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_groupId_tenant_fk" FOREIGN KEY ("organizationId","groupId") REFERENCES "groups" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_userId_tenant_fk" FOREIGN KEY ("organizationId","userId") REFERENCES "users" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "group_invitations" ADD CONSTRAINT "group_invitations_invitedById_tenant_fk" FOREIGN KEY ("organizationId","invitedById") REFERENCES "users" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_templates" ADD CONSTRAINT "expense_templates_ownerId_tenant_fk" FOREIGN KEY ("organizationId","ownerId") REFERENCES "users" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_templates" ADD CONSTRAINT "expense_templates_groupId_tenant_fk" FOREIGN KEY ("organizationId","groupId") REFERENCES "groups" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_templates" ADD CONSTRAINT "expense_templates_categoryId_tenant_fk" FOREIGN KEY ("organizationId","categoryId") REFERENCES "categories" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "expenses" ADD CONSTRAINT "expenses_ownerId_tenant_fk" FOREIGN KEY ("organizationId","ownerId") REFERENCES "users" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "expenses" ADD CONSTRAINT "expenses_groupId_tenant_fk" FOREIGN KEY ("organizationId","groupId") REFERENCES "groups" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "expenses" ADD CONSTRAINT "expenses_categoryId_tenant_fk" FOREIGN KEY ("organizationId","categoryId") REFERENCES "categories" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "expenses" ADD CONSTRAINT "expenses_templateId_tenant_fk" FOREIGN KEY ("organizationId","templateId") REFERENCES "expense_templates" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_expenseId_tenant_fk" FOREIGN KEY ("organizationId","expenseId") REFERENCES "expenses" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_shares" ADD CONSTRAINT "expense_shares_userId_tenant_fk" FOREIGN KEY ("organizationId","userId") REFERENCES "users" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "incomes" ADD CONSTRAINT "incomes_userId_tenant_fk" FOREIGN KEY ("organizationId","userId") REFERENCES "users" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_expenseId_tenant_fk" FOREIGN KEY ("organizationId","expenseId") REFERENCES "expenses" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "expense_payments" ADD CONSTRAINT "expense_payments_userId_tenant_fk" FOREIGN KEY ("organizationId","userId") REFERENCES "users" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "goals" ADD CONSTRAINT "goals_ownerId_tenant_fk" FOREIGN KEY ("organizationId","ownerId") REFERENCES "users" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "goals" ADD CONSTRAINT "goals_groupId_tenant_fk" FOREIGN KEY ("organizationId","groupId") REFERENCES "groups" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "saving_movements" ADD CONSTRAINT "saving_movements_userId_tenant_fk" FOREIGN KEY ("organizationId","userId") REFERENCES "users" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "saving_movements" ADD CONSTRAINT "saving_movements_goalId_tenant_fk" FOREIGN KEY ("organizationId","goalId") REFERENCES "goals" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      'ALTER TABLE "wallet_movements" ADD CONSTRAINT "wallet_movements_userId_tenant_fk" FOREIGN KEY ("organizationId","userId") REFERENCES "users" ("organizationId",id) ON DELETE RESTRICT',
    );
    await queryRunner.query(
      "CREATE FUNCTION budget_immutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Immutable journal: use a compensating movement'; END $$",
    );
    await queryRunner.query(
      'CREATE TRIGGER "audit_logs_immutable" BEFORE UPDATE OR DELETE ON "audit_logs" FOR EACH ROW EXECUTE FUNCTION budget_immutable()',
    );
    await queryRunner.query(
      'CREATE TRIGGER "wallet_movements_immutable" BEFORE UPDATE OR DELETE ON "wallet_movements" FOR EACH ROW EXECUTE FUNCTION budget_immutable()',
    );
    await queryRunner.query(
      'CREATE TRIGGER "saving_movements_immutable" BEFORE UPDATE OR DELETE ON "saving_movements" FOR EACH ROW EXECUTE FUNCTION budget_immutable()',
    );
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP TABLE "wallet_movements"');
    await queryRunner.query('DROP TABLE "saving_movements"');
    await queryRunner.query('DROP TABLE "goals"');
    await queryRunner.query('DROP TABLE "expense_payments"');
    await queryRunner.query('DROP TABLE "incomes"');
    await queryRunner.query('DROP TABLE "expense_shares"');
    await queryRunner.query('DROP TABLE "expenses"');
    await queryRunner.query('DROP TABLE "expense_templates"');
    await queryRunner.query('DROP TABLE "tags"');
    await queryRunner.query('DROP TABLE "categories"');
    await queryRunner.query('DROP TABLE "group_invitations"');
    await queryRunner.query('DROP TABLE "group_members"');
    await queryRunner.query('DROP TABLE "groups"');
    await queryRunner.query('DROP TABLE "users"');
    await queryRunner.query('DROP TABLE "organizations"');
    await queryRunner.query('DROP TABLE "audit_logs"');
    await queryRunner.query('DROP FUNCTION budget_immutable()');
  }
}
