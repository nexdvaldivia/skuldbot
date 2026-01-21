import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { License } from '../../licenses/entities/license.entity';

export enum TenantEnvironment {
  PRODUCTION = 'production',
  STAGING = 'staging',
  DEVELOPMENT = 'development',
  QA = 'qa',
}

export enum TenantDeploymentType {
  SAAS = 'saas',
  ON_PREMISE = 'on_premise',
  HYBRID = 'hybrid',
}

export enum TenantStatus {
  ACTIVE = 'active',
  PROVISIONING = 'provisioning',
  SUSPENDED = 'suspended',
  DEACTIVATED = 'deactivated',
  ERROR = 'error',
}

@Entity('tenants')
export class Tenant {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id' })
  clientId: string;

  @ManyToOne(() => Client, (client) => client.tenants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column()
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'enum', enum: TenantEnvironment, default: TenantEnvironment.PRODUCTION })
  environment: TenantEnvironment;

  @Column({
    name: 'deployment_type',
    type: 'enum',
    enum: TenantDeploymentType,
    default: TenantDeploymentType.SAAS,
  })
  deploymentType: TenantDeploymentType;

  @Column({ type: 'enum', enum: TenantStatus, default: TenantStatus.PROVISIONING })
  status: TenantStatus;

  @Column({ name: 'db_host', type: 'varchar', nullable: true })
  dbHost: string | null;

  @Column({ name: 'db_port', type: 'int', nullable: true })
  dbPort: number | null;

  @Column({ name: 'db_name', type: 'varchar', nullable: true })
  dbName: string | null;

  @Column({ name: 'db_user', type: 'varchar', nullable: true })
  dbUser: string | null;

  @Column({ name: 'db_password', type: 'varchar', nullable: true })
  dbPassword: string | null;

  @Column({ type: 'varchar', nullable: true })
  region: string | null;

  @Column({ name: 'api_url', type: 'varchar', nullable: true })
  apiUrl: string | null;

  @Column({ name: 'ui_url', type: 'varchar', nullable: true })
  uiUrl: string | null;

  @OneToMany(() => License, (license) => license.tenant)
  licenses: License[];

  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
