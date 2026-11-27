import type { RequestHandler } from 'express';
import type { Feature } from '../../../shared/features.js';
import { assertFeature } from '../services/tenant.service.js';
import { HttpError } from './error.middleware.js';

export function requireFeature(flag:Feature):RequestHandler{
  return (request,_response,next)=>{
    if(!request.scope)throw new HttpError(403,'Estabelecimento não definido.');
    assertFeature(request.scope.flags,flag);
    next();
  };
}
