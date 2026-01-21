import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';

export enum ClientPlan {
  FREE = 'free',
  STARTER = 'starter',
  PROFESSIONAL = 'professional',
  ENTERPRISE = 'enterprise',
}

export enum ClientStatus {
  ACTIVE = 'active',
  SUSPENDED = 'suspended',
  PENDING = 'pending',
  CANCELED = 'canceled',
}

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'enum', enum: ClientPlan, default: ClientPlan.FREE })
  plan: ClientPlan;

  @Column({ type: 'enum', enum: ClientStatus, default: ClientStatus.PENDING })
  status: ClientStatus;

  @Column({ name: 'billing_email' })
  billingEmail: string;

  @Column({ name: 'stripe_customer_id', type: 'varchar', nullable: true })
  stripeCustomerId: string | null;

  @Column({ name: 'stripe_subscription_id', type: 'varchar', nullable: true })
  stripeSubscriptionId: string | null;

  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, unknown>;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;

  @OneToMany(() => Tenant, (tenant) => tenant.client)
  tenants: Tenant[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
