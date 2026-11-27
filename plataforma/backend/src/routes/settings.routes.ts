import type { Router } from 'express';
import * as owner from '../controllers/settings.js';
import * as platform from '../controllers/platform.js';
import { requireFeature } from '../middlewares/feature.middleware.js';
import { presentTenant } from '../services/tenant.service.js';

export function settingsRoutes(business:Router,master:Router,staff:Router){
  business.get('/',owner.overview);
  business.get('/hours',owner.listHours);
  business.put('/hours',owner.saveHours);
  business.post('/blocks',owner.saveBlock);
  business.delete('/blocks/:id',owner.removeBlock);
  business.put('/site',requireFeature('enable_site_customizer'),owner.saveSite);
  business.patch('/policy',owner.savePolicy);
  business.patch('/confirmation',owner.saveConfirmation);
  staff.get('/',async(request,response)=>{
    const {tenant,flags}=request.scope!;
    response.json({tenant:presentTenant(tenant),confirmation_message_template:await owner.confirmationTemplate(tenant.id),
      flags:{enable_reports:flags.enable_reports,enable_google_calendar:flags.enable_google_calendar,
        enable_manual_whatsapp_confirmation:flags.enable_manual_whatsapp_confirmation}});
  });
  master.get('/',platform.platformDashboard);
  master.patch('/controls',platform.setGlobal);
  master.post('/tenants',platform.createTenant);
  master.patch('/tenants/:id',platform.setTenantControls);
  master.post('/tenants/:id/support',platform.support);
}
