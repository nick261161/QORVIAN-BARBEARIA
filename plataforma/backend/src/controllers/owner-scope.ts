import type { Request } from 'express';
import type { Feature } from '../../../shared/features.js';
import { assertFeature,scopedTenant } from '../services/tenant.service.js';
import { transaction,type Db } from '../config/database.js';
import { HttpError } from '../middlewares/error.middleware.js';

export function write<T>(request: Request, run: (db: Db, scope: Awaited<ReturnType<typeof scopedTenant>>) => Promise<T>, feature?: Feature) {
  return transaction(async db => {
    const scope = await scopedTenant(db, request.scope!.tenant.id, true, request.identity!.impersonating);
    if (feature) assertFeature(scope.flags, feature);
    return run(db, scope);
  });
}

export function exists<T>(value: T | undefined, message = 'Registro não encontrado.'): T {
  if (!value) throw new HttpError(404, message);
  return value;
}
