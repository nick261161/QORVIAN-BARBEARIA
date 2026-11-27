import type { RequestHandler } from 'express';
import { one,pool } from '../config/database.js';
import { id,category,categoryType } from '../schemas/index.js';
import {HttpError} from '../middlewares/error.middleware.js';
import {assertFeature} from '../services/tenant.service.js';
import { exists,write } from './owner-scope.js';
import { catalog } from './catalog.js';

export const serviceCatalog=catalog('services');

export const listCategories: RequestHandler = async (request,response) => {
  const type=categoryType.default('SERVICE').parse(request.query.type);
  const {tenant,flags}=request.scope!;
  if(type==='PRODUCT')assertFeature(flags,'enable_products_store');
  response.json((await pool.query('SELECT id,name,type,is_active FROM categories WHERE tenant_id=$1 AND type=$2 ORDER BY lower(name),id',[tenant.id,type])).rows);
};

export const saveCategory: RequestHandler = async (request,response) => {
  const {name,type}=category.parse(request.body);
  const code=request.params.id?id.parse(request.params.id):null;
  const row=await write(request,async(db,{tenant,flags})=>{
    if(type==='PRODUCT')assertFeature(flags,'enable_products_store');
    if (!code) return one(db,'INSERT INTO categories(tenant_id,name,type) VALUES($1,$2,$3) RETURNING id,name,type,is_active',[tenant.id,name,type]);
    const updated=exists(await one(db,'UPDATE categories SET name=$3 WHERE tenant_id=$1 AND id=$2 AND type=$4 RETURNING id,name,type,is_active',[tenant.id,code,name,type]));
    const table=type==='PRODUCT'?'products':'services';
    await db.query(`UPDATE ${table} SET category=$3 WHERE tenant_id=$1 AND category_id=$2`,[tenant.id,code,name]);
    return updated;
  });
  response.status(code?200:201).json(row);
};

export const removeCategory: RequestHandler = async (request,response) => {
  const type=categoryType.default('SERVICE').parse(request.query.type);
  await write(request,async(db,{tenant,flags})=>{
    if(type==='PRODUCT')assertFeature(flags,'enable_products_store');
    if(!await one(db,'DELETE FROM categories WHERE tenant_id=$1 AND id=$2 AND type=$3 RETURNING id',[tenant.id,id.parse(request.params.id),type]))
      throw new HttpError(404,'Categoria não encontrada.');
  });
  response.status(204).end();
};
