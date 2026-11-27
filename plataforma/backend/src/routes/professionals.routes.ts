import type { Router } from 'express';
import * as people from '../controllers/professionals.js';
import { getStaffProfile,editStaffProfile,getOwnerProfile,editOwnerProfile } from '../controllers/staff-profile.js';
export function professionalRoutes(business:Router,staff:Router){
  business.get('/profile',getOwnerProfile);
  business.patch('/profile',editOwnerProfile);
  business.get('/professionals',people.listProfessionals);
  business.post('/professionals',people.saveProfessional);
  business.put('/professionals/:id',people.saveProfessional);
  business.delete('/professionals/:id',people.removeProfessional);
  business.put('/professionals/:id/account',people.saveStaff);
  business.delete('/professionals/:id/account',people.removeStaff);
  staff.get('/profile',getStaffProfile);
  staff.patch('/profile',editStaffProfile);
}
