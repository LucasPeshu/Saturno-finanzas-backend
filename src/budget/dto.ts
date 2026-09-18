import { PartialType } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayUnique,
  IsArray,
  IsBoolean,
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
  Max,
  MaxLength,
  Min,
  MinLength,
  ValidateIf,
  ValidateNested,
} from 'class-validator';

export class NameDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  name: string;
}
export class OrganizationDto extends NameDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @Matches(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  @MaxLength(80)
  slug?: string;
}
export class LoginDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email: string;
  @IsString() @MinLength(10) @MaxLength(72) password: string;
}
export class CreateUserDto extends LoginDto {
  @IsString() @MinLength(1) @MaxLength(120) name: string;
  @IsOptional()
  @IsIn(['owner', 'admin', 'member'])
  role?: 'owner' | 'admin' | 'member';
}
export class UpdateUserDto extends PartialType(
  OmitType(CreateUserDto, ['password'] as const),
) {
  @IsOptional() @IsBoolean() active?: boolean;
}
export class ProfileDto {
  @IsOptional()
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsEmail()
  @MaxLength(254)
  email?: string;
  @IsOptional() @IsString() @MinLength(1) @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MinLength(10) @MaxLength(72) newPassword?: string;
  @IsOptional() @IsString() @MaxLength(72) currentPassword?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100) savingsPercent?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) reservePercent?: number;
  @IsOptional() @IsInt() @Min(0) @Max(100) goalBufferPercent?: number;
}
export class CategoryDto extends NameDto {
  @IsInt() @Min(1) @Max(100) priority: number;
  @IsOptional() @IsBoolean() discretionary?: boolean;
}
export class UpdateCategoryDto extends PartialType(CategoryDto) {
  @IsOptional() @IsBoolean() active?: boolean;
}
export class TagDto extends NameDto {
  @IsOptional() @Matches(/^#[0-9a-fA-F]{6}$/) color?: string;
}
export class UpdateTagDto extends PartialType(TagDto) {
  @IsOptional() @IsBoolean() active?: boolean;
}
export class InviteDto {
  @IsInt() @Min(1) userId: number;
}
export class RespondDto {
  @IsIn(['accepted', 'rejected']) status: 'accepted' | 'rejected';
}
export class SplitDto {
  @IsInt() @Min(1) userId: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100) percent: number;
}
export class ExpenseFieldsDto {
  @IsString() @MinLength(1) @MaxLength(160) description: string;
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000_000)
  amount: number;
  @IsInt() @Min(1) categoryId: number;
  @IsOptional() @IsInt() @Min(1) groupId?: number;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(30)
  @ArrayUnique()
  @IsInt({ each: true })
  @Min(1, { each: true })
  tagIds?: number[];
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SplitDto)
  splits?: SplitDto[];
}
export class ExpenseDto extends ExpenseFieldsDto {
  @IsIn(['extra', 'daily']) kind: 'extra' | 'daily';
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dueDate: string;
}
export class TemplateDto extends ExpenseFieldsDto {
  @IsInt() @Min(1) @Max(31) dueDay: number;
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) startMonth: string;
  @IsOptional() @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) endMonth?: string;
}
export class UpdateTemplateDto extends PartialType(TemplateDto) {
  @IsOptional() @IsInt() @Min(1) declare groupId?: number | null;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SplitDto)
  declare splits?: SplitDto[] | null;
  @IsOptional() @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) declare endMonth?: string | null;
  @IsOptional() @IsBoolean() active?: boolean;
}
export class GenerateDto {
  @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) month: string;
}
export class MoneyDto {
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000_000)
  amount: number;
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @IsUUID('4') idempotencyKey: string;
}
export class IncomeDto extends MoneyDto {
  @IsString() @MinLength(1) @MaxLength(160) source: string;
}
export class ReversalDto {
  @IsUUID('4') idempotencyKey: string;
  @IsDateString({ strict: true }) @Matches(/^\d{4}-\d{2}-\d{2}$/) date: string;
  @IsString() @MinLength(3) @MaxLength(160) reason: string;
}
export class GoalDto extends NameDto {
  @IsIn(['ARS', 'USD']) currency: 'ARS' | 'USD';
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(1_000_000_000)
  targetAmount: number;
  @IsOptional() @IsInt() @Min(1) groupId?: number;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  targetDate?: string;
}
export class UpdateGoalDto extends PartialType(
  OmitType(GoalDto, ['groupId', 'currency'] as const),
) {}
export class SavingDto extends MoneyDto {
  @IsIn(['ARS', 'USD']) currency: 'ARS' | 'USD';
  @IsIn(['deposit', 'withdraw', 'spend']) direction:
    | 'deposit'
    | 'withdraw'
    | 'spend';
  @ValidateIf(
    (o: SavingDto) => o.currency === 'USD' || o.exchangeRate !== undefined,
  )
  @IsNumber({ maxDecimalPlaces: 6 })
  @Min(0.000001)
  @Max(1_000_000)
  exchangeRate?: number;
  @IsOptional() @IsInt() @Min(1) goalId?: number;
  @IsString() @MinLength(1) @MaxLength(160) description: string;
}
export class QueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 25;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateFrom?: string;
  @IsOptional()
  @IsDateString({ strict: true })
  @Matches(/^\d{4}-\d{2}-\d{2}$/)
  dateTo?: string;
  @IsOptional() @Matches(/^20\d{2}-(0[1-9]|1[0-2])$/) month?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) groupId?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) userId?: number;
  @IsOptional() @IsString() @MaxLength(80) resource?: string;
}
