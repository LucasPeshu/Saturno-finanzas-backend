import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { In, Not } from 'typeorm';
import * as bcrypt from 'bcryptjs';
import { Actor } from './audit';
import {
  Category,
  Group,
  GroupInvitation,
  GroupMember,
  Organization,
  Tag,
  User,
} from './entities';
import {
  CategoryDto,
  CreateUserDto,
  NameDto,
  OrganizationDto,
  ProfileDto,
  QueryDto,
  TagDto,
  UpdateCategoryDto,
  UpdateTagDto,
  UpdateUserDto,
} from './dto';

import { AccessService } from './access.service';

@Injectable()
export class WorkspaceService {
  constructor(readonly access: AccessService) {}
  async createUser(a: Actor, dto: CreateUserDto) {
    this.access.admin(a);
    if (dto.role === 'owner') this.access.owner(a);
    const password = await bcrypt.hash(dto.password, 12);
    return this.access.write(a, async (m) => {
      const user = await m.save(
        User,
        m.create(User, { ...dto, password, organizationId: a.organizationId }),
      );
      await this.access.audit.record(m, a, 'CREATE', 'users', user);
      const { password: _password, ...safe } = user;
      return safe;
    });
  }
  async users(a: Actor, q: QueryDto) {
    await this.access.scope(a, q);
    let ids: string[] | undefined;
    if (q.groupId)
      ids = (
        await this.access.db.manager.findBy(GroupMember, {
          organizationId: a.organizationId,
          groupId: q.groupId,
        })
      ).map((g) => g.userId);
    const rows = await this.access.db.manager.find(User, {
      where: {
        organizationId: a.organizationId,
        ...(q.userId ? { id: q.userId } : ids ? { id: In(ids) } : {}),
        ...(a.role === 'owner' || a.role === 'admin' ? {} : { active: true }),
      },
      order: { name: 'ASC' },
    });
    // Directory only; budget settings and personal financial data remain private.
    return this.access.paginate(
      rows.map(({ id, name, email, role, active }) => ({
        id,
        name,
        email,
        role,
        active,
      })),
      q,
    );
  }
  async updateUser(a: Actor, id: string, dto: UpdateUserDto) {
    this.access.admin(a);
    return this.access.write(a, async (m) => {
      const user = await m.findOneBy(User, {
        id,
        organizationId: a.organizationId,
      });
      if (!user) throw new NotFoundException();
      if (dto.role === 'owner') this.access.owner(a);
      if (id === a.id && (dto.active === false || dto.role))
        throw new BadRequestException(
          'No podés desactivar o cambiar el rol de tu propia cuenta',
        );
      const before = { ...user };
      Object.assign(user, dto);
      const saved = await m.save(user);
      await this.access.audit.record(m, a, 'UPDATE', 'users', saved, before);
      return saved;
    });
  }
  async profile(a: Actor, dto: ProfileDto) {
    return this.access.write(a, async (m) => {
      const user = await m
        .getRepository(User)
        .createQueryBuilder('u')
        .addSelect('u.password')
        .where('u.id = :id AND u.organizationId = :org', {
          id: a.id,
          org: a.organizationId,
        })
        .getOneOrFail();
      if (
        (dto.savingsPercent ?? user.savingsPercent) +
          (dto.reservePercent ?? user.reservePercent) >
        100
      )
        throw new BadRequestException(
          'Ahorro y reserva no pueden sumar más de 100%',
        );
      const before = { ...user };
      if (dto.newPassword) {
        if (
          !dto.currentPassword ||
          !(await bcrypt.compare(dto.currentPassword, user.password))
        )
          throw new BadRequestException('Contraseña actual incorrecta');
        user.password = await bcrypt.hash(dto.newPassword, 12);
      }
      const { newPassword: _new, currentPassword: _current, ...settings } = dto;
      Object.assign(user, settings);
      await m.save(user);
      await this.access.audit.record(m, a, 'UPDATE', 'users', user, before);
      const { password: _password, ...safe } = user;
      return safe;
    });
  }
  async organization(a: Actor) {
    return this.access.db.manager.findOneByOrFail(Organization, {
      id: a.organizationId,
    });
  }
  async organizations(a: Actor, q: QueryDto) {
    this.access.owner(a);
    const rows = await this.access.db.manager.find(Organization, {
      order: { name: 'ASC' },
    });
    const withMembers = await Promise.all(
      rows.map(async (organization) => ({
        ...organization,
        memberCount: await this.access.db.manager.countBy(User, {
          organizationId: organization.id,
          active: true,
        }),
      })),
    );
    return this.access.paginate(withMembers, q);
  }
  async createOrganization(a: Actor, dto: OrganizationDto) {
    this.access.owner(a);
    return this.access.write(a, async (m) => {
      const slug = await this.uniqueOrganizationSlug(
        m,
        dto.slug ?? this.slugify(dto.name),
      );
      const saved = await m.save(
        Organization,
        m.create(Organization, { name: dto.name, slug }),
      );
      await this.access.audit.record(m, a, 'CREATE', 'organizations', saved);
      return saved;
    });
  }
  async updateOrganization(a: Actor, id: string, dto: OrganizationDto) {
    this.access.owner(a);
    return this.access.write(a, async (m) => {
      const before = await m.findOneBy(Organization, { id });
      if (!before) throw new NotFoundException('Organización no encontrada');
      const slug = dto.slug
        ? await this.uniqueOrganizationSlug(m, dto.slug, before.id)
        : before.slug;
      const saved = await m.save(Organization, {
        ...before,
        name: dto.name,
        slug,
      });
      await this.access.audit.record(
        m,
        a,
        'UPDATE',
        'organizations',
        saved,
        before,
      );
      return saved;
    });
  }
  async organizationUsers(a: Actor, id: string, q: QueryDto) {
    this.access.owner(a);
    if (!(await this.access.db.manager.existsBy(Organization, { id })))
      throw new NotFoundException('Organización no encontrada');
    const rows = await this.access.db.manager.find(User, {
      where: { organizationId: id },
      order: { name: 'ASC' },
    });
    return this.access.paginate(
      rows.map(({ id: userId, name, email, role, active }) => ({
        id: userId,
        name,
        email,
        role,
        active,
      })),
      q,
    );
  }
  async createUserInOrganization(
    a: Actor,
    organizationId: string,
    dto: CreateUserDto,
  ) {
    this.access.owner(a);
    if (dto.role === 'owner') this.access.owner(a);
    const password = await bcrypt.hash(dto.password, 12);
    return this.access.write(a, async (m) => {
      if (!(await m.existsBy(Organization, { id: organizationId })))
        throw new NotFoundException('Organización no encontrada');
      const user = await m.save(
        User,
        m.create(User, { ...dto, password, organizationId }),
      );
      await this.access.audit.record(m, a, 'CREATE', 'users', user);
      const { password: _password, ...safe } = user;
      return safe;
    });
  }
  async updateUserInOrganization(
    a: Actor,
    organizationId: string,
    userId: string,
    dto: UpdateUserDto,
  ) {
    this.access.owner(a);
    return this.access.write(a, async (m) => {
      if (!(await m.existsBy(Organization, { id: organizationId })))
        throw new NotFoundException('Organización no encontrada');
      const user = await m.findOneBy(User, { id: userId, organizationId });
      if (!user) throw new NotFoundException('Usuario no encontrado');
      if (dto.role === 'owner') this.access.owner(a);
      if (user.id === a.id && (dto.active === false || dto.role))
        throw new BadRequestException(
          'No podés desactivar o cambiar el rol de tu propia cuenta',
        );
      const before = { ...user };
      Object.assign(user, dto);
      const saved = await m.save(user);
      await this.access.audit.record(m, a, 'UPDATE', 'users', saved, before);
      return saved;
    });
  }
  async renameOrganization(a: Actor, dto: NameDto) {
    this.access.admin(a);
    return this.access.write(a, async (m) => {
      const before = await m.findOneByOrFail(Organization, {
        id: a.organizationId,
      });
      const saved = await m.save(Organization, { ...before, name: dto.name });
      await this.access.audit.record(
        m,
        a,
        'UPDATE',
        'organizations',
        saved,
        before,
      );
      return saved;
    });
  }
  private slugify(value: string) {
    const slug = value
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 80);
    return slug || 'organizacion';
  }
  private async uniqueOrganizationSlug(
    m: import('typeorm').EntityManager,
    base: string,
    ignoreId?: string,
  ) {
    const normalized = this.slugify(base);
    const exists = await m.existsBy(Organization, {
      slug: normalized,
      ...(ignoreId ? { id: Not(ignoreId) } : {}),
    });
    if (exists)
      throw new ConflictException(
        'Ya existe una organización con ese identificador',
      );
    return normalized;
  }
  async catalog(a: Actor, type: 'categories' | 'tags', q: QueryDto) {
    this.access.personal(a, q);
    const rows =
      type === 'categories'
        ? await this.access.db.manager.find(Category, {
            where: { organizationId: a.organizationId },
            order: { name: 'ASC' },
          })
        : await this.access.db.manager.find(Tag, {
            where: { organizationId: a.organizationId },
            order: { name: 'ASC' },
          });
    return this.access.paginate<Category | Tag>(rows, q);
  }
  async saveCategory(
    a: Actor,
    dto: CategoryDto | UpdateCategoryDto,
    id?: string,
  ) {
    this.access.admin(a);
    return this.access.write(a, async (m) => {
      const before = id
        ? await m.findOneBy(Category, { id, organizationId: a.organizationId })
        : null;
      if (id && !before) throw new NotFoundException();
      const saved = await m.save(
        Category,
        m.create(Category, {
          ...before,
          ...dto,
          organizationId: a.organizationId,
        }),
      );
      await this.access.audit.record(
        m,
        a,
        id ? 'UPDATE' : 'CREATE',
        'categories',
        saved,
        before,
      );
      return saved;
    });
  }
  async saveTag(a: Actor, dto: TagDto | UpdateTagDto, id?: string) {
    this.access.admin(a);
    return this.access.write(a, async (m) => {
      const before = id
        ? await m.findOneBy(Tag, { id, organizationId: a.organizationId })
        : null;
      if (id && !before) throw new NotFoundException();
      const saved = await m.save(
        Tag,
        m.create(Tag, { ...before, ...dto, organizationId: a.organizationId }),
      );
      await this.access.audit.record(
        m,
        a,
        id ? 'UPDATE' : 'CREATE',
        'tags',
        saved,
        before,
      );
      return saved;
    });
  }
  async groups(a: Actor, q: QueryDto) {
    await this.access.scope(a, q);
    let ids = await this.access.groupIds(this.access.db.manager, a);
    if (q.groupId) ids = ids.filter((id) => id === q.groupId);
    if (q.userId) {
      const memberships = await this.access.db.manager.findBy(GroupMember, {
        organizationId: a.organizationId,
        userId: q.userId,
      });
      ids = ids.filter((id) => memberships.some((m) => m.groupId === id));
    }
    return this.access.paginate(
      await this.access.db.manager.find(Group, {
        where: { organizationId: a.organizationId, id: In(ids) },
        order: { id: 'DESC' },
      }),
      q,
    );
  }
  async members(a: Actor, id: string) {
    await this.access.group(this.access.db.manager, a, id);
    const members = await this.access.db.manager.findBy(GroupMember, {
      organizationId: a.organizationId,
      groupId: id,
    });
    return this.access.db.manager.find(User, {
      where: {
        organizationId: a.organizationId,
        id: In(members.map((m) => m.userId)),
      },
      select: ['id', 'name', 'email', 'active'],
    });
  }
  async saveGroup(a: Actor, dto: NameDto, id?: string) {
    return this.access.write(a, async (m) => {
      const before = id ? await this.access.group(m, a, id, true) : null;
      const saved = await m.save(
        Group,
        m.create(Group, {
          ...before,
          name: dto.name,
          organizationId: a.organizationId,
          ownerId: a.id,
        }),
      );
      if (!id)
        await m.save(
          GroupMember,
          m.create(GroupMember, {
            organizationId: a.organizationId,
            groupId: saved.id,
            userId: a.id,
          }),
        );
      await this.access.audit.record(
        m,
        a,
        id ? 'UPDATE' : 'CREATE',
        'groups',
        saved,
        before,
      );
      return saved;
    });
  }
  async invite(a: Actor, groupId: string, userId: string) {
    return this.access.write(a, async (m) => {
      await this.access.group(m, a, groupId, true);
      if (
        !(await m.existsBy(User, {
          id: userId,
          organizationId: a.organizationId,
          active: true,
        }))
      )
        throw new NotFoundException('Usuario no encontrado');
      if (
        await m.existsBy(GroupMember, {
          organizationId: a.organizationId,
          groupId,
          userId,
        })
      )
        throw new BadRequestException('El usuario ya pertenece al grupo');
      const before = await m.findOneBy(GroupInvitation, {
        organizationId: a.organizationId,
        groupId,
        userId,
      });
      const invitation = await m.save(
        GroupInvitation,
        m.create(GroupInvitation, {
          ...before,
          organizationId: a.organizationId,
          groupId,
          userId,
          invitedById: a.id,
          status: 'pending',
        }),
      );
      await this.access.audit.record(
        m,
        a,
        'INVITE',
        'group-invitations',
        invitation,
        before,
      );
      return invitation;
    });
  }
  async invitations(a: Actor, q: QueryDto) {
    this.access.personal(a, q);
    const invitations = await this.access.db.manager.find(GroupInvitation, {
      where: { organizationId: a.organizationId, userId: a.id },
      relations: { group: true },
      order: { id: 'DESC' },
    });
    return this.access.paginate(
      invitations.map(({ group, ...invitation }) => ({
        ...invitation,
        groupName: group.name,
      })),
      q,
    );
  }
  async respond(a: Actor, id: string, status: 'accepted' | 'rejected') {
    return this.access.write(a, async (m) => {
      const invitation = await m.findOneBy(GroupInvitation, {
        id,
        organizationId: a.organizationId,
        userId: a.id,
      });
      if (!invitation) throw new NotFoundException();
      if (invitation.status !== 'pending')
        throw new BadRequestException('La invitación ya fue respondida');
      const before = { ...invitation };
      invitation.status = status;
      if (status === 'accepted')
        await m.save(
          GroupMember,
          m.create(GroupMember, {
            organizationId: a.organizationId,
            groupId: invitation.groupId,
            userId: a.id,
          }),
        );
      await m.save(invitation);
      await this.access.audit.record(
        m,
        a,
        'RESPOND',
        'group-invitations',
        invitation,
        before,
      );
      return invitation;
    });
  }
}
