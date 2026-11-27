import type { RequestHandler } from 'express';
import multer from 'multer';
import { HttpError } from '../middlewares/error.middleware.js';
import { imageLimit,readMedia,uploadWebPBuffer } from '../../../src/lib/storage.js';

export const imageInput=multer({storage:multer.memoryStorage(),limits:{fileSize:imageLimit,files:1,fields:0,parts:2}}).single('image');

export const upload:RequestHandler=async(request,response)=>{
  if(!request.file)throw new HttpError(400,'Selecione uma imagem.');
  const {tenant}=request.scope!;
  const {actor}=request.identity!;
  const result=await uploadWebPBuffer({tenant:tenant.id,actor:actor.id,file:request.file.buffer,mime:request.file.mimetype,
    profile:request.path.endsWith('/catalog')?'catalog':'banner'});
  response.status(201).json(result);
};

export const getImage:RequestHandler=async(request,response)=>{
  const {bytes,cache}=await readMedia(String(request.params.tenant),String(request.params.file));
  response.set('Cache-Control',cache).type('webp').send(bytes);
};

