import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateCpRbacFoundation1763918400000 implements MigrationInterface {
  name = 'CreateCpRbacFoundation1763918400000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('CREATE EXTENSION IF NOT EXISTS "pgcrypto"');

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'cp_roles_scope_type_enum'
        ) THEN
          CREATE TYPE "cp_roles_scope_type_enum" AS ENUM ('platform', 'client');
        END IF;
      END
      $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_permissions" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "code" character varying(120) NOT NULL,
        "label" character varying(120) NOT NULL,
        "category" character varying(80) NOT NULL,
        "description" text,
        "is_system" boolean NOT NULL DEFAULT true,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_permissions_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_cp_permissions_code" UNIQUE ("code")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_roles" (
        "id" uuid NOT NULL DEFAULT gen_random_uuid(),
        "name" character varying(80) NOT NULL,
        "display_name" character varying(120) NOT NULL,
        "description" text,
        "scope_type" "cp_roles_scope_type_enum" NOT NULL DEFAULT 'platform',
        "client_id" uuid,
        "is_system" boolean NOT NULL DEFAULT false,
        "is_default" boolean NOT NULL DEFAULT false,
        "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
        "created_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_cp_roles_id" PRIMARY KEY ("id"),
        CONSTRAINT "uq_cp_roles_name" UNIQUE ("name")
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_role_permissions" (
        "role_id" uuid NOT NULL,
        "permission_id" uuid NOT NULL,
        CONSTRAINT "PK_cp_role_permissions" PRIMARY KEY ("role_id", "permission_id"),
        CONSTRAINT "FK_cp_role_permissions_role_id"
          FOREIGN KEY ("role_id") REFERENCES "cp_roles"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_role_permissions_permission_id"
          FOREIGN KEY ("permission_id") REFERENCES "cp_permissions"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "cp_user_roles" (
        "user_id" uuid NOT NULL,
        "role_id" uuid NOT NULL,
        CONSTRAINT "PK_cp_user_roles" PRIMARY KEY ("user_id", "role_id"),
        CONSTRAINT "FK_cp_user_roles_user_id"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION,
        CONSTRAINT "FK_cp_user_roles_role_id"
          FOREIGN KEY ("role_id") REFERENCES "cp_roles"("id")
          ON DELETE CASCADE ON UPDATE NO ACTION
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_roles_scope_type"
      ON "cp_roles" ("scope_type")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_roles_client_id"
      ON "cp_roles" ("client_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_role_permissions_role_id"
      ON "cp_role_permissions" ("role_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_role_permissions_permission_id"
      ON "cp_role_permissions" ("permission_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_user_roles_user_id"
      ON "cp_user_roles" ("user_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_cp_user_roles_role_id"
      ON "cp_user_roles" ("role_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_user_roles_role_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_user_roles_user_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_role_permissions_permission_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_role_permissions_role_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_roles_client_id"');
    await queryRunner.query('DROP INDEX IF EXISTS "IDX_cp_roles_scope_type"');

    await queryRunner.query('DROP TABLE IF EXISTS "cp_user_roles"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_role_permissions"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_roles"');
    await queryRunner.query('DROP TABLE IF EXISTS "cp_permissions"');

    await queryRunner.query(`
      DO $$
      BEGIN
        IF EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'cp_roles_scope_type_enum'
        ) THEN
          DROP TYPE "cp_roles_scope_type_enum";
        END IF;
      END
      $$;
    `);
  }
}
