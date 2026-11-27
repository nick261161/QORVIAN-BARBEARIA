import type { ErrorRequestHandler } from 'express';
import { ZodError } from 'zod';

export class HttpError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

export function sqlCode(error: unknown) {
  return typeof error === 'object' && error !== null && 'code' in error ? error.code : undefined;
}

export const errors: ErrorRequestHandler = (error, _request, response, next) => {
  if (response.headersSent) { next(error); return; }
  if (error instanceof HttpError) { response.status(error.status).json({ error: error.message }); return; }
  if (error instanceof ZodError) {
    response.status(400).json({ error: 'Confira os dados informados.', fields: error.issues.map(issue => ({ field: issue.path.join('.'), message: issue.message })) });
    return;
  }
  if (sqlCode(error) === '23P01') { response.status(409).json({ error: 'O horário já está ocupado.' }); return; }
  if (sqlCode(error) === '23505') { response.status(409).json({ error: 'Já existe um registro com esses dados.' }); return; }
  if (['23503','23001'].some(code=>sqlCode(error)===code)) { response.status(409).json({ error: 'O registro está vinculado a outros dados.' }); return; }
  if (error?.name === 'MulterError') { response.status(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400).json({error:'Envie apenas uma imagem de até 8 MB.'}); return; }
  if (error?.type === 'entity.parse.failed' || error?.type === 'entity.too.large') {
    response.status(error.status).json({ error: 'Corpo da requisição inválido.' }); return;
  }
  console.error('API error', error?.code ?? error?.name ?? 'unknown');
  response.status(500).json({ error: 'Não foi possível concluir a operação.' });
};
