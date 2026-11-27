import type { Router } from 'express';
import { createOrder,listOrders,finishOrder } from '../controllers/cart-orders.js';
import { requireFeature } from '../middlewares/feature.middleware.js';
export function orderRoutes(customer:Router,business:Router){
  customer.get('/orders',listOrders());
  customer.post('/orders',requireFeature('enable_products_store'),requireFeature('enable_shopping_cart'),createOrder);
  business.get('/orders',listOrders(true));
  business.patch('/orders/:id',finishOrder);
}
