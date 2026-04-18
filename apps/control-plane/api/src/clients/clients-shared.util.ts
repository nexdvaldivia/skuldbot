import { BadRequestException, NotFoundException } from '@nestjs/common';
import { QueryDeepPartialEntity } from 'typeorm/query-builder/QueryPartialEntity';
import { EntityTarget, ObjectLiteral, Repository } from 'typeorm';
import { User } from '../users/entities/user.entity';
import { Client } from './entities/client.entity';

export async function ensureClientAccess(
  clientRepository: Repository<Client>,
  clientId: string,
  currentUser: User,
): Promise<void> {
  const clientExists = await clientRepository.exist({ where: { id: clientId } });
  if (!clientExists) {
    throw new NotFoundException({
      code: 'CLIENT_NOT_FOUND',
      message: `Client ${clientId} not found`,
    });
  }

  if (!currentUser.isSkuld() && currentUser.clientId !== clientId) {
    throw new BadRequestException({
      code: 'CLIENT_SCOPE_VIOLATION',
      message: `Current user cannot access resources for client ${clientId}.`,
    });
  }
}

export async function clearPrimaryForType<T extends ObjectLiteral>(
  repository: Repository<T>,
  entityTarget: EntityTarget<T>,
  clientId: string,
  typeColumn: 'contact_type' | 'address_type',
  typeValue: string,
  excludeId?: string,
): Promise<void> {
  const qb = repository
    .createQueryBuilder()
    .update(entityTarget)
    .set({ isPrimary: false } as unknown as QueryDeepPartialEntity<T>)
    .where('client_id = :clientId', { clientId })
    .andWhere(`${typeColumn} = :typeValue`, { typeValue })
    .andWhere('is_primary = :isPrimary', { isPrimary: true })
    .andWhere('deleted_at IS NULL');

  if (excludeId) {
    qb.andWhere('id != :excludeId', { excludeId });
  }

  await qb.execute();
}

export function normalizeOptionalString(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const normalized = value.trim();
  return normalized.length > 0 ? normalized : null;
}
