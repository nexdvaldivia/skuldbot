import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSecurityAuditEvents1764219000000 implements MigrationInterface {
  name = 'CreateSecurityAuditEvents1764219000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS cp_security_audit_events (
        id uuid NOT NULL DEFAULT gen_random_uuid(),
        category varchar(32) NOT NULL,
        action varchar(80) NOT NULL,
        target_type varchar(80) NOT NULL,
        target_id varchar(120) NOT NULL,
        actor_user_id uuid,
        actor_email varchar(180),
        request_ip varchar(64),
        details jsonb NOT NULL DEFAULT '{}'::jsonb,
        created_at timestamptz NOT NULL DEFAULT NOW(),
        CONSTRAINT PK_cp_security_audit_events PRIMARY KEY (id)
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_cp_security_audit_target
      ON cp_security_audit_events (target_type, target_id)
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS idx_cp_security_audit_actor_created
      ON cp_security_audit_events (actor_user_id, created_at)
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query('DROP INDEX IF EXISTS idx_cp_security_audit_actor_created');
    await queryRunner.query('DROP INDEX IF EXISTS idx_cp_security_audit_target');
    await queryRunner.query('DROP TABLE IF EXISTS cp_security_audit_events');
  }
}
