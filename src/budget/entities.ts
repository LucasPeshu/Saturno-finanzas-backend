import {
  Check,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';

export const money = {
  type: 'numeric' as const,
  precision: 14,
  scale: 2,
  transformer: { to: (v: number) => v, from: (v: string) => Number(v) },
};
export type Currency = 'ARS' | 'USD';
export type UserRole = 'owner' | 'admin' | 'member';
export class Base {
  @PrimaryGeneratedColumn('uuid') id: string;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
  @UpdateDateColumn({ type: 'timestamptz' }) updatedAt: Date;
}
@Entity('organizations')
export class Organization extends Base {
  @Column({ length: 120 }) name: string;
  @Column({ unique: true, length: 80 }) slug: string;
}
export class Tenant extends Base {
  @Column({ type: 'uuid' }) @Index() organizationId: string;
  @ManyToOne(() => Organization, { onDelete: 'RESTRICT' })
  organization: Organization;
}
@Entity('users')
@Check(
  '"savingsPercent" >= 0 AND "reservePercent" >= 0 AND "savingsPercent" + "reservePercent" <= 100',
)
export class User extends Tenant {
  @Column({ length: 120 }) name: string;
  @Column({ unique: true, length: 254 }) email: string;
  @Column({ select: false }) password: string;
  @Column({ type: 'varchar', default: 'member' }) role: UserRole;
  @Column({ default: true }) active: boolean;
  @Column({ type: 'int', default: 60 }) savingsPercent: number;
  @Column({ type: 'int', default: 20 }) reservePercent: number;
  @Column({ type: 'int', default: 25 }) goalBufferPercent: number;
}
@Entity('groups')
export class Group extends Tenant {
  @Column({ length: 120 }) name: string;
  @Column({ type: 'uuid' }) ownerId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) owner: User;
}
@Entity('group_members')
@Unique(['groupId', 'userId'])
export class GroupMember extends Tenant {
  @Column({ type: 'uuid' }) groupId: string;
  @ManyToOne(() => Group, { onDelete: 'RESTRICT' }) group: Group;
  @Column({ type: 'uuid' }) userId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) user: User;
}
@Entity('group_invitations')
@Unique(['groupId', 'userId'])
export class GroupInvitation extends Tenant {
  @Column({ type: 'uuid' }) groupId: string;
  @ManyToOne(() => Group, { onDelete: 'RESTRICT' }) group: Group;
  @Column({ type: 'uuid' }) userId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) user: User;
  @Column({ type: 'uuid' }) invitedById: string;
  @Column({ type: 'varchar', default: 'pending' }) status:
    | 'pending'
    | 'accepted'
    | 'rejected';
}
@Entity('categories')
@Unique(['organizationId', 'name'])
@Check('priority BETWEEN 1 AND 100')
export class Category extends Tenant {
  @Column({ length: 120 }) name: string;
  @Column({ type: 'int' }) priority: number;
  @Column({ default: false }) discretionary: boolean;
  @Column({ default: true }) active: boolean;
}
@Entity('tags')
@Unique(['organizationId', 'name'])
export class Tag extends Tenant {
  @Column({ length: 80 }) name: string;
  @Column({ length: 7, default: '#64748b' }) color: string;
  @Column({ default: true }) active: boolean;
}
export interface Split {
  userId: string;
  percent: number;
}
export class ExpenseFields extends Tenant {
  @Column({ length: 160 }) description: string;
  @Column(money) amount: number;
  @Column({ type: 'uuid' }) ownerId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) owner: User;
  @Column({ type: 'uuid', nullable: true }) groupId: string | null;
  @ManyToOne(() => Group, { nullable: true, onDelete: 'RESTRICT' })
  group: Group | null;
  @Column({ type: 'uuid' }) categoryId: string;
  @ManyToOne(() => Category, { onDelete: 'RESTRICT' }) category: Category;
  @Column({ type: 'jsonb', default: [] }) tagIds: string[];
}
@Entity('expense_templates')
@Check('amount > 0')
@Check('"dueDay" BETWEEN 1 AND 31')
export class ExpenseTemplate extends ExpenseFields {
  @Column({ type: 'int' }) dueDay: number;
  @Column({ length: 7 }) startMonth: string;
  @Column({ type: 'varchar', length: 7, nullable: true }) endMonth:
    | string
    | null;
  @Column({ type: 'jsonb', nullable: true }) splits: Split[] | null;
  @Column({ default: true }) active: boolean;
}
@Entity('expenses')
@Unique(['templateId', 'month'])
@Check('amount > 0')
export class Expense extends ExpenseFields {
  @Column({ type: 'varchar' }) kind: 'fixed' | 'extra' | 'daily';
  @Column({ length: 7 }) month: string;
  @Column({ type: 'date' }) dueDate: string;
  @Column({ type: 'uuid', nullable: true }) templateId: string | null;
  @ManyToOne(() => ExpenseTemplate, { nullable: true, onDelete: 'RESTRICT' })
  template: ExpenseTemplate | null;
  @Column({ type: 'int' }) priority: number;
  @Column() categoryName: string;
  @Column() discretionary: boolean;
  @Column({ default: false }) cancelled: boolean;
}
@Entity('expense_shares')
@Unique(['expenseId', 'userId'])
@Check('amount >= 0')
export class ExpenseShare extends Tenant {
  @Column({ type: 'uuid' }) expenseId: string;
  @ManyToOne(() => Expense, { onDelete: 'RESTRICT' }) expense: Expense;
  @Column({ type: 'uuid' }) userId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) user: User;
  @Column(money) amount: number;
}
@Entity('incomes')
@Check('amount > 0')
export class Income extends Tenant {
  @Column({ type: 'uuid' }) userId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) user: User;
  @Column({ length: 160 }) source: string;
  @Column(money) amount: number;
  @Column({ type: 'date' }) date: string;
  @Column({ default: false }) reversed: boolean;
  @Column({ type: 'date', nullable: true }) reversedOn: string | null;
}
@Entity('expense_payments')
@Check('amount > 0')
export class ExpensePayment extends Tenant {
  @Column({ type: 'uuid' }) expenseId: string;
  @ManyToOne(() => Expense, { onDelete: 'RESTRICT' }) expense: Expense;
  @Column({ type: 'uuid' }) userId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) user: User;
  @Column(money) amount: number;
  @Column({ type: 'date' }) date: string;
  @Column({ default: false }) reversed: boolean;
  @Column({ type: 'date', nullable: true }) reversedOn: string | null;
}
@Entity('goals')
@Check('"targetAmount" > 0')
export class Goal extends Tenant {
  @Column({ length: 160 }) name: string;
  @Column({ type: 'uuid' }) ownerId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) owner: User;
  @Column({ type: 'uuid', nullable: true }) groupId: string | null;
  @ManyToOne(() => Group, { nullable: true, onDelete: 'RESTRICT' })
  group: Group | null;
  @Column({ type: 'varchar', length: 3 }) currency: Currency;
  @Column(money) targetAmount: number;
  @Column({ type: 'date', nullable: true }) targetDate: string | null;
  @Column({ type: 'varchar', default: 'active' }) status:
    | 'active'
    | 'completed'
    | 'cancelled'
    | 'deleted';
}
@Entity('saving_movements')
@Check('amount > 0 AND "arsAmount" > 0 AND "exchangeRate" > 0')
export class SavingMovement extends Tenant {
  @Column({ type: 'uuid' }) userId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) user: User;
  @Column({ type: 'uuid', nullable: true }) goalId: string | null;
  @ManyToOne(() => Goal, { nullable: true, onDelete: 'RESTRICT' })
  goal: Goal | null;
  @Column({ type: 'varchar', length: 3 }) currency: Currency;
  @Column(money) amount: number;
  @Column(money) arsAmount: number;
  @Column({ ...money, scale: 6 }) exchangeRate: number;
  @Column({ type: 'varchar' }) direction: 'deposit' | 'withdraw' | 'spend';
  @Column({ type: 'date' }) date: string;
  @Column({ length: 160 }) description: string;
}
@Entity('wallet_movements')
@Unique(['userId', 'idempotencyKey'])
export class WalletMovement extends Tenant {
  @Column({ type: 'uuid' }) userId: string;
  @ManyToOne(() => User, { onDelete: 'RESTRICT' }) user: User;
  @Column({ type: 'varchar' }) kind:
    | 'income'
    | 'payment'
    | 'saving'
    | 'withdrawal'
    | 'reversal'
    | 'goal_purchase';
  @Column(money) amount: number;
  @Column({ type: 'date' }) date: string;
  @Column({ length: 160 }) description: string;
  @Column({ type: 'uuid' }) referenceId: string;
  @Column({ type: 'uuid' }) idempotencyKey: string;
  @Column({ length: 64 }) requestHash: string;
}
@Entity('audit_logs')
@Index(['organizationId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid') id: string;
  @Column({ type: 'uuid', nullable: true }) organizationId: string | null;
  @Column({ type: 'uuid', nullable: true }) actorId: string | null;
  @Column({ type: 'varchar', nullable: true }) actorEmail: string | null;
  @Column() action: string;
  @Column() resource: string;
  @Column({ type: 'uuid', nullable: true }) entityId: string | null;
  @Column({ type: 'jsonb', nullable: true }) before: Record<
    string,
    unknown
  > | null;
  @Column({ type: 'jsonb', nullable: true }) after: Record<
    string,
    unknown
  > | null;
  @Column({ type: 'uuid', nullable: true }) requestId: string | null;
  @Column({ type: 'varchar', nullable: true }) ip: string | null;
  @Column({ default: true }) success: boolean;
  @CreateDateColumn({ type: 'timestamptz' }) createdAt: Date;
}
export const ENTITIES = [
  Organization,
  User,
  Group,
  GroupMember,
  GroupInvitation,
  Category,
  Tag,
  ExpenseTemplate,
  Expense,
  ExpenseShare,
  Income,
  ExpensePayment,
  Goal,
  SavingMovement,
  WalletMovement,
  AuditLog,
];
