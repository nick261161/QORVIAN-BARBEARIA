import {createHmac,randomInt,randomUUID,timingSafeEqual} from 'node:crypto';
import bcrypt from 'bcryptjs';
import {config} from '../../backend/src/config/env.js';
import {HttpError} from '../../backend/src/middlewares/error.middleware.js';
import {one,pool,transaction} from '../lib/db.js';

type Input={phone:string;slug?:string};
type Candidate={id:string;role:string;token_version:number;available:boolean};
type SendCode=(phone:string,code:string)=>Promise<void>;
const restricted='Contas empresariais não podem redefinir a senha pelo telefone. Contate o suporte.';
const hash=(id:string,code:string)=>createHmac('sha256',config.JWT_SECRET).update(`password-reset:${id}:${code}`).digest('hex');

async function candidates({phone,slug}:Input){
  const {rows}=await pool.query<Candidate>(`SELECT u.id,u.role,u.token_version,
    (u.active AND NOT u.platform_blocked AND t.status='ATIVO' AND (u.role<>'STAFF' OR EXISTS(
      SELECT 1 FROM professionals p WHERE p.tenant_id=u.tenant_id AND p.id=u.professional_id AND p.active AND p.deleted_at IS NULL
    ))) AS available
    FROM users u LEFT JOIN tenants t ON t.id=u.tenant_id WHERE u.phone=$1 AND ($2::text IS NULL OR t.slug=$2 OR u.role='SUPER_ADMIN')`,
  [phone,slug??null]);
  if(rows.some(row=>['OWNER','SUPER_ADMIN'].includes(row.role)))throw new HttpError(403,restricted);
  return rows.filter(row=>row.available);
}

function smsProvider():SendCode{
  const {PASSWORD_RESET_SMS_URL:url,PASSWORD_RESET_SMS_TOKEN:token}=process.env;
  if(!url||!token||!URL.canParse(url)||new URL(url).protocol!=='https:')throw new HttpError(503,'A recuperação por SMS está indisponível. Contate o suporte.');
  return async(phone,code)=>{
    const delivery=await fetch(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(7000),
      headers:{Authorization:'Bearer '+token,'Content-Type':'application/json'},
      body:JSON.stringify({to:phone,message:`Seu código de redefinição da Agenda é ${code}. Expira em 10 minutos.`})});
    if(!delivery.ok)throw new Error('SMS_DELIVERY_FAILED');
  };
}

export async function issuePhoneCode(input:Input,send?:SendCode){
  const matches=await candidates(input);
  const deliver=send??smsProvider();
  if(matches.length>1)throw new HttpError(409,'Informe o estabelecimento para encontrar a conta.');
  const account=matches[0];
  const challenge=randomUUID();
  if(!account)return {challenge};
  const code=String(randomInt(1000000)).padStart(6,'0');
  const created=await transaction(async db=>{
    const current=await one(db,`SELECT id FROM users WHERE id=$1 AND phone=$2 AND active AND NOT platform_blocked
      AND role IN ('STAFF','CLIENT') AND token_version=$3 FOR UPDATE`,[account.id,input.phone,account.token_version]);
    if(!current)return;
    return one<{id:string}>(db,`INSERT INTO password_reset_tokens(id,user_id,otp_hash,expires_at,token_version)
      VALUES($1,$2,$3,now()+interval '10 minutes',$4)
      ON CONFLICT(user_id) DO UPDATE SET id=EXCLUDED.id,otp_hash=EXCLUDED.otp_hash,issued_at=now(),
        expires_at=EXCLUDED.expires_at,token_version=EXCLUDED.token_version,attempts=0,used_at=NULL
      WHERE password_reset_tokens.issued_at<=now()-interval '1 minute' RETURNING id`,
    [challenge,account.id,hash(challenge,code),account.token_version]);
  });
  if(!created)throw new HttpError(429,'Aguarde um minuto antes de pedir outro código.');
  try{await deliver(input.phone,code);}
  catch{
    await pool.query('DELETE FROM password_reset_tokens WHERE id=$1',[challenge]);
    throw new HttpError(503,'Não foi possível enviar o SMS. Tente novamente.');
  }
  return {challenge};
}

export async function resetPhonePassword(input:Input&{challenge:string;code:string;password:string}){
  const matches=await candidates(input);
  const account=matches.find(row=>row.available);
  const rejected=()=>new HttpError(400,'Código inválido, expirado ou já utilizado.');
  if(!account||matches.length!==1)throw rejected();
  const accepted=await transaction(async db=>{
    const user=await one<{token_version:number}>(db,`SELECT token_version FROM users WHERE id=$1 AND phone=$2
      AND active AND NOT platform_blocked AND role IN ('STAFF','CLIENT') FOR UPDATE`,[account.id,input.phone]);
    if(!user)return false;
    const token=await one<{otp_hash:string}>(db,`SELECT otp_hash FROM password_reset_tokens WHERE id=$1 AND user_id=$2
      AND expires_at>now() AND used_at IS NULL AND attempts<5 AND token_version=$3 FOR UPDATE`,[input.challenge,account.id,user.token_version]);
    if(!token)return false;
    if(!timingSafeEqual(Buffer.from(token.otp_hash,'hex'),Buffer.from(hash(input.challenge,input.code),'hex'))){
      await db.query('UPDATE password_reset_tokens SET attempts=attempts+1 WHERE id=$1',[input.challenge]);return false;
    }
    await db.query('UPDATE users SET password_hash=$2,token_version=token_version+1 WHERE id=$1',[account.id,await bcrypt.hash(input.password,12)]);
    await db.query('UPDATE password_reset_tokens SET used_at=now() WHERE id=$1',[input.challenge]);
    return true;
  });
  if(!accepted)throw rejected();
}
