'use client';
import { createContext, useContext, useEffect, useState, type FormEvent, type ReactNode } from 'react';
import { api, ApiError, message, type Session } from '../services/api.js';

type Access = { session: Session | null; loading: boolean; error: string; authenticate: (data: Session) => void; reload: () => Promise<void>; logout: () => Promise<void> };
const Context = createContext<Access | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  async function reload() {
    setError('');
    try { setSession(await api<Session>('/auth/session')); }
    catch (error) {
      setSession(null);
      if (!(error instanceof ApiError) || ![401, 403].includes(error.status)) setError(message(error));
    } finally { setLoading(false); }
  }
  useEffect(() => { void reload(); }, []);
  return <Context.Provider value={{ session, loading, error, reload, authenticate: setSession, logout: async () => { await api('/auth/logout', { method: 'POST' }); setSession(null); } }}>{children}</Context.Provider>;
}

export function useSession() { return useContext(Context)!; }

export function AccessForm({ slug, allowRegistration = false, onSuccess }: { slug?: string; allowRegistration?: boolean; onSuccess: (session: Session) => void }) {
  const [register, setRegister] = useState(false);
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);
  const { authenticate } = useSession();
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setPending(true);
    const entries = Object.fromEntries(new FormData(event.currentTarget));
    try {
      const next = await api<Session>(`/auth${slug ? `/${slug}` : ''}/${register ? 'register' : 'login'}`, { method: 'POST', body: entries });
      authenticate(next); onSuccess(next);
    } catch (failure) { setError(message(failure)); }
    finally { setPending(false); }
  }
  return <form className="formulario" onSubmit={submit}>
    {allowRegistration && <div className="alternativas" aria-label="Modo de acesso"><button type="button" className="botao secundario" aria-pressed={!register} onClick={() => { setRegister(false); setError(''); }}>Já tenho conta</button><button type="button" className="botao secundario" aria-pressed={register} onClick={() => { setRegister(true); setError(''); }}>Criar conta</button></div>}
    {register && <label>Nome completo<input name="name" required maxLength={100} autoComplete="name" /></label>}
    <label>Telefone / WhatsApp<input type="tel" name="phone" required maxLength={25} autoComplete="tel" placeholder="(85) 90000-0000" /></label>
    <label>Senha<input type="password" name="password" required minLength={8} maxLength={72} autoComplete={register ? 'new-password' : 'current-password'} /></label>
    {error && <p className="erro" role="alert">{error}</p>}
    <button className="botao primario" disabled={pending}>{pending ? 'Aguarde…' : register ? 'Criar conta' : 'Entrar'}</button>
  </form>;
}
