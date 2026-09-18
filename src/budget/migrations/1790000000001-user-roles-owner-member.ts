import { MigrationInterface, QueryRunner } from 'typeorm';

export class UserRolesOwnerMember1790000000001 implements MigrationInterface {
  name = 'UserRolesOwnerMember1790000000001';

  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT \'member\'',
    );
    await queryRunner.query(
      'UPDATE "users" SET "role" = \'member\' WHERE "role" = \'user\'',
    );
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      'UPDATE "users" SET "role" = \'user\' WHERE "role" = \'member\'',
    );
    await queryRunner.query(
      'UPDATE "users" SET "role" = \'admin\' WHERE "role" = \'owner\'',
    );
    await queryRunner.query(
      'ALTER TABLE "users" ALTER COLUMN "role" SET DEFAULT \'user\'',
    );
  }
}
