import { NotFoundException } from '@nestjs/common';
import { FindOneOptions, FindOptionsWhere, ObjectLiteral, Repository } from 'typeorm';

export async function requireEntity<T extends ObjectLiteral>(
  repo: Repository<T>,
  where: FindOptionsWhere<T>,
  entityName: string,
  options?: Omit<FindOneOptions<T>, 'where'>,
): Promise<T> {
  const entity = await repo.findOne({
    ...(options ?? {}),
    where,
  });
  if (!entity) {
    throw new NotFoundException(`${entityName} not found`);
  }
  return entity;
}
