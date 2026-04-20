import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { Tenant } from '../../tenants/entities/tenant.entity';
import { ClientAddress } from './client-address.entity';
import { ClientContact } from './client-contact.entity';

@Entity('clients')
export class Client {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  slug: string;

  @Column({ type: 'varchar', length: 80, default: 'free' })
  plan: string;

  @Column({ type: 'varchar', length: 80, default: 'pending' })
  status: string;

  @Column({ name: 'billing_email' })
  billingEmail: string;

  @Column({ name: 'stripe_customer_id', type: 'varchar', nullable: true })
  stripeCustomerId: string | null;

  @Column({ name: 'stripe_subscription_id', type: 'varchar', nullable: true })
  stripeSubscriptionId: string | null;

  @Column({ name: 'api_key', type: 'varchar', nullable: true, unique: true })
  apiKey: string | null;

  @Column({ name: 'api_key_rotated_at', type: 'timestamp with time zone', nullable: true })
  apiKeyRotatedAt: Date | null;

  @Column({ type: 'jsonb', default: '{}' })
  settings: Record<string, unknown>;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @OneToMany(() => Tenant, (tenant) => tenant.client)
  tenants: Tenant[];

  @OneToMany(() => ClientContact, (contact) => contact.client)
  contacts: ClientContact[];

  @OneToMany(() => ClientAddress, (address) => address.client)
  addresses: ClientAddress[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
