import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import cookieParser from 'cookie-parser';
import express from 'express';
import { rateLimit } from 'express-rate-limit';
import helmet from 'helmet';
import { api } from './routes/index.js';
import { config } from './config/env.js';
import { errors, HttpError } from './middlewares/error.middleware.js';
import { getImage } from './controllers/media.js';

export const app = express();
app.disable('x-powered-by');
if (config.TRUST_PROXY_HOPS) app.set('trust proxy', config.TRUST_PROXY_HOPS);
app.use(helmet({ contentSecurityPolicy: { directives: { imgSrc: ["'self'", 'https:'],
  upgradeInsecureRequests: config.secure ? [] : null } }, strictTransportSecurity: config.secure }));
app.use('/api', (_request, response, next) => { response.set('Cache-Control', 'no-store'); next(); });
app.use('/api',(request,response,next)=>{
  const origin=request.get('origin');
  response.vary('Origin');
  if(origin&&config.origins.has(origin)){
    response.set({'Access-Control-Allow-Origin':origin,'Access-Control-Allow-Credentials':'true','Access-Control-Allow-Methods':'GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS','Access-Control-Allow-Headers':'Content-Type'});
  }
  if(request.method==='OPTIONS'){
    response.status(origin&&config.origins.has(origin)?204:403).end();return;
  }
  next();
});
app.use('/api', rateLimit({ windowMs: 60000, limit: 250, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Limite temporário de requisições.' } }));
app.use('/api', express.json({ limit: '80kb' }), cookieParser(), (request, _response, next) => {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
    const origin = request.get('origin');
    const relation = request.get('sec-fetch-site');
    if ((origin && !config.origins.has(origin)) || relation === 'cross-site' || (request.get('cookie') && !origin && relation !== 'same-origin')) {
      next(new HttpError(403, 'Origem da requisição não autorizada.')); return;
    }
  }
  next();
}, api);
app.get('/media/:tenant/:file',getImage);
const assets = resolve('dist');
if (existsSync(resolve(assets, 'index.html'))) {
  app.use(express.static(assets, { maxAge: config.secure ? '1h' : 0, index: false }));
  app.get('/{*path}', (_request, response) => { response.sendFile(resolve(assets, 'index.html'), { maxAge: 0 }); });
}
app.use(errors);
