import type { Router } from 'express';
import { serviceCatalog,listCategories,saveCategory,removeCategory } from '../controllers/services.js';
export function servicesRoutes(business:Router){
  business.get('/services',serviceCatalog.list);
  business.post('/services',serviceCatalog.save);
  business.put('/services/:id',serviceCatalog.save);
  business.delete('/services/:id',serviceCatalog.remove);
  business.get('/categories',listCategories);
  business.post('/categories',saveCategory);
  business.put('/categories/:id',saveCategory);
  business.delete('/categories/:id',removeCategory);
}
