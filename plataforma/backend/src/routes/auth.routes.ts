import type { RequestHandler, Router } from 'express';
import * as auth from '../controllers/auth.js';
import { exitSupport } from '../controllers/platform.js';
import { requireAuth } from '../middlewares/auth.middleware.js';

export function authRoutes(api:Router,customer:Router,limiter:RequestHandler){
  api.post('/auth/login',limiter,auth.signIn);
  api.post('/auth/:slug/login',limiter,auth.signIn);
  api.post('/auth/:slug/register',limiter,auth.signUp);
  api.get('/auth/session',requireAuth,auth.session);
  api.post('/auth/logout',auth.signOut);
  api.post('/auth/exit-support',requireAuth,exitSupport);
  customer.patch('/profile',auth.editProfile);
}
