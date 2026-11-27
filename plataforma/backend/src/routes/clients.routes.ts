import type { Router } from 'express';
import { clients,clientHistory } from '../controllers/clients.js';
export function clientRoutes(business:Router){
  business.get('/clients',clients);
  business.get('/clients/:id/history',clientHistory);
}
