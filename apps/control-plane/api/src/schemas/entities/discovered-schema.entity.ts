import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('discovered_schemas')
@Index(['nodeType'], { unique: true })
export class DiscoveredSchema {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  nodeType: string;

  @Column('jsonb')
  fields: SchemaField[];

  @Column({ default: 0 })
  sampleCount: number;

  @Column({ default: 0 })
  contributorCount: number;

  @Column('simple-array', { nullable: true })
  contributorTenants: string[] | null;

  @Column({ type: 'varchar', nullable: true })
  lastContributorTenant: string | null;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ default: false })
  isIncludedInRelease: boolean;

  @Column({ type: 'varchar', nullable: true })
  includedInVersion: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}

export interface SchemaField {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'object' | 'array' | 'null';
  items?: SchemaField[];
  fields?: SchemaField[];
}
