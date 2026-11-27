import type { Router } from 'express';
import { commissions,report } from '../controllers/reports.js';
import { staffReport } from '../controllers/staff-profile.js';
import { requireFeature } from '../middlewares/feature.middleware.js';
export function reportRoutes(business:Router,staff:Router){
  business.get('/reports',requireFeature('enable_reports'),report);
  business.get('/commissions',requireFeature('enable_commissions'),commissions);
  staff.get('/reports',requireFeature('enable_reports'),staffReport);
}
