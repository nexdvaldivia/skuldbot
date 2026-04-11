import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { LookupValue } from '../../lookups/entities/lookup-value.entity';

export type LicenseFeatureValueType = 'number' | 'boolean';

@Entity('license_type_features')
@Unique('uq_license_type_feature', ['licenseTypeLookupValueId', 'featureKey'])
@Index(['featureKey'])
export class LicenseTypeFeature {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'license_type_lookup_value_id', type: 'uuid' })
  licenseTypeLookupValueId: string;

  @ManyToOne(() => LookupValue, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'license_type_lookup_value_id' })
  licenseTypeLookupValue: LookupValue;

  @Column({ name: 'feature_key', type: 'varchar', length: 80 })
  featureKey: string;

  @Column({ name: 'value_type', type: 'varchar', length: 20 })
  valueType: LicenseFeatureValueType;

  @Column({ name: 'number_value', type: 'decimal', precision: 20, scale: 6, nullable: true })
  numberValue: number | null;

  @Column({ name: 'boolean_value', type: 'boolean', nullable: true })
  booleanValue: boolean | null;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
