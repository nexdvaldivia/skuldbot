import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrchestratorRbacFoundation1763919300000
  implements MigrationInterface
{
  name = 'CreateOrchestratorRbacFoundation1763919300000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'permissions_category_enum'
        ) THEN
          CREATE TYPE "permissions_category_enum" AS ENUM (
            'bots',
            'runs',
            'runners',
            'schedules',
            'users',
            'roles',
            'tenants',
            'audit',
            'settings',
            'api_keys',
            'credentials',
            'evidence',
            'auditors',
            'compliance'
          );
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'roles_type_enum'
        ) THEN
          CREATE TYPE "roles_type_enum" AS ENUM ('system', 'custom');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "permissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying NOT NULL,
        "displayName" character varying NOT NULL,
        "description" character varying,
        "category" "permissions_category_enum" NOT NULL,
        "isSystemPermission" boolean NOT NULL DEFAULT false,
        CONSTRAINT "PK_permissions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_permissions_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "roles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "tenantId" uuid NOT NULL,
        "name" character varying NOT NULL,
        "displayName" character varying NOT NULL,
        "description" character varying,
        "type" "roles_type_enum" NOT NULL DEFAULT 'custom',
        "priority" integer NOT NULL DEFAULT 0,
        "isDefault" boolean NOT NULL DEFAULT false,
        "createdAt" TIMESTAMP NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_roles_id" PRIMARY KEY ("id")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "role_permissions" (
        "roleId" uuid NOT NULL,
        "permissionId" uuid NOT NULL,
        CONSTRAINT "PK_role_permissions" PRIMARY KEY ("roleId", "permissionId"),
        CONSTRAINT "FK_role_permissions_roleId"
          FOREIGN KEY ("roleId") REFERENCES "roles"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_role_permissions_permissionId"
          FOREIGN KEY ("permissionId") REFERENCES "permissions"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "user_roles" (
        "userId" uuid NOT NULL,
        "roleId" uuid NOT NULL,
        CONSTRAINT "PK_user_roles" PRIMARY KEY ("userId", "roleId")
      )
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_user_roles_roleId'
        ) THEN
          ALTER TABLE "user_roles"
          ADD CONSTRAINT "FK_user_roles_roleId"
          FOREIGN KEY ("roleId") REFERENCES "roles"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM information_schema.tables
          WHERE table_schema = 'public' AND table_name = 'users'
        ) AND NOT EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_user_roles_userId'
        ) THEN
          ALTER TABLE "user_roles"
          ADD CONSTRAINT "FK_user_roles_userId"
          FOREIGN KEY ("userId") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION;
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_permissions_name_unique"
      ON "permissions" ("name")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_permissions_category"
      ON "permissions" ("category")
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_roles_tenant_name_unique"
      ON "roles" ("tenantId", "name")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_roles_tenant_type"
      ON "roles" ("tenantId", "type")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_roles_tenant_id"
      ON "roles" ("tenantId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_role_permissions_role_id"
      ON "role_permissions" ("roleId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_role_permissions_permission_id"
      ON "role_permissions" ("permissionId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_roles_user_id"
      ON "user_roles" ("userId")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_user_roles_role_id"
      ON "user_roles" ("roleId")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_user_roles_role_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_user_roles_user_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_role_permissions_permission_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_role_permissions_role_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_roles_tenant_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_roles_tenant_type"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_roles_tenant_name_unique"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_permissions_category"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_permissions_name_unique"');

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_user_roles_userId'
        ) THEN
          ALTER TABLE "user_roles" DROP CONSTRAINT "FK_user_roles_userId";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_constraint WHERE conname = 'FK_user_roles_roleId'
        ) THEN
          ALTER TABLE "user_roles" DROP CONSTRAINT "FK_user_roles_roleId";
        END IF;
      END
      $$;
    `);

    await queryRunner.query('DROP TABLE IF EXISTS "user_roles"');
    await queryRunner.query('DROP TABLE IF EXISTS "role_permissions"');
    await queryRunner.query('DROP TABLE IF EXISTS "roles"');
    await queryRunner.query('DROP TABLE IF EXISTS "permissions"');

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'roles_type_enum'
        ) THEN
          DROP TYPE "roles_type_enum";
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1 FROM pg_type WHERE typname = 'permissions_category_enum'
        ) THEN
          DROP TYPE "permissions_category_enum";
        END IF;
      END
      $$;
    `);
  }
}
