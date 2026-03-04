import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('tenant_settings')
@Unique(['tenantId'])
@Index(['tenantId'])
export class TenantSettings {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  tenantId: string;

  @Column({ nullable: true })
  organizationName: string | null;

  @Column({ nullable: true })
  organizationSlug: string | null;

  @Column({ nullable: true })
  logoUrl: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  preferences: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
