import type { Router } from 'express';
import * as people from '../controllers/professionals.js';
import { getStaffProfile,editStaffProfile } from '../controllers/staff-profile.js';
export function professionalRoutes(business:Router,staff:Router){
  business.get('/professionals',people.listProfessionals);
  business.post('/professionals',people.saveProfessional);
  business.put('/professionals/:id',people.saveProfessional);
  business.delete('/professionals/:id',people.removeProfessional);
  business.put('/professionals/:id/account',people.saveStaff);
  business.delete('/professionals/:id/account',people.removeStaff);
  staff.get('/profile',getStaffProfile);
  staff.patch('/profile',editStaffProfile);
}
