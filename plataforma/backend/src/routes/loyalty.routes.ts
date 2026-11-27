import type { Router } from 'express';
import * as loyalty from '../controllers/loyalty.js';
import { requireFeature } from '../middlewares/feature.middleware.js';
export function loyaltyRoutes(customer:Router,business:Router){
  const enabled=requireFeature('enable_loyalty_club');
  customer.get('/loyalty',enabled,loyalty.wallet());
  business.get('/loyalty',enabled,loyalty.getLoyalty);
  business.put('/loyalty',enabled,loyalty.setLoyalty);
  business.get('/clients/:id/loyalty',enabled,loyalty.wallet(true));
  business.post('/clients/:id/loyalty/adjust',enabled,loyalty.adjust());
  business.post('/clients/:id/loyalty/redeem',enabled,loyalty.adjust(true));
}
