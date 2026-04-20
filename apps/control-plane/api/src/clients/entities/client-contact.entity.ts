import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from './client.entity';

export enum ClientContactType {
  PRIMARY = 'primary',
  TECHNICAL = 'technical',
  BUSINESS = 'business',
  LEGAL = 'legal',
  BILLING = 'billing',
  SUPPORT = 'support',
}

@Entity('client_contacts')
@Index('IDX_client_contacts_client_type_active', ['clientId', 'contactType', 'isActive'])
@Index('IDX_client_contacts_client_deleted', ['clientId', 'deletedAt'])
@Index('IDX_client_contacts_email', ['email'])
export class ClientContact {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'client_id', type: 'uuid' })
  clientId: string;

  @ManyToOne(() => Client, { nullable: false, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client;

  @Column({ name: 'contact_type', type: 'varchar', length: 20 })
  contactType: string;

  @Column({ name: 'first_name', type: 'varchar', length: 100 })
  firstName: string;

  @Column({ name: 'last_name', type: 'varchar', length: 100 })
  lastName: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Column({ type: 'varchar', length: 50, nullable: true })
  phone: string | null;

  @Column({ type: 'varchar', length: 50, nullable: true })
  mobile: string | null;

  @Column({ name: 'job_title', type: 'varchar', length: 100, nullable: true })
  jobTitle: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  department: string | null;

  @Column({ name: 'linkedin_url', type: 'varchar', length: 255, nullable: true })
  linkedinUrl: string | null;

  @Column({ name: 'is_primary', type: 'boolean', default: false })
  isPrimary: boolean;

  @Column({ name: 'is_contract_signer', type: 'boolean', default: false })
  isContractSigner: boolean;

  @Column({ name: 'is_installer', type: 'boolean', default: false })
  isInstaller: boolean;

  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive: boolean;

  @Column({ name: 'can_receive_marketing', type: 'boolean', default: true })
  canReceiveMarketing: boolean;

  @Column({ name: 'can_receive_updates', type: 'boolean', default: true })
  canReceiveUpdates: boolean;

  @Column({
    name: 'preferred_language',
    type: 'varchar',
    length: 10,
    nullable: true,
    default: 'en',
  })
  preferredLanguage: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
