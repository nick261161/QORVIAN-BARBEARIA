import type { RequestHandler } from 'express';
import { one,pool } from '../config/database.js';
import { id,category } from '../schemas/index.js';
import { exists,write } from './owner-scope.js';
import { catalog } from './catalog.js';

export const serviceCatalog=catalog('services');

export const listCategories: RequestHandler = async (request,response) => {
  response.json((await pool.query('SELECT id,name FROM service_categories WHERE tenant_id=$1 ORDER BY name',[request.scope!.tenant.id])).rows);
};

export const saveCategory: RequestHandler = async (request,response) => {
  const {name}=category.parse(request.body);
  const code=request.params.id?id.parse(request.params.id):null;
  const row=await write(request,async(db,{tenant})=>{
    if (!code) return one(db,'INSERT INTO service_categories(tenant_id,name) VALUES($1,$2) RETURNING id,name',[tenant.id,name]);
    const previous=exists(await one<{name:string}>(db,'SELECT name FROM service_categories WHERE tenant_id=$1 AND id=$2',[tenant.id,code]));
    const updated=await one(db,'UPDATE service_categories SET name=$3 WHERE tenant_id=$1 AND id=$2 RETURNING id,name',[tenant.id,code,name]);
    await db.query('UPDATE services SET category=$3 WHERE tenant_id=$1 AND category=$2',[tenant.id,previous.name,name]);
    return updated;
  });
  response.status(code?200:201).json(row);
};

export const removeCategory: RequestHandler = async (request,response) => {
  await write(request,async(db,{tenant})=>{
    const row=exists(await one<{name:string}>(db,'DELETE FROM service_categories WHERE tenant_id=$1 AND id=$2 RETURNING name',[tenant.id,id.parse(request.params.id)]));
    await db.query("UPDATE services SET category='' WHERE tenant_id=$1 AND category=$2",[tenant.id,row.name]);
  });
  response.status(204).end();
};
