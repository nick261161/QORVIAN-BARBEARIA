import 'dotenv/config';
import assert from 'node:assert/strict';
import { randomBytes,randomUUID } from 'node:crypto';
import { once } from 'node:events';
import { mkdtemp,readFile,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import pg from 'pg';

test('Fluxos da agenda com PostgreSQL real', async t => {
  const url = new URL(process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? '');
  assert.ok(['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname), 'Use um PostgreSQL local para os testes.');
  const database = `agenda_test_${randomBytes(8).toString('hex')}`;
  const admin = new pg.Client({ connectionString: url.toString() });
  await admin.connect();
  let pool, server, created = false;
  t.after(async () => {
    try {
      if (server?.listening) await new Promise(resolve => server.close(resolve));
      if (pool) await pool.end();
      if (created) await admin.query(`DROP DATABASE ${database}`);
    }
    finally { await admin.end(); }
  });
  await admin.query(`CREATE DATABASE ${database}`);
  created = true;
  url.pathname = `/${database}`;
  process.env.DATABASE_URL = url.toString();
  process.env.NODE_ENV = 'test';
  process.env.JWT_SECRET = randomBytes(48).toString('hex');
  const mediaDir=await mkdtemp(join(tmpdir(),'agenda-test-media-'));
  process.env.MEDIA_DRIVER='local';process.env.MEDIA_DIR=mediaDir;
  t.after(()=>rm(mediaDir,{recursive:true,force:true}));

  ({ pool } = await import('../dist-server/backend/src/config/database.js'));
  await pool.query(await readFile('database/schema.sql', 'utf8'));
  await pool.query(await readFile('database/seed.sql', 'utf8'));
  const { app } = await import('../dist-server/backend/src/app.js');
  server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}/api`;
  const origin = (process.env.APP_ORIGINS ?? 'http://127.0.0.1:5173').split(',')[0].trim();
  async function request(path, status, { method = 'GET', cookie, body } = {}) {
    const response = await fetch(`${base}${path}`, { method, headers: { Origin: origin, ...(cookie ? { Cookie: cookie } : {}), ...(body ? { 'Content-Type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const data = response.status === 204 ? undefined : await response.json();
    assert.equal(response.status, status, `${method} ${path}: ${JSON.stringify(data)}`);
    return { data, cookie: response.headers.get('set-cookie')?.split(';', 1)[0] };
  }

  const slug = 'navalha-e-cia';
  const business = `/owner/${slug}`;
  const storefront = `/public/${slug}`;
  const demo = 'DemoAgenda!2026';
  const { data: store } = await request(storefront, 200);
  const tenant = store.tenant.id;
  const professional_id = store.professionals[0].id;
  const service_ids = [store.services.find(item => item.name === 'Corte clássico').id];
  const date = new Date(Date.now() + 8 * 86400000);
  while (date.getUTCDay() !== 2) date.setUTCDate(date.getUTCDate() + 1);
  const day = date.toISOString().slice(0, 10);
  const slots = `${storefront}/available-slots?${new URLSearchParams({ date: day, professional_id, service_ids: service_ids.join(',') })}`;
  const { cookie: owner } = await request(`/auth/${slug}/login`, 200, { method: 'POST', body: { phone: '(85) 90000-0002', password: demo } });
  const { cookie:staff }=await request(`/auth/${slug}/login`,200,{method:'POST',body:{phone:'(85) 90000-0003',password:demo}});
  let { cookie: master } = await request('/auth/login', 200, { method: 'POST', body: { phone: '(85) 90000-0001', password: demo } });
  async function client(phone, name) { return (await request(`/auth/${slug}/register`, 201, { method: 'POST', body: { phone, name, password: demo } })).cookie; }
  const first = await client('(85) 90000-0021', 'Cliente de teste A');
  const second = await client('(85) 90000-0022', 'Cliente de teste B');

  await t.test('papéis, escopo do estabelecimento e cadastro master', async () => {
    await request(business, 403, { cookie: first });
    await request('/master', 403, { cookie: owner });
    await request('/master/tenants', 201, { method: 'POST', cookie: master, body: { slug: 'salao-teste', name: 'Salão de Teste', kind: 'SALAO', timezone: 'America/Fortaleza', owner: { name: 'Dona do salão', phone: '(85) 90000-0023', password: demo } } });
    await request('/owner/salao-teste', 404, { cookie: owner });
    await request('/client/salao-teste/appointments', 404, { cookie: first });
    const { data } = await request('/public/salao-teste', 200);
    assert.equal(data.services.length, 0);
  });

  await t.test('disponibilidade considera escala, intervalo e bloqueios', async () => {
    const rule = { weekday: 2, closed: false, opens_at: '10:00', closes_at: '16:00', break_start: '14:00', break_end: '14:30' };
    await request(`${business}/hours`, 204, { method: 'PUT', cookie: owner, body: { professional_id, days: [rule] } });
    const { data: blocked } = await request(`${business}/blocks`, 201, { method: 'POST', cookie: owner, body: {
      professional_id, starts_at: `${day}T16:00:00Z`, ends_at: `${day}T16:30:00Z`, reason: 'Bloqueio de teste',
    } });
    const { data } = await request(slots, 200);
    assert.equal(data.starts[0], `${day}T13:00:00.000Z`);
    for (const hour of ['15:00', '16:00', '17:00', '19:00']) assert.ok(!data.starts.includes(`${day}T${hour}:00.000Z`));
    await request(`${business}/blocks/${blocked.id}`, 204, { method: 'DELETE', cookie: owner });
  });

  await t.test('reserva simultânea, histórico, cancelamento e encaixe', async () => {
    const { data } = await request(slots, 200);
    const starts_at = data.starts[0];
    const booking = { slug, starts_at, professional_id, service_ids };
    const attempts = await Promise.all([first, second].map(cookie => fetch(`${base}/appointments`, {
      method: 'POST', headers: { Origin: origin, Cookie: cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(booking),
    })));
    assert.deepEqual(attempts.map(item => item.status).sort(), [201, 409]);
    const winnerIndex = attempts.findIndex(item => item.status === 201);
    const record = await attempts[winnerIndex].json();
    const winner = [first, second][winnerIndex];
    const loser = [first, second][1 - winnerIndex];
    const { data: fresh } = await request(slots, 200);
    assert.equal(fresh.starts.includes(starts_at), false);
    assert.equal(fresh.starts.includes(data.starts[1]), false);
    await request(`/client/${slug}/appointments/${record.id}/cancel`, 404, { method: 'POST', cookie: loser });
    await request(`${business}/blocks`, 409, { method: 'POST', cookie: owner, body: { professional_id, starts_at, ends_at: record.ends_at, reason: 'Conflito' } });
    await request(`${business}/agenda/${record.id}`, 200, { method: 'PATCH', cookie: owner, body: { status: 'CONFIRMADO' } });
    const { data: mine } = await request(`/client/${slug}/appointments`, 200, { cookie: winner });
    assert.equal(mine.items[0].id, record.id);
    await request(`/client/${slug}/appointments/${record.id}/cancel`, 200, { method: 'POST', cookie: winner });
    const { data: manual } = await request(`${business}/agenda`, 201, { method: 'POST', cookie: owner, body: { starts_at, professional_id, service_ids, client_name: 'Cliente do balcão', client_phone: '(85) 90000-0024' } });
    assert.equal(manual.status, 'CONFIRMADO');
    const { data: report } = await request(`${business}/reports?from=${day}&to=${day}`, 200, { cookie: owner });
    assert.equal(report.occupied_minutes, 40);
    assert.equal(report.estimated_cents, 5500);
  });

  await t.test('flags, limite e suporte com retorno ao master', async () => {
    await request(`/master/tenants/${tenant}`, 200, { method: 'PATCH', cookie: master, body: { feature_flags: { enable_products_store: false, enable_online_booking: false }, max_professionals: 2 } });
    const { data } = await request(storefront, 200);
    assert.equal(data.flags.enable_online_booking, false);
    assert.deepEqual(data.products, []);
    await request(slots, 403);
    await request(`${business}/products`, 403, { cookie: owner });
    await request(`${business}/professionals`, 409, { method: 'POST', cookie: owner, body: { name: 'Profissional extra', photo: '', active: true, service_ids } });
    const { cookie: support } = await request(`/master/tenants/${tenant}/support`, 200, { method: 'POST', cookie: master });
    await request(business, 200, { cookie: support });
    await request('/master', 403, { cookie: support });
    await request('/owner/salao-teste', 404, { cookie: support });
    ({ cookie: master } = await request('/auth/exit-support', 204, { method: 'POST', cookie: support }));
    await request('/master', 200, { cookie: master });
    const audit = await pool.query("SELECT event FROM audit_events WHERE event IN ('SUPPORT_STARTED','SUPPORT_ENDED') ORDER BY created_at");
    assert.deepEqual(audit.rows.map(row => row.event), ['SUPPORT_STARTED', 'SUPPORT_ENDED']);
  });

  await t.test('catálogo, perfil e personalização com validação', async () => {
    const service = { name: 'Hidratação', description: 'Hidratação de teste', category: 'Tratamentos', photo: '', price_cents: 9200, duration_minutes: 45, active: true };
    const { data: item } = await request(`${business}/services`, 201, { method: 'POST', cookie: owner, body: service });
    await request(`${business}/services/${item.id}`, 200, { method: 'PUT', cookie: owner, body: { ...service, price_cents: 9500 } });
    const { data: listed } = await request(storefront, 200);
    assert.equal(listed.services.find(service => service.id === item.id).price_cents, 9500);
    await request(`${business}/services/${item.id}`, 204, { method: 'DELETE', cookie: owner });

    const site = { ...store.tenant.site, name: store.tenant.name, headline: 'Seu próximo corte', sections: { ...store.tenant.site.sections, team: false } };
    await request(`${business}/site`, 400, { method: 'PUT', cookie: owner, body: { ...site, bio: '<b>Texto</b>' } });
    await request(`${business}/site`, 200, { method: 'PUT', cookie: owner, body: site });
    await request(`${business}/policy`, 204, { method: 'PATCH', cookie: owner, body: { cancellation_minutes: 180 } });
    const { data: styled } = await request(storefront, 200);
    assert.equal(styled.tenant.site.headline, 'Seu próximo corte');
    assert.equal(styled.tenant.site.sections.team, false);
    assert.equal(styled.tenant.cancellation_minutes, 180);

    const { data: profile } = await request(`/client/${slug}/profile`, 200, { method: 'PATCH', cookie: first, body: { name: 'Perfil atualizado', phone: '(85) 90000-0025' } });
    assert.equal(profile.name, 'Perfil atualizado');
    assert.equal(profile.phone, '+5585900000025');
  });

  await t.test('compras simultâneas, reenvio e devolução de estoque',async()=>{
    await request(`/master/tenants/${tenant}`,200,{method:'PATCH',cookie:master,body:{feature_flags:{enable_products_store:true}}});
    const product=store.products[0];
    const endpoint=`/client/${slug}/orders`;
    const body={modality:'RETIRADA_NO_LOCAL',items:[{product_id:product.id,quantity:product.stock_quantity}],request_key:randomUUID()};
    const attempts=await Promise.all([first,second].map(cookie=>fetch(`${base}${endpoint}`,{method:'POST',headers:{Origin:origin,Cookie:cookie,'Content-Type':'application/json'},body:JSON.stringify(body)})));
    assert.deepEqual(attempts.map(item=>item.status).sort(),[201,409]);
    const index=attempts.findIndex(item=>item.status===201);
    const accepted=await attempts[index].json();
    const {data:repeat}=await request(endpoint,201,{method:'POST',cookie:[first,second][index],body});
    assert.equal(repeat.id,accepted.id);
    const {data:empty}=await request(storefront,200);
    assert.equal(empty.products.find(item=>item.id===product.id).stock_quantity,0);
    await request(`${business}/orders/${accepted.id}`,200,{method:'PATCH',cookie:owner,body:{status:'CANCELADO'}});
    await request(`${business}/orders/${accepted.id}`,200,{method:'PATCH',cookie:owner,body:{status:'CANCELADO'}});
    const {data:restored}=await request(storefront,200);
    assert.equal(restored.products.find(item=>item.id===product.id).stock_quantity,product.stock_quantity);
  });

  await t.test('equipe isolada, conclusão, comissões e resgate auditável',async()=>{
    const {data:config}=await request(`${business}/loyalty`,200,{cookie:owner});
    const {reward:_reward,...policy}=config;
    await request(`${business}/loyalty`,204,{method:'PUT',cookie:owner,body:{...policy,include_products:true,target_value:2,points_expiration_days:5}});
    const {data:people}=await request(`${business}/professionals`,200,{cookie:owner});
    const assigned=people.find(item=>item.id===professional_id);
    const other=people.find(item=>item.id!==professional_id);
    await request(`${business}/professionals/${professional_id}`,200,{method:'PUT',cookie:owner,
      body:{name:assigned.name,photo:assigned.photo,active:assigned.active,service_ids:assigned.service_ids,default_service_commission:2000,default_product_commission:1000}});
    const {data:actor}=await request('/auth/session',200,{cookie:first});
    const today=new Intl.DateTimeFormat('sv-SE',{timeZone:store.tenant.timezone,year:'numeric',month:'2-digit',day:'2-digit'}).format();
    const rows=[];
    for(const person of [professional_id,other.id]){
      rows.push((await pool.query(`INSERT INTO appointments (tenant_id,professional_id,client_id,client_name,client_phone,source,status,starts_at,ends_at,total_cents,line_items)
       VALUES ($1,$2,$3,'Pessoa teste',$4,'MANUAL','CONFIRMADO',now()-interval '2 hours',now()-interval '1 hour',5500,$5::jsonb) RETURNING id`,
       [tenant,person,actor.id,actor.phone,JSON.stringify([{id:service_ids[0],name:'Corte clássico',price_cents:5500,duration_minutes:40}])])).rows[0]);
    }
    await request(business,403,{cookie:staff});
    const {data:partial}=await request(`/staff/${slug}/agenda?from=${today}&to=${today}&professional_id=${other.id}`,200,{cookie:staff});
    assert.ok(partial.items.every(item=>item.professional_id===professional_id));
    await request(`/staff/${slug}/agenda/${rows[1].id}`,404,{method:'PATCH',cookie:staff,body:{status:'CONCLUIDO'}});
    await request(`/staff/${slug}/agenda/${rows[0].id}`,403,{method:'PATCH',cookie:staff,body:{status:'EM_ATENDIMENTO'}});
    await request(`${business}/agenda/${rows[0].id}`,200,{method:'PATCH',cookie:owner,body:{status:'EM_ATENDIMENTO'}});
    await request(`/staff/${slug}/agenda/${rows[0].id}`,200,{method:'PATCH',cookie:staff,body:{status:'CONCLUIDO'}});
    await request(`/staff/${slug}/agenda/${rows[0].id}`,200,{method:'PATCH',cookie:staff,body:{status:'CONCLUIDO'}});
    const {data:order}=await request(`/client/${slug}/orders`,201,{method:'POST',cookie:first,body:{modality:'ENTREGA',delivery_address:'Endereço fictício para teste',items:[{product_id:store.products[0].id,quantity:2}]}});
    await request(`${business}/orders/${order.id}`,200,{method:'PATCH',cookie:owner,body:{status:'CONCLUIDO',professional_id}});
    await request(`${business}/professionals/${professional_id}`,200,{method:'PUT',cookie:owner,
      body:{name:assigned.name,photo:assigned.photo,active:assigned.active,service_ids:assigned.service_ids,default_service_commission:5000}});
    const {data:paid}=await request(`${business}/commissions?from=${today}&to=${today}`,200,{cookie:owner});
    assert.deepEqual(paid.items.map(item=>item.rate_snapshot).sort(),[1000,2000]);
    const {data:report}=await request(`${business}/reports?from=${today}&to=${today}`,200,{cookie:owner});
    assert.equal(report.services_cents,5500);assert.equal(report.products_cents,order.total_cents);assert.equal(report.commission_cents,1100+Math.round(order.total_cents/10));
    const {data:wallet}=await request(`/client/${slug}/loyalty`,200,{cookie:first});
    assert.equal(wallet.balance,2);assert.ok(wallet.eligible);
    await request(`${business}/clients/${actor.id}/loyalty/redeem`,201,{method:'POST',cookie:owner});
    await request(`${business}/clients/${actor.id}/loyalty/redeem`,409,{method:'POST',cookie:owner});
    const {data:debit}=await request(`/client/${slug}/loyalty`,200,{cookie:first});
    assert.equal(debit.balance,0);assert.ok(debit.items.some(item=>item.kind==='REDEMPTION'));
    const {data:analytic}=await request(`${business}/clients?sort=spend`,200,{cookie:owner});
    assert.equal(analytic.items[0].spent,5500+order.total_cents);
  });

  await t.test('upload local de imagem transformada',async()=>{
    const form=new FormData();form.set('image',new Blob([await readFile('../public/corte.webp')],{type:'image/webp'}),'corte.webp');
    const response=await fetch(`${base}${business}/media`,{method:'POST',headers:{Origin:origin,Cookie:owner},body:form});
    assert.equal(response.status,201);
    const {url:path}=await response.json();assert.ok(path.startsWith(`/media/${tenant}/`));
    const photo=await fetch(base.replace(/\/api$/,'')+path);
    assert.equal(photo.status,200);assert.match(photo.headers.get('content-type'),/image\/webp/);
  });

  await t.test('funcionário troca a senha e mantém acesso somente ao próprio perfil',async()=>{
    const path=`/staff/${slug}/profile`;
    const {data:profile}=await request(path,200,{cookie:staff});
    assert.equal(profile.id,professional_id);
    await request(path,400,{method:'PATCH',cookie:staff,body:{professional_id:store.professionals[1].id}});
    const nextPassword='OutraSenha!2026';
    await request(path,403,{method:'PATCH',cookie:staff,body:{current_password:'SenhaIncorreta',new_password:nextPassword}});
    const {cookie:renewed}=await request(path,200,{method:'PATCH',cookie:staff,body:{current_password:demo,new_password:nextPassword}});
    await request('/auth/session',401,{cookie:staff});
    assert.equal((await request(path,200,{cookie:renewed})).data.id,professional_id);
    await request(`/auth/${slug}/login`,401,{method:'POST',body:{phone:'(85) 90000-0003',password:demo}});
    await request(`/auth/${slug}/login`,200,{method:'POST',body:{phone:'(85) 90000-0003',password:nextPassword}});
  });

  await t.test('mensagem de WhatsApp é editável pelo dono e visível para a equipe',async()=>{
    const {renderConfirmation,whatsappLink}=await import('../dist-server/src/utils/whatsappLink.js');
    const template='Olá, {cliente}! {servico} às {horario}.';
    await request(`${business}/confirmation`,200,{method:'PATCH',cookie:owner,body:{confirmation_message_template:template}});
    await request(`${business}/confirmation`,403,{method:'PATCH',cookie:first,body:{confirmation_message_template:'Inválido'}});
    const {cookie:fresh}=await request(`/auth/${slug}/login`,200,{method:'POST',body:{phone:'(85) 90000-0004',password:demo}});
    await request(`${business}/confirmation`,403,{method:'PATCH',cookie:fresh,body:{confirmation_message_template:'Inválido'}});
    assert.equal((await request(`/staff/${slug}`,200,{cookie:fresh})).data.confirmation_message_template,template);
    const fields={cliente:'Ana & João',servico:'Corte',profissional:'Diego',data:'01/12',horario:'09:30',valor:'R$ 50,00',empresa:'Navalha',endereco:'Fortaleza'};
    const url=new URL(whatsappLink('(85) 91234-5678',template,fields));
    assert.equal(url.pathname,'/5585912345678');
    assert.equal(url.searchParams.get('text'),renderConfirmation(template,fields));
  });

  await t.test('Google Agenda sincroniza criação, reagendamento e cancelamento sem bloquear a reserva',async()=>{
    const {syncGoogleCalendar}=await import('../dist-server/src/services/google-calendar.service.js');
    const {encryptToken,decryptToken}=await import('../dist-server/src/lib/crypto.js');
    process.env.GOOGLE_TOKEN_ENCRYPTION_KEY=randomBytes(32).toString('base64');
    const scope=tenant+':'+professional_id;
    const encrypted=encryptToken('token-ficticio',scope);
    assert.equal(decryptToken(encrypted,scope),'token-ficticio');
    assert.throws(()=>decryptToken(encrypted,tenant+':outro'));
    await pool.query("UPDATE tenants SET feature_flags=feature_flags || '{\"enable_online_booking\":true,\"enable_google_calendar\":true}'::jsonb WHERE id=$1",[tenant]);
    await pool.query("UPDATE professionals SET google_refresh_token=$3,google_subject='test-subject',google_email='staff@example.test',google_connection_id=gen_random_uuid() WHERE tenant_id=$1 AND id=$2",[tenant,professional_id,encrypted]);
    const {data:available}=await request(slots,200);
    const {data:item}=await request('/appointments',201,{method:'POST',cookie:first,body:{slug,professional_id,service_ids,starts_at:available.starts[0]}});
    const jobs=async()=>(await pool.query('SELECT * FROM google_calendar_jobs WHERE appointment_id=$1',[item.id])).rows;
    assert.equal((await jobs()).length,1);
    await syncGoogleCalendar(async()=>{throw new Error('Provedor simulado indisponível');});
    assert.equal((await jobs())[0].attempts,1);
    await pool.query('UPDATE google_calendar_jobs SET due_at=now() WHERE appointment_id=$1',[item.id]);
    const sent=[];
    const mock=async(job,event)=>{sent.push({job,event});return job.status==='CANCELADO'?null:event.id;};
    const processed=await Promise.all([syncGoogleCalendar(mock),syncGoogleCalendar(mock)]);
    assert.equal(processed.reduce((total,result)=>total+result.processed,0),1);
    assert.equal(sent[0].event.start.dateTime,item.starts_at);
    assert.deepEqual(sent[0].event.reminders.overrides.map(rule=>rule.minutes),[60,15]);
    const eventId=sent[0].event.id;
    const {data:updated}=await request(`${business}/agenda/${item.id}`,200,{method:'PATCH',cookie:owner,body:{starts_at:available.starts.at(-1)}});
    await syncGoogleCalendar(mock);
    assert.equal(sent[1].job.google_event_id,eventId);
    assert.equal(sent[1].event.start.dateTime,updated.starts_at);
    await request(`/client/${slug}/appointments/${item.id}/cancel`,200,{method:'POST',cookie:first});
    await syncGoogleCalendar(mock);
    assert.equal(sent[2].job.status,'CANCELADO');
    assert.equal(sent[2].job.google_event_id,eventId);
    assert.equal((await pool.query('SELECT google_event_id FROM appointments WHERE id=$1',[item.id])).rows[0].google_event_id,null);
    assert.equal((await jobs()).length,0);
  });

  await t.test('contas Master com busca, bloqueio, redefinição e suporte somente para consulta',async()=>{
    const body={slug:'nova-loja',name:'Nova Loja',kind:'SALAO',timezone:'America/Fortaleza',
      owner:{email:'negocio@example.test',name:'Dona da Loja',phone:'(85) 90000-0026',password:demo}};
    await request('/master/owners',403,{cookie:owner,method:'POST',body});
    await request('/master/owners',201,{cookie:master,method:'POST',body});
    const {data:directory}=await request('/master/accounts?q=negocio%40example.test&role=OWNER',200,{cookie:master});
    assert.equal(directory.items.length,1);
    assert.equal(directory.items[0].email,body.owner.email);
    assert.equal('password_hash' in directory.items[0],false);
    const {data:clientDirectory}=await request('/master/accounts?q=900000025&role=CLIENT',200,{cookie:master});
    assert.equal(clientDirectory.items.length,1);
    const clientId=clientDirectory.items[0].id;
    const {cookie:support}=await request('/master/impersonate',200,{cookie:master,method:'POST',body:{user_id:clientId}});
    const {data:identity}=await request('/auth/session',200,{cookie:support});
    assert.equal(identity.id,clientId);assert.equal(identity.read_only_support,true);
    await request(`/client/${slug}/appointments`,200,{cookie:support});
    await request(`/client/${slug}/profile`,403,{cookie:support,method:'PATCH',body:{name:'Negado',phone:'(85) 90000-0021'}});
    await request('/master/accounts',403,{cookie:support});
    ({cookie:master}=await request('/auth/exit-support',204,{cookie:support,method:'POST'}));
    await request(`/master/accounts/${clientId}`,204,{cookie:master,method:'PATCH',body:{blocked:true}});
    await request('/auth/session',401,{cookie:first});
    await request('/auth/login',401,{method:'POST',body:{phone:'(85) 90000-0025',password:demo}});
    await request(`/master/accounts/${clientId}`,204,{cookie:master,method:'PATCH',body:{blocked:false}});
    const password='AgendaTesteNova2026!';
    await request(`/master/accounts/${clientId}`,204,{cookie:master,method:'PATCH',body:{password}});
    const {data}=await request('/auth/login',200,{method:'POST',body:{phone:'(85) 90000-0025',password}});
    assert.equal(data.redirect_to,'/minha-conta');
    const events=await pool.query('SELECT event FROM audit_events WHERE target_user_id=$1',[clientId]);
    assert.ok(events.rows.some(row=>row.event==='ACCOUNT_SUPPORT_STARTED'));
    assert.ok(events.rows.some(row=>row.event==='ACCOUNT_PASSWORD_RESET'));
  });

  await t.test('OTP único de seis dígitos e bloqueio da recuperação de empresários',async()=>{
    const {issuePhoneCode,resetPhonePassword}=await import('../dist-server/src/services/password-reset.service.js');
    await request('/auth/forgot-password-phone',403,{method:'POST',body:{phone:'(85) 90000-0002'}});
    await assert.rejects(issuePhoneCode({phone:'+5585900000001'},async()=>assert.fail('Não deve enviar SMS')),error=>error.status===403);
    const identity={phone:'+5585900000022',slug};
    let code='';
    const {challenge}=await issuePhoneCode(identity,async(phone,otp)=>{assert.equal(phone,identity.phone);code=otp;});
    assert.match(code,/^\d{6}$/);
    const row=(await pool.query('SELECT otp_hash,expires_at-issued_at AS validity FROM password_reset_tokens WHERE id=$1',[challenge])).rows[0];
    assert.notEqual(row.otp_hash,code);assert.equal(row.validity.minutes,10);
    const wrong=code==='123456'?'654321':'123456';
    await assert.rejects(resetPhonePassword({...identity,challenge,code:wrong,password:demo}),error=>error.status===400);
    assert.equal((await pool.query('SELECT attempts FROM password_reset_tokens WHERE id=$1',[challenge])).rows[0].attempts,1);
    const password='ClienteComSenhaNova2026!';
    await request('/auth/reset-password-phone',204,{method:'POST',body:{...identity,challenge,code,password}});
    await request('/auth/session',401,{cookie:second});
    await assert.rejects(resetPhonePassword({...identity,challenge,code,password}),error=>error.status===400);
    await request('/auth/login',200,{method:'POST',body:{phone:identity.phone,password}});
  });

  await t.test('categorias filtradas por tipo e protegidas por chaves estrangeiras',async()=>{
    const path=`${business}/categories`;
    const services=await request(path+'?type=SERVICE',200,{cookie:owner});
    const products=await request(path+'?type=PRODUCT',200,{cookie:owner});
    assert.ok(services.data.length&&services.data.every(item=>item.type==='SERVICE'));
    assert.ok(products.data.length&&products.data.every(item=>item.type==='PRODUCT'));
    const {data:category}=await request(path,201,{method:'POST',cookie:owner,body:{name:'Edição especial',type:'PRODUCT'}});
    const product={name:'Item de teste',description:'',photo:'',active:true,price_cents:1200,category_id:category.id};
    await request(`${business}/services`,400,{method:'POST',cookie:owner,body:{...product,duration_minutes:30}});
    const {data:item}=await request(`${business}/products`,201,{method:'POST',cookie:owner,body:product});
    assert.equal(item.category_id,category.id);
    await request(`${path}/${category.id}?type=PRODUCT`,409,{method:'DELETE',cookie:owner});
    await request(`${path}/${category.id}`,200,{method:'PUT',cookie:owner,body:{type:'PRODUCT',name:'Nova edição'}});
    assert.equal((await request(storefront,200)).data.products.find(row=>row.id===item.id).category,'Nova edição');
    const {data:other}=await request('/auth/salao-teste/login',200,{method:'POST',body:{phone:'(85) 90000-0023',password:demo}});
    assert.notEqual(other.tenant_id,tenant);
    const foreign=(await pool.query("INSERT INTO categories(tenant_id,name,type) VALUES($1,'Restrita','PRODUCT') RETURNING id",[other.tenant_id])).rows[0];
    await request(`${business}/products`,400,{method:'POST',cookie:owner,body:{...product,category_id:foreign.id}});
  });

  await t.test('empresário só vincula profissional disponível do próprio estabelecimento',async()=>{
    const {data:profile}=await request(`${business}/profile`,200,{cookie:owner});
    assert.equal(profile.professional_id,null);
    await request(`${business}/profile`,409,{method:'PATCH',cookie:owner,body:{professional_id}});
    const free=(await pool.query("INSERT INTO professionals(tenant_id,name) VALUES($1,'Profissional livre') RETURNING id",[tenant])).rows[0];
    const {data:linked}=await request(`${business}/profile`,200,{method:'PATCH',cookie:owner,body:{professional_id:free.id}});
    assert.equal(linked.professional_id,free.id);
    await request(`${business}/profile`,200,{method:'PATCH',cookie:owner,body:{professional_id:null}});
  });

});
