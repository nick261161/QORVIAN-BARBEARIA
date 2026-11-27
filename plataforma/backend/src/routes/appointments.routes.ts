import type { Router } from 'express';
import * as agenda from '../controllers/appointments.js';
import { requireAuth,requireRole } from '../middlewares/auth.middleware.js';
import { requireFeature } from '../middlewares/feature.middleware.js';
export function appointmentRoutes(api:Router,customer:Router,business:Router,staff:Router){
  api.get('/public/:slug',agenda.store);
  api.get('/public/:slug/available-slots',agenda.availability());
  api.post('/appointments',requireAuth,requireRole('CLIENT'),agenda.makeBooking);
  customer.get('/appointments',agenda.clientAgenda);
  customer.post('/appointments/:id/cancel',requireFeature('enable_client_cancellation'),agenda.clientCancel);
  business.get('/agenda',agenda.ownerAgenda);
  business.get('/available-slots',requireFeature('enable_manual_booking'),agenda.availability(true));
  business.post('/agenda',requireFeature('enable_manual_booking'),agenda.makeManualBooking);
  business.patch('/agenda/:id',agenda.ownerStatus);
  staff.get('/agenda',agenda.ownerAgenda);
  staff.patch('/agenda/:id',agenda.ownerStatus);
}
