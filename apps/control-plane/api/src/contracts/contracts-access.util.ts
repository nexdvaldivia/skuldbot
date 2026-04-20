import { BadRequestException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { Client } from '../clients/entities/client.entity';
import { Tenant } from '../tenants/entities/tenant.entity';
import { User } from '../users/entities/user.entity';

export function resolveEffectiveClientScope(
  requestedClientId: string | undefined,
  currentUser: User,
): string | undefined {
  if (currentUser.isSkuld()) {
    return requestedClientId;
  }

  if (!currentUser.clientId) {
    throw new BadRequestException({
      code: 'CLIENT_SCOPE_REQUIRED',
      message: 'Current user is missing client scope.',
    });
  }

  if (requestedClientId && requestedClientId !== currentUser.clientId) {
    throw new BadRequestException({
      code: 'CLIENT_SCOPE_MISMATCH',
      message: `Requested client scope ${requestedClientId} is not allowed for current user.`,
    });
  }

  return currentUser.clientId;
}

export function assertClientBoundary(clientId: string, currentUser: User): void {
  if (currentUser.isSkuld()) {
    return;
  }

  if (!currentUser.clientId || currentUser.clientId !== clientId) {
    throw new BadRequestException({
      code: 'CLIENT_SCOPE_VIOLATION',
      message: `Current user cannot access resources for client ${clientId}.`,
    });
  }
}

export function normalizeCode(value: string | null | undefined): string | null {
  if (!value) {
    return null;
  }
  const normalized = value.trim().toLowerCase();
  return normalized.length > 0 ? normalized : null;
}

export function normalizeCodes(values: string[] | null | undefined): string[] {
  if (!Array.isArray(values)) {
    return [];
  }

  const normalized = values
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);

  return Array.from(new Set(normalized));
}

export async function ensureClientExists(
  clientRepository: Repository<Client>,
  clientId: string,
): Promise<void> {
  const exists = await clientRepository.exist({ where: { id: clientId } });
  if (!exists) {
    throw new BadRequestException({
      code: 'CLIENT_NOT_FOUND',
      message: `Client ${clientId} does not exist.`,
    });
  }
}

export async function ensureTenantBelongsToClient(
  tenantRepository: Repository<Tenant>,
  tenantId: string | undefined,
  clientId: string,
): Promise<void> {
  if (!tenantId) {
    return;
  }

  const tenant = await tenantRepository.findOne({ where: { id: tenantId } });
  if (!tenant) {
    throw new BadRequestException({
      code: 'TENANT_NOT_FOUND',
      message: `Tenant ${tenantId} does not exist.`,
    });
  }

  if (tenant.clientId !== clientId) {
    throw new BadRequestException({
      code: 'TENANT_CLIENT_MISMATCH',
      message: `Tenant ${tenantId} is not owned by client ${clientId}.`,
    });
  }
}
