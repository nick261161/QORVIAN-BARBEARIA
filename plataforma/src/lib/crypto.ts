import {createCipheriv,createDecipheriv,randomBytes} from 'node:crypto';

export function oauthKey(){
  const key=Buffer.from(process.env.GOOGLE_TOKEN_ENCRYPTION_KEY??'','base64');
  if(key.length!==32)throw new Error('GOOGLE_TOKEN_ENCRYPTION_KEY deve conter 32 bytes em base64.');
  return key;
}
export function encryptToken(token:string,scope:string){
  const iv=randomBytes(12);
  const cipher=createCipheriv('aes-256-gcm',oauthKey(),iv);
  cipher.setAAD(Buffer.from(scope,'utf8'));
  const ciphertext=Buffer.concat([cipher.update(token,'utf8'),cipher.final()]);
  return [iv,cipher.getAuthTag(),ciphertext].map(part=>part.toString('base64url')).join('.');
}
export function decryptToken(envelope:string,scope:string){
  const [iv,tag,ciphertext]=envelope.split('.').map(part=>Buffer.from(part,'base64url'));
  if(iv?.length!==12||tag?.length!==16||!ciphertext?.length)throw new Error('Token armazenado inválido.');
  const decipher=createDecipheriv('aes-256-gcm',oauthKey(),iv);
  decipher.setAAD(Buffer.from(scope,'utf8'));
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8');
}
