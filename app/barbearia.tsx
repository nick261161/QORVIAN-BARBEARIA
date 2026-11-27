'use client';

import Image from 'next/image';
import { useEffect, useRef, useState, useSyncExternalStore, type FormEvent } from 'react';
import { CalendarDays, Check, ChevronDown, Clock3, MapPin, Menu, Plus, Scissors, ShoppingBag, Sparkles, X } from 'lucide-react';
import { diasDisponiveis, gravarReserva, hora, horarios, lerReservas, linksAgenda, produtos, profissionais, reais, rotuloDia, servicos, type Reserva } from '../lib/agenda';
import { acompanharPonteiro, Carrossel, fotosServicos, Galeria } from './interacoes';

const categorias = ['Todos', 'Cabelo', 'Barba'] as const;
const formatoSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });
const formatoData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'UTC' });

const atalhos = [
  ['#servicos', 'Serviços'], ['#catalogo', 'Produtos'], ['#horarios', 'Horários'],
];
const movimento = '(prefers-reduced-motion: no-preference)';

function observarMovimento(atualizar: () => void) {
  const preferencia = window.matchMedia(movimento);
  preferencia.addEventListener('change', atualizar);
  return () => preferencia.removeEventListener('change', atualizar);
}

export default function Barbearia() {
  const dialogo = useRef<HTMLDialogElement>(null);
  const tituloConfirmacao = useRef<HTMLHeadingElement>(null);
  const sacola = useRef<HTMLDialogElement>(null);
  const fecharSacola = useRef<HTMLButtonElement>(null);
  const menu = useRef<HTMLDetailsElement>(null);
  const [servico, setServico] = useState<(typeof servicos)[number]>(servicos[0]);
  const [profissional, setProfissional] = useState<string>(profissionais[0]);
  const [dias, setDias] = useState<string[]>([]);
  const [dia, setDia] = useState('');
  const [minuto, setMinuto] = useState<number | null>(null);
  const [reservas, setReservas] = useState<Reserva[]>([]);
  const [selecionados, setSelecionados] = useState<string[]>([]);
  const [confirmacao, setConfirmacao] = useState<Reserva | null>(null);
  const [aviso, setAviso] = useState('');
  const [gravando, setGravando] = useState(false);
  const [categoria, setCategoria] = useState<(typeof categorias)[number]>('Todos');
  const [arranjoDias, setArranjoDias] = useState(0);
  const [efeitosManuais, setEfeitosManuais] = useState<boolean | null>(null);
  const efeitosDoSistema = useSyncExternalStore(observarMovimento, () => window.matchMedia(movimento).matches, () => false);
  const efeitos = efeitosManuais ?? efeitosDoSistema;

  function atualizarReservas() {
    try {
      setReservas(lerReservas());
      return true;
    } catch {
      setAviso('O armazenamento local está indisponível. Confira as configurações do navegador.');
      return false;
    }
  }

  useEffect(() => {
    window.addEventListener('storage', atualizarReservas);
    return () => window.removeEventListener('storage', atualizarReservas);
  }, []);

  useEffect(() => {
    if (confirmacao) tituloConfirmacao.current?.focus();
  }, [confirmacao]);

  const opcoes = dia ? horarios(dia, profissional, servico.duracao, reservas) : [];
  const itens = produtos.filter(produto => selecionados.includes(produto.id));
  const subtotal = itens.reduce((soma, produto) => soma + produto.valor, 0);
  const total = servico.valor + subtotal;
  const vitrine = produtos.filter(produto => categoria === 'Todos' || produto.categoria === categoria);

  function agendar(opcao = servico) {
    const proximosDias = diasDisponiveis();
    setServico(opcao);
    setDias(proximosDias);
    setArranjoDias(0);
    setDia(proximosDias[0]);
    setMinuto(null);
    setConfirmacao(null);
    setAviso('');
    atualizarReservas();
    sacola.current?.close();
    dialogo.current?.showModal();
  }

  function alternarProduto(id: string) {
    setSelecionados(itens => itens.includes(id) ? itens.filter(item => item !== id) : [...itens, id]);
  }

  async function confirmar(evento: FormEvent<HTMLFormElement>) {
    evento.preventDefault();
    if (gravando || minuto === null) return;
    const dados = new FormData(evento.currentTarget);
    const nome = String(dados.get('nome') ?? '').trim();
    const telefone = String(dados.get('telefone') ?? '').replace(/\D/g, '');
    if (nome.length < 2 || !/^(?:55)?\d{10,11}$/.test(telefone)) {
      setAviso('Informe um nome e um WhatsApp com DDD. Use dados fictícios para testar.');
      return;
    }

    setGravando(true);
    setAviso('');
    const reserva: Reserva = { id: crypto.randomUUID(), profissional, dia, minuto, duracao: servico.duracao, servico: servico.nome, produtos: itens.map(item => item.nome), total };
    try {
      const sucesso = await gravarReserva(reserva);
      atualizarReservas();
      if (sucesso) {
        setConfirmacao(reserva);
        setSelecionados([]);
      } else {
        setAviso('Esse horário ficou indisponível. Escolha outro para continuar.');
        setMinuto(null);
      }
    } catch {
      setAviso('Não foi possível salvar no navegador. Tente novamente.');
    } finally {
      setGravando(false);
    }
  }

  const links = confirmacao ? linksAgenda(confirmacao) : null;
  const mensagem = confirmacao ? [
    'Agendamento de demonstração | Navalha & Cia.',
    `${confirmacao.servico} com ${confirmacao.profissional}`,
    `${rotuloDia(confirmacao.dia)} às ${hora(confirmacao.minuto)}`,
    confirmacao.produtos.length ? `Produtos: ${confirmacao.produtos.join(', ')}` : '',
    `Total: ${reais(confirmacao.total)}`,
  ].filter(Boolean).join('\n') : '';

  return (
    <>
      <header className="topo">
        <div className="progresso" aria-hidden="true" />
        <div className="limite navegacao">
          <a href="#inicio" className="marca"><span className="selo"><Scissors size={22} strokeWidth={1.6} /></span><span>Navalha & Cia.<small>BARBEARIA</small></span></a>
          <nav className="nav-desktop" aria-label="Menu principal">{atalhos.map(([href, texto]) => <a key={href} href={href}>{texto}</a>)}</nav>
          <div className="acoes-topo">
            <button type="button" className="controle sacola-topo" aria-label={`Abrir sacola, ${itens.length} ${itens.length === 1 ? 'produto' : 'produtos'}`} onClick={() => sacola.current?.showModal()}><ShoppingBag size={19} />{itens.length > 0 && <span>{itens.length}</span>}</button>
            <button className="botao botao-topo" aria-label="Agendar horário" onClick={() => agendar()}><CalendarDays size={17} /> <span>Agendar</span></button>
            <details className="nav-mobile" ref={menu} onKeyDown={evento => {
              if (evento.key === 'Escape' && evento.currentTarget.open) {
                evento.currentTarget.open = false;
                evento.currentTarget.querySelector('summary')?.focus();
              }
            }}>
              <summary className="controle" aria-label="Menu de navegação"><Menu size={21} /></summary>
              <nav aria-label="Menu móvel">{atalhos.map(([href, texto]) => <a key={href} href={href} onClick={() => { if (menu.current) menu.current.open = false; }}>{texto}</a>)}</nav>
            </details>
          </div>
        </div>
      </header>

      <main id="inicio">
        <section className="hero" aria-labelledby="titulo" data-efeitos={efeitos}>
          <div className="hero-grade limite">
            <div className="hero-texto">
              <p className="rotulo"><MapPin size={15} /> Fortaleza, CE</p>
              <h1 id="titulo">Corte no<br />seu <em>estilo.</em></h1>
              <p className="hero-descricao">Do degradê ao clássico, escolha seu corte e reserve um horário com seu barbeiro.</p>
              <div className="hero-acoes">
                <button className="botao botao-primario" onClick={() => agendar()}><CalendarDays size={18} /> Agendar meu horário</button>
                <a className="texto-link" href="#servicos">Ver serviços</a>
              </div>
              <div className="hero-detalhes">
                <p className="hero-horario"><Clock3 size={17} /> Ter–sex, 9h–19h · Sáb, 9h–17h</p>
                <button type="button" className="efeitos" aria-pressed={efeitos} onClick={() => setEfeitosManuais(!efeitos)}><Sparkles size={15} /> Efeitos do cursor</button>
              </div>
            </div>
            <Galeria />
          </div>
        </section>

        <section id="servicos" className="servicos" aria-labelledby="titulo-servicos" data-efeitos={efeitos}>
          <div className="limite">
            <Carrossel nome="Serviços" titulo={<div><p className="rotulo"><Scissors size={15} /> Serviços</p><h2 id="titulo-servicos">Escolha seu próximo corte.</h2></div>}>
              {servicos.map((opcao, indice) => <article className="cartao" key={opcao.id} onPointerMove={acompanharPonteiro}>
                <div className="cartao-foto"><Image src={fotosServicos[indice]} alt="" fill sizes="(max-width: 760px) 85vw, 40vw" /><span className="minutos"><Clock3 size={15} /> {opcao.duracao} min</span></div>
                <div className="cartao-corpo">
                  <h3>{opcao.nome}</h3><p>{opcao.descricao}</p>
                  <div className="cartao-rodape"><strong>{reais(opcao.valor)}</strong><button className="botao escolha" onClick={() => agendar(opcao)} aria-label={`Agendar ${opcao.nome.toLowerCase()}`}>Agendar</button></div>
                </div>
              </article>)}
            </Carrossel>
          </div>
        </section>

        <section id="catalogo" className="catalogo" aria-labelledby="titulo-catalogo">
          <div className="limite">
            <Carrossel nome="Produtos" chave={categoria} titulo={<div>
              <p className="rotulo"><ShoppingBag size={15} /> Produtos</p><h2 id="titulo-catalogo">Cuidados em casa.</h2>
              <p className="catalogo-intro">Adicione à reserva e retire na barbearia.</p>
              <div className="filtros" role="group" aria-label="Filtrar produtos">{categorias.map(item => <button className="botao escolha" key={item} type="button" aria-pressed={categoria === item} onClick={() => setCategoria(item)}>{item}</button>)}</div>
            </div>}>
              {vitrine.map(produto => {
                const incluso = selecionados.includes(produto.id);
                return <article className="produto" key={produto.id}>
                  <div className="produto-foto"><Image src={`/${produto.id}.webp`} alt="" fill sizes="(max-width: 760px) 75vw, 30vw" /></div>
                  <div className="cartao-corpo"><h3>{produto.nome}</h3><p>{produto.descricao}</p>
                    <div className="cartao-rodape"><strong>{reais(produto.valor)}</strong><button className="botao escolha" type="button" aria-label={`Selecionar ${produto.nome.toLowerCase()}`} aria-pressed={incluso} onClick={() => alternarProduto(produto.id)}>{incluso ? <Check size={18} /> : <Plus size={18} />}{incluso ? 'Na sacola' : 'Adicionar'}</button></div>
                  </div>
                </article>;
              })}
            </Carrossel>
            <p className="somente-leitor" role="status">{vitrine.length} {vitrine.length === 1 ? 'produto disponível' : 'produtos disponíveis'} em {categoria}. {itens.length} na sacola.</p>
          </div>
        </section>
      </main>

      <footer id="horarios">
        <div className="limite rodape">
          <a href="#inicio" className="marca"><span className="selo"><Scissors size={21} strokeWidth={1.6} /></span><span>Navalha & Cia.<small>BARBEARIA</small></span></a>
          <div><strong>Horários de atendimento</strong><p>Ter–sex, 9h–19h · Sáb, 9h–17h<br />Intervalo das 12h às 13h</p></div>
          <div className="rodape-acao"><button className="botao botao-primario" onClick={() => agendar()}><CalendarDays size={17} /> Reservar horário</button><p>Site demonstrativo · Fortaleza, CE</p></div>
        </div>
      </footer>

      <dialog ref={sacola} className="sacola" aria-labelledby="titulo-sacola">
        <div className="dialogo-corpo">
          <button ref={fecharSacola} type="button" className="fechar" aria-label="Fechar sacola" onClick={() => sacola.current?.close()}><X size={23} /></button>
          <p className="rotulo"><ShoppingBag size={15} /> Produtos</p><h2 id="titulo-sacola">Sua sacola</h2>
          {itens.length ? <div className="sacola-itens">
            {itens.map(item => <div className="sacola-item" key={item.id}><span>{item.nome}</span><strong>{reais(item.valor)}</strong><button className="controle" type="button" aria-label={`Remover ${item.nome.toLowerCase()} da sacola`} onClick={() => { fecharSacola.current?.focus(); alternarProduto(item.id); }}><X size={17} /></button></div>)}
            <div className="total"><strong>Produtos {reais(subtotal)}</strong><button className="botao botao-primario" type="button" onClick={() => agendar()}>Continuar para reserva</button></div>
          </div> : <div className="sacola-itens"><p>Sua sacola está vazia.</p><a href="#catalogo" className="botao escolha" onClick={() => sacola.current?.close()}>Explorar produtos</a></div>}
        </div>
      </dialog>

      <dialog ref={dialogo} aria-labelledby="titulo-dialogo" onCancel={evento => { if (gravando) evento.preventDefault(); }}>
        <div className="dialogo-corpo">
          <button type="button" className="fechar" aria-label="Fechar agendamento" disabled={gravando} onClick={() => dialogo.current?.close()}><X size={23} /></button>
          {confirmacao && links ? <div className="confirmacao">
            <span className="icone-servico"><Check size={28} /></span>
            <h2 id="titulo-dialogo" ref={tituloConfirmacao} tabIndex={-1}>Horário reservado</h2>
            <p>Agendamento de demonstração registrado neste navegador.</p>
            <div className="resumo"><strong>{confirmacao.servico} com {confirmacao.profissional}</strong><span>{rotuloDia(confirmacao.dia)} às {hora(confirmacao.minuto)}</span>{confirmacao.produtos.length > 0 && <span>{confirmacao.produtos.join(', ')}</span>}<strong>{reais(confirmacao.total)}</strong></div>
            <div className="confirmacao-acoes"><a className="botao botao-primario" href={links.google} target="_blank" rel="noreferrer"><CalendarDays size={17} /> Google Agenda</a><a className="botao escolha" download="navalha-agendamento.ics" href={links.ics}>Baixar .ics</a><a className="botao escolha" href={`https://wa.me/?text=${encodeURIComponent(mensagem)}`} target="_blank" rel="noreferrer">Compartilhar no WhatsApp</a></div>
          </div> : <>
            <p className="rotulo"><CalendarDays size={15} /> Agenda demonstrativa</p>
            <h2 id="titulo-dialogo">Reserve seu horário</h2>
            <form onSubmit={confirmar}>
              <div className="linha-campos">
                <label>Serviço<div className="selecao"><select value={servico.id} onChange={evento => { const novo = servicos.find(item => item.id === evento.target.value); if (novo) setServico(novo); setMinuto(null); }}>{servicos.map(item => <option key={item.id} value={item.id}>{item.nome} · {reais(item.valor)}</option>)}</select><ChevronDown size={17} /></div></label>
                <label>Barbeiro<div className="selecao"><select value={profissional} onChange={evento => { setProfissional(evento.target.value); setMinuto(null); }}>{profissionais.map(item => <option key={item}>{item}</option>)}</select><ChevronDown size={17} /></div></label>
              </div>
              <fieldset><legend>Dia</legend><div className="datas" aria-label="Dias disponíveis">
                {dias.slice(arranjoDias, arranjoDias + 5).map(item => {
                  const data = new Date(`${item}T12:00:00Z`);
                  return <button key={item} className="botao escolha data" type="button" aria-label={rotuloDia(item)} aria-pressed={dia === item} onClick={() => { setDia(item); setMinuto(null); }}><small>{formatoSemana.format(data)}</small><strong>{formatoData.format(data)}</strong></button>;
                })}
              </div><div className="datas-navegacao"><button className="botao escolha" type="button" onClick={() => setArranjoDias(atual => Math.max(0, atual - 5))} disabled={arranjoDias === 0}>Dias anteriores</button><button className="botao escolha" type="button" onClick={() => setArranjoDias(atual => atual + 5)} disabled={arranjoDias + 5 >= dias.length}>Próximos dias</button></div></fieldset>
              <fieldset><legend>Horários disponíveis</legend>{opcoes.length ? <div className="slots">{opcoes.map(item => <button type="button" className="botao escolha" key={item} aria-pressed={minuto === item} onClick={() => setMinuto(item)}>{hora(item)}</button>)}</div> : <p className="texto-menor">Sem horários disponíveis. Experimente outro dia ou barbeiro.</p>}</fieldset>
              <fieldset><legend>Produtos opcionais</legend><div className="opcionais">{produtos.map(produto => <label key={produto.id}><input type="checkbox" checked={selecionados.includes(produto.id)} onChange={() => alternarProduto(produto.id)} /> {produto.nome} <span>{reais(produto.valor)}</span></label>)}</div></fieldset>
              <p className="texto-menor">Use nome e telefone fictícios para testar a reserva.</p>
              <div className="linha-campos"><label>Seu nome<input name="nome" placeholder="Nome completo" required minLength={2} maxLength={80} /></label><label>WhatsApp<input name="telefone" type="tel" placeholder="(85) 99999-0000" required maxLength={24} /></label></div>
              {aviso && <p className="aviso" role="alert">{aviso}</p>}
              <div className="total"><div className="total-detalhes" aria-live="polite"><strong>Total {reais(total)}</strong>{minuto !== null && <span>{rotuloDia(dia)} às {hora(minuto)}</span>}</div><button type="submit" className="botao botao-primario" disabled={gravando || minuto === null || !opcoes.includes(minuto)}>{gravando ? 'Reservando…' : 'Confirmar agendamento'}</button></div>
            </form>
          </>}
        </div>
      </dialog>
    </>
  );
}
