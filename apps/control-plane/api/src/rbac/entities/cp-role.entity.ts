import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  JoinTable,
  ManyToMany,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Client } from '../../clients/entities/client.entity';
import { User } from '../../users/entities/user.entity';
import { CpPermission } from './cp-permission.entity';

export enum CpRoleScopeType {
  PLATFORM = 'platform',
  CLIENT = 'client',
}

@Entity('cp_roles')
@Unique('uq_cp_roles_name', ['name'])
export class CpRole {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 80 })
  name: string;

  @Column({ name: 'display_name', type: 'varchar', length: 120 })
  displayName: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({
    name: 'scope_type',
    type: 'varchar',
    length: 30,
    default: CpRoleScopeType.PLATFORM,
  })
  scopeType: CpRoleScopeType;

  @Column({ name: 'client_id', type: 'uuid', nullable: true })
  clientId: string | null;

  @ManyToOne(() => Client, { nullable: true, onDelete: 'CASCADE' })
  @JoinColumn({ name: 'client_id' })
  client: Client | null;

  @Column({ name: 'is_system', type: 'boolean', default: false })
  isSystem: boolean;

  @Column({ name: 'is_default', type: 'boolean', default: false })
  isDefault: boolean;

  @Column({ type: 'jsonb', default: '{}' })
  metadata: Record<string, unknown>;

  @ManyToMany(() => CpPermission, (permission) => permission.roles, {
    cascade: false,
  })
  @JoinTable({
    name: 'cp_role_permissions',
    joinColumn: { name: 'role_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'permission_id', referencedColumnName: 'id' },
  })
  permissions: CpPermission[];

  @ManyToMany(() => User, (user) => user.roles)
  users: User[];

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
