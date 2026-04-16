import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('cp_contract_legal_info')
export class ContractLegalInfo {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'legal_name', type: 'varchar', length: 220, nullable: true })
  legalName: string | null;

  @Column({ name: 'trade_name', type: 'varchar', length: 220, nullable: true })
  tradeName: string | null;

  @Column({ name: 'legal_address_line1', type: 'varchar', length: 220, nullable: true })
  legalAddressLine1: string | null;

  @Column({ name: 'legal_address_line2', type: 'varchar', length: 220, nullable: true })
  legalAddressLine2: string | null;

  @Column({ name: 'legal_city', type: 'varchar', length: 120, nullable: true })
  legalCity: string | null;

  @Column({ name: 'legal_state', type: 'varchar', length: 120, nullable: true })
  legalState: string | null;

  @Column({ name: 'legal_postal_code', type: 'varchar', length: 40, nullable: true })
  legalPostalCode: string | null;

  @Column({ name: 'legal_country', type: 'varchar', length: 120, nullable: true })
  legalCountry: string | null;

  @Column({ name: 'representative_name', type: 'varchar', length: 180, nullable: true })
  representativeName: string | null;

  @Column({ name: 'representative_title', type: 'varchar', length: 180, nullable: true })
  representativeTitle: string | null;

  @Column({ name: 'representative_email', type: 'varchar', length: 180, nullable: true })
  representativeEmail: string | null;

  @Column({ name: 'website_url', type: 'varchar', length: 300, nullable: true })
  websiteUrl: string | null;

  @Column({ name: 'support_email', type: 'varchar', length: 180, nullable: true })
  supportEmail: string | null;

  @Column({ name: 'support_phone', type: 'varchar', length: 80, nullable: true })
  supportPhone: string | null;

  @Column({ name: 'updated_by_user_id', type: 'uuid', nullable: true })
  updatedByUserId: string | null;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
