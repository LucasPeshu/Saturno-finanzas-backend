import { WorkspaceService } from './workspace.service';
import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseIntPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { Actor } from './audit';
import { CurrentUser, SessionGuard } from './auth';
import { AccessService } from './access.service';
import { ExpensesService } from './expenses.service';
import { FinanceService } from './finance.service';
import { GoalsService } from './goals.service';
import { StatsService } from './stats.service';
import { AuditLog, User } from './entities';
import {
  CategoryDto,
  CreateUserDto,
  ExpenseDto,
  GenerateDto,
  GoalDto,
  IncomeDto,
  InviteDto,
  MoneyDto,
  NameDto,
  OrganizationDto,
  ProfileDto,
  QueryDto,
  RespondDto,
  ReversalDto,
  SavingDto,
  TagDto,
  TemplateDto,
  UpdateCategoryDto,
  UpdateGoalDto,
  UpdateTagDto,
  UpdateTemplateDto,
  UpdateUserDto,
} from './dto';

@ApiTags('organizations')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('organizations')
export class OrganizationsController {
  constructor(private readonly service: WorkspaceService) {}
  @Get('me') get(@CurrentUser() a: Actor) {
    return this.service.organization(a);
  }
  @Patch('me') update(@CurrentUser() a: Actor, @Body() dto: NameDto) {
    return this.service.renameOrganization(a, dto);
  }
  @Get() list(@CurrentUser() a: Actor, @Query() q: QueryDto) {
    return this.service.organizations(a, q);
  }
  @Post() create(@CurrentUser() a: Actor, @Body() dto: OrganizationDto) {
    return this.service.createOrganization(a, dto);
  }
  @Patch(':id') updateById(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: OrganizationDto,
  ) {
    return this.service.updateOrganization(a, id, dto);
  }
  @Get(':id/users') users(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Query() q: QueryDto,
  ) {
    return this.service.organizationUsers(a, id, q);
  }
  @Post(':id/users') createUser(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: CreateUserDto,
  ) {
    return this.service.createUserInOrganization(a, id, dto);
  }
  @Patch(':id/users/:userId') updateUser(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Param('userId', ParseIntPipe) userId: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.service.updateUserInOrganization(a, id, userId, dto);
  }
}
@ApiTags('users')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly service: WorkspaceService) {}
  @Get() list(@CurrentUser() a: Actor, @Query() q: QueryDto) {
    return this.service.users(a, q);
  }
  @Post() create(@CurrentUser() a: Actor, @Body() dto: CreateUserDto) {
    return this.service.createUser(a, dto);
  }
  @Get('me') me(@CurrentUser() a: Actor) {
    return this.service.access.db.manager.findOneByOrFail(User, {
      id: a.id,
      organizationId: a.organizationId,
    });
  }
  @Patch('me') profile(@CurrentUser() a: Actor, @Body() dto: ProfileDto) {
    return this.service.profile(a, dto);
  }
  @Patch(':id') update(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateUserDto,
  ) {
    return this.service.updateUser(a, id, dto);
  }
}
@ApiTags('groups')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('groups')
export class GroupsController {
  constructor(private readonly service: WorkspaceService) {}
  @Get() list(@CurrentUser() a: Actor, @Query() q: QueryDto) {
    return this.service.groups(a, q);
  }
  @Post() create(@CurrentUser() a: Actor, @Body() dto: NameDto) {
    return this.service.saveGroup(a, dto);
  }
  @Get(':id/members') members(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.members(a, id);
  }
  @Patch(':id') update(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: NameDto,
  ) {
    return this.service.saveGroup(a, dto, id);
  }
  @Post(':id/invitations') invite(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: InviteDto,
  ) {
    return this.service.invite(a, id, dto.userId);
  }
}
@ApiTags('group-invitations')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('group-invitations')
export class InvitationsController {
  constructor(private readonly service: WorkspaceService) {}
  @Get() list(@CurrentUser() a: Actor, @Query() q: QueryDto) {
    return this.service.invitations(a, q);
  }
  @Post(':id/respond') respond(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: RespondDto,
  ) {
    return this.service.respond(a, id, dto.status);
  }
}
@ApiTags('categories')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('categories')
export class CategoriesController {
  constructor(private readonly service: WorkspaceService) {}
  @Get() list(@CurrentUser() a: Actor, @Query() q: QueryDto) {
    return this.service.catalog(a, 'categories', q);
  }
  @Post() create(@CurrentUser() a: Actor, @Body() dto: CategoryDto) {
    return this.service.saveCategory(a, dto);
  }
  @Patch(':id') update(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateCategoryDto,
  ) {
    return this.service.saveCategory(a, dto, id);
  }
}
@ApiTags('tags')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('tags')
export class TagsController {
  constructor(private readonly service: WorkspaceService) {}
  @Get() list(@CurrentUser() a: Actor, @Query() q: QueryDto) {
    return this.service.catalog(a, 'tags', q);
  }
  @Post() create(@CurrentUser() a: Actor, @Body() dto: TagDto) {
    return this.service.saveTag(a, dto);
  }
  @Patch(':id') update(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTagDto,
  ) {
    return this.service.saveTag(a, dto, id);
  }
}
@ApiTags('expenses')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('expenses')
export class ExpensesController {
  constructor(
    private readonly service: ExpensesService,
    private readonly finance: FinanceService,
  ) {}
  @Get() list(@CurrentUser() a: Actor, @Query() q: QueryDto) {
    return this.service.list(a, q);
  }
  @Get(':id') detail(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.access.db.transaction('REPEATABLE READ', (m) =>
      this.service.detail(m, a, id),
    );
  }
  @Post() create(@CurrentUser() a: Actor, @Body() dto: ExpenseDto) {
    return this.service.create(a, dto);
  }
  @Post(':id/payments') pay(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: MoneyDto,
  ) {
    return this.finance.pay(a, id, dto);
  }
  @Post(':id/cancel') cancel(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.cancel(a, id);
  }
}
@ApiTags('expense-templates')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('expense-templates')
export class TemplatesController {
  constructor(private readonly service: ExpensesService) {}
  @Get() list(@CurrentUser() a: Actor, @Query() q: QueryDto) {
    return this.service.list(a, q, true);
  }
  @Post() create(@CurrentUser() a: Actor, @Body() dto: TemplateDto) {
    return this.service.createTemplate(a, dto);
  }
  @Patch(':id') update(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateTemplateDto,
  ) {
    return this.service.updateTemplate(a, id, dto);
  }
  @Post(':id/generate') generate(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: GenerateDto,
  ) {
    return this.service.generate(a, id, dto.month);
  }
}
@ApiTags('incomes')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('incomes')
export class IncomesController {
  constructor(private readonly service: FinanceService) {}
  @Get() list(@CurrentUser() a: Actor, @Query() q: QueryDto) {
    return this.service.list(a, q, 'incomes');
  }
  @Post() create(@CurrentUser() a: Actor, @Body() dto: IncomeDto) {
    return this.service.income(a, dto);
  }
  @Post(':id/reverse') reverse(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReversalDto,
  ) {
    return this.service.reverseIncome(a, id, dto);
  }
}
@ApiTags('payments')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('payments')
export class PaymentsController {
  constructor(private readonly service: FinanceService) {}
  @Post(':id/reverse') reverse(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: ReversalDto,
  ) {
    return this.service.reversePayment(a, id, dto);
  }
}
@ApiTags('wallet')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('wallet')
export class WalletController {
  constructor(private readonly service: FinanceService) {}
  @Get('movements') list(@CurrentUser() a: Actor, @Query() q: QueryDto) {
    return this.service.list(a, q, 'wallet');
  }
}
@ApiTags('savings')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('savings')
export class SavingsController {
  constructor(private readonly service: FinanceService) {}
  @Get('movements') list(@CurrentUser() a: Actor, @Query() q: QueryDto) {
    return this.service.list(a, q, 'savings');
  }
  @Post('movements') create(@CurrentUser() a: Actor, @Body() dto: SavingDto) {
    return this.service.saving(a, dto);
  }
}
@ApiTags('goals')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('goals')
export class GoalsController {
  constructor(private readonly service: GoalsService) {}
  @Get() list(@CurrentUser() a: Actor, @Query() q: QueryDto) {
    return this.service.list(a, q);
  }
  @Get(':id') detail(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.access.db.transaction('REPEATABLE READ', (m) =>
      this.service.details(m, a, id),
    );
  }
  @Post() create(@CurrentUser() a: Actor, @Body() dto: GoalDto) {
    return this.service.create(a, dto);
  }
  @Patch(':id') update(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
    @Body() dto: UpdateGoalDto,
  ) {
    return this.service.update(a, id, dto);
  }
  @Post(':id/complete') complete(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.close(a, id, 'completed');
  }
  @Post(':id/cancel') cancel(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.close(a, id, 'cancelled');
  }
  @Delete(':id') deleteCancelled(
    @CurrentUser() a: Actor,
    @Param('id', ParseIntPipe) id: number,
  ) {
    return this.service.deleteCancelled(a, id);
  }
}
@ApiTags('stats')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('stats')
export class StatsController {
  constructor(private readonly service: StatsService) {}
  @Get('dashboard') dashboard(@CurrentUser() a: Actor, @Query() q: QueryDto) {
    return this.service.dashboard(a, q);
  }
}
@ApiTags('audit-logs')
@ApiBearerAuth()
@UseGuards(SessionGuard)
@Controller('audit-logs')
export class AuditController {
  constructor(private readonly access: AccessService) {}
  @Get() async list(@CurrentUser() a: Actor, @Query() q: QueryDto) {
    // Even administrators can only inspect their own organization's audit trail.
    const canManageOrganization = a.role === 'owner' || a.role === 'admin';
    if (q.groupId) this.access.personal(a, q);
    if (!canManageOrganization) this.access.personal(a, q);
    const qb = this.access.db
      .getRepository(AuditLog)
      .createQueryBuilder('l')
      .where('l.organizationId = :org', { org: a.organizationId });
    if (!canManageOrganization || q.userId)
      qb.andWhere('l.actorId = :actor', { actor: q.userId ?? a.id });
    if (q.resource)
      qb.andWhere('l.resource = :resource', { resource: q.resource });
    if (q.dateFrom)
      qb.andWhere('l.createdAt >= :from', {
        from: q.dateFrom + 'T00:00:00-03:00',
      });
    if (q.dateTo)
      qb.andWhere('l.createdAt <= :to', {
        to: q.dateTo + 'T23:59:59.999-03:00',
      });
    const [data, total] = await qb
      .orderBy('l.id', 'DESC')
      .skip(((q.page ?? 1) - 1) * (q.limit ?? 25))
      .take(q.limit ?? 25)
      .getManyAndCount();
    return { data, total, page: q.page ?? 1, limit: q.limit ?? 25 };
  }
}
export const CONTROLLERS = [
  OrganizationsController,
  UsersController,
  GroupsController,
  InvitationsController,
  CategoriesController,
  TagsController,
  ExpensesController,
  TemplatesController,
  IncomesController,
  PaymentsController,
  WalletController,
  SavingsController,
  GoalsController,
  StatsController,
  AuditController,
];
