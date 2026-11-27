import type { Router } from 'express';
import { productCatalog } from '../controllers/products.js';
import { requireFeature } from '../middlewares/feature.middleware.js';
export function productsRoutes(business:Router){
  business.use('/products',requireFeature('enable_products_store'));
  business.get('/products',productCatalog.list);
  business.post('/products',productCatalog.save);
  business.put('/products/:id',productCatalog.save);
  business.delete('/products/:id',productCatalog.remove);
}
