'use client';
import { Temporal } from '@js-temporal/polyfill';
import { useState, type FormEvent } from 'react';
import { api, dateTime, useResource, weekdays, type Block, type DayRule, type Professional, type Tenant, type WorkingHour } from '../../services/api.js';
import { FormPanel, Notice, Result, useAction } from '../../components/ui/index.js';
import { featureLabels,featureNames,type Flags } from '../../../shared/features.js';
import { ConfirmationTemplate } from './ConfirmationTemplate';

const emptyDay = (weekday: number): DayRule => ({ weekday, closed: true, opens_at: null, closes_at: null, break_start: null, break_end: null });

export function Hours({ base, tenant, flags, template,refresh }: { base: string; tenant: Tenant; flags:Flags; template:string;refresh: () => void }) {
  const { timezone } = tenant;
  const [person, setPerson] = useState('');
  const people = useResource<Professional[]>(`${base}/professionals`);
  const hours = useResource<{ hours: WorkingHour[]; blocks: Block[] }>(`${base}/hours`);
  const blocksAction = useAction(hours.refresh);
  const policy = useAction(refresh);
  const [removing, setRemoving] = useState('');
  function block(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); const form = event.currentTarget; const data = new FormData(form);
    const local = (value: FormDataEntryValue | null) => Temporal.PlainDateTime.from(String(value)).toZonedDateTime(timezone, { disambiguation: 'reject' }).toInstant().toString();
    void blocksAction.perform(() => api(`${base}/blocks`, { method: 'POST', body: { professional_id: data.get('professional_id') || null,
      starts_at: local(data.get('starts_at')), ends_at: local(data.get('ends_at')), reason: data.get('reason') } }), 'Bloqueio cadastrado.').then(ok => { if (ok) form.reset(); });
  }
  return <>
    <section className="painel formulario"><h2>Horários de funcionamento</h2><label>Escala<select value={person} onChange={event => setPerson(event.target.value)}><option value="">Estabelecimento</option>{people.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <p className="suave">A escala individual funciona dentro do horário geral. Dias que herdam a escala usam os horários do estabelecimento.</p>
      <Notice loading={hours.loading && !hours.data} error={hours.error ?? people.error} />
      {hours.data && <WeeklyRules key={person} base={base} person={person} rules={hours.data.hours.filter(rule => (rule.professional_id ?? '') === person)} refresh={hours.refresh} />}
    </section>
    <FormPanel title="Regras da agenda" submit={event => {
      event.preventDefault();
      const form=new FormData(event.currentTarget);
      const cancellation_minutes = Number(form.get('minutes'));
      void policy.perform(() => api(`${base}/policy`, { method: 'PATCH', body: { cancellation_minutes } }));
    }} pending={policy.pending}>
      <label>Antecedência mínima para o cliente cancelar (min)<input name="minutes" type="number" min="0" max="10080" required defaultValue={tenant.cancellation_minutes} /></label>
      <p className="suave">A grade oferece novos horários a cada 30 minutos.</p>
      <Result error={policy.error} success={policy.success} />
    </FormPanel>
    <FormPanel title="Novo bloqueio" submit={block} pending={blocksAction.pending} label="Bloquear intervalo">
      <label>Aplicar a<select name="professional_id"><option value="">Todo o estabelecimento</option>{people.data?.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
      <div className="form-colunas"><label>Início<input name="starts_at" type="datetime-local" required /></label><label>Fim<input name="ends_at" type="datetime-local" required /></label></div>
      <label>Motivo<input name="reason" maxLength={160} /></label><p className="suave">Horários no fuso {timezone}.</p><Result error={blocksAction.error} success={blocksAction.success} />
    </FormPanel>
    <section className="painel"><h2>Bloqueios atuais</h2><Notice empty={!hours.data?.blocks.length ? 'Nenhum bloqueio ativo.' : undefined} />
      <ul className="linhas">{hours.data?.blocks.map(item => <li key={item.id} className="linha-dados"><div className="corpo-linha"><strong>{item.reason || 'Bloqueio'}</strong><p>{item.professional_name ?? 'Todo o estabelecimento'} · {dateTime(item.starts_at, timezone)} até {dateTime(item.ends_at, timezone)}</p></div>
        {removing === item.id ? <div className="acoes"><button className="botao perigo" disabled={blocksAction.pending} onClick={() => { void blocksAction.perform(() => api(`${base}/blocks/${item.id}`, { method: 'DELETE' }), 'Bloqueio removido.').then(ok => { if (ok) setRemoving(''); }); }}>Confirmar remoção</button><button className="botao secundario" onClick={() => setRemoving('')}>Voltar</button></div> : <button className="botao secundario" onClick={() => setRemoving(item.id)}>Remover bloqueio</button>}
      </li>)}</ul></section>
    <ConfirmationTemplate base={base} tenant={tenant} template={template} refresh={refresh}/>
    <section className="painel"><h2>Funcionalidades do estabelecimento</h2><p className="suave">As permissões são configuradas no painel master.</p><ul className="linhas">{featureNames.map(key=><li className="linha-dados" key={key}><span className="corpo-linha">{featureLabels[key]}</span><strong>{flags[key]?'Ligada':'Desligada'}</strong></li>)}</ul></section>
  </>;
}

function WeeklyRules({ base, person, rules, refresh }: { base: string; person: string; rules: WorkingHour[]; refresh: () => void }) {
  const [days, setDays] = useState(() => weekdays.map((_, index) => {
    const match = rules.find(item => item.weekday === index);
    if (match) { const { professional_id: _, ...rule } = match; return { ...rule, inherit: false }; }
    return { ...emptyDay(index), inherit: Boolean(person) };
  }));
  const action = useAction(refresh);
  const setDay = (index: number, patch: Partial<(typeof days)[number]>) => setDays(current => current.map((day, key) => key === index ? { ...day, ...patch } : day));
  function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const body = { professional_id: person || null, days: days.filter(item => !item.inherit).map(({ inherit: _, ...rule }) => rule.closed ? emptyDay(rule.weekday) : rule) };
    void action.perform(() => api(`${base}/hours`, { method: 'PUT', body }));
  }
  return <form className="formulario" onSubmit={save}>
    {days.map((day, index) => <fieldset className="regra-dia" key={index}><legend>{weekdays[index]}</legend>
      <div className="acoes"><label className="checkbox"><input type="checkbox" checked={day.closed} disabled={day.inherit} onChange={event => setDay(index, { closed: event.target.checked, opens_at: day.opens_at ?? '09:00', closes_at: day.closes_at ?? '18:00' })} /> Fechado</label>
        {person && <label className="checkbox"><input type="checkbox" checked={day.inherit} onChange={event => setDay(index, { inherit: event.target.checked })} /> Herdar escala geral</label>}</div>
      {!day.inherit && !day.closed && <div className="form-quatro">{([['opens_at', 'Abertura'], ['closes_at', 'Fechamento'], ['break_start', 'Início do intervalo'], ['break_end', 'Fim do intervalo']] as const).map(([field, label]) =>
        <label key={field}>{label}<input type="time" value={day[field] ?? ''} required={field === 'opens_at' || field === 'closes_at'} onChange={event => setDay(index, { [field]: event.target.value || null })} /></label>)}</div>}
    </fieldset>)}<Result error={action.error} success={action.success} /><div className="acoes"><button className="botao primario" disabled={action.pending}>Salvar escala</button></div>
  </form>;
}
