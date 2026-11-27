'use client';

import Image from 'next/image';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useEffect, useId, useRef, useState, type KeyboardEvent, type PointerEvent, type ReactNode } from 'react';

export const fotosServicos = ['/corte.webp', '/barba.webp', '/combo.webp'];

const fotos = [
  { src: '/barbearia.webp', nome: 'O espaço', alt: 'Cadeira verde em uma barbearia de madeira escura com iluminação quente' },
  { src: fotosServicos[0], nome: 'O corte', alt: 'Barbeiro finalizando um degradê com pente' },
  { src: fotosServicos[1], nome: 'A barba', alt: 'Barbeiro aplicando uma toalha quente na barba de um cliente' },
];

export function acompanharPonteiro(evento: PointerEvent<HTMLElement>) {
  const elemento = evento.currentTarget;
  if (evento.pointerType === 'touch' || !elemento.closest('[data-efeitos="true"]')) return;
  const area = elemento.getBoundingClientRect();
  const x = (evento.clientX - area.left) / area.width;
  const y = (evento.clientY - area.top) / area.height;
  elemento.style.setProperty('--cursor-x', `${x * 100}%`);
  elemento.style.setProperty('--cursor-y', `${y * 100}%`);
  elemento.style.setProperty('--deriva-x', `${(x - .5) * 16}px`);
  elemento.style.setProperty('--deriva-y', `${(y - .5) * 16}px`);
}

export function Galeria() {
  const [foto, setFoto] = useState(0);
  const toqueInicial = useRef<{ x: number; y: number } | null>(null);
  const fotoAtual = fotos[foto];

  function navegar(delta: number) {
    setFoto(atual => (atual + delta + fotos.length) % fotos.length);
  }

  function terminarToque(evento: PointerEvent<HTMLDivElement>) {
    const inicio = toqueInicial.current;
    toqueInicial.current = null;
    if (evento.pointerType !== 'touch' || !inicio) return;
    const horizontal = evento.clientX - inicio.x;
    const vertical = evento.clientY - inicio.y;
    if (Math.abs(horizontal) > 45 && Math.abs(horizontal) > Math.abs(vertical)) navegar(horizontal < 0 ? 1 : -1);
  }

  return (
    <div className="galeria" role="region" aria-label="Galeria da barbearia" aria-roledescription="carrossel"
      onPointerEnter={acompanharPonteiro}
      onPointerMove={acompanharPonteiro}
      onKeyDown={evento => {
        if (evento.key !== 'ArrowLeft' && evento.key !== 'ArrowRight') return;
        evento.preventDefault();
        navegar(evento.key === 'ArrowLeft' ? -1 : 1);
      }}>
      <div className="galeria-palco"
        onPointerDown={evento => { if (evento.pointerType === 'touch') toqueInicial.current = { x: evento.clientX, y: evento.clientY }; }}
        onPointerCancel={() => { toqueInicial.current = null; }}
        onPointerUp={terminarToque}>
        <Image key={fotoAtual.src} className="galeria-foto" src={fotoAtual.src} alt={fotoAtual.alt} fill preload={foto === 0} sizes="(max-width: 760px) 100vw, 60vw" />
      </div>
      <div className="galeria-painel">
        <div className="galeria-legenda" aria-live="polite">{fotoAtual.nome}</div>
        <div className="galeria-index" aria-label="Escolher foto">
          {fotos.map((item, indice) => <button key={item.src} type="button" aria-label={`Ver foto: ${item.nome}`} aria-pressed={foto === indice} onClick={() => setFoto(indice)} />)}
        </div>
        <div className="controle-duplo">
          <button className="controle" type="button" aria-label="Foto anterior" onClick={() => navegar(-1)}><ChevronLeft size={21} /></button>
          <button className="controle" type="button" aria-label="Próxima foto" onClick={() => navegar(1)}><ChevronRight size={21} /></button>
        </div>
      </div>
    </div>
  );
}

export function Carrossel({ titulo, nome, children, chave }: { titulo: ReactNode; nome: string; children: ReactNode; chave?: string }) {
  const faixa = useRef<HTMLDivElement>(null);
  const id = useId();
  const [limites, setLimites] = useState({ anterior: false, proximo: false });

  function atualizarControles() {
    const elemento = faixa.current;
    if (!elemento) return;
    const anterior = elemento.scrollLeft > 2;
    const proximo = elemento.scrollLeft + elemento.clientWidth < elemento.scrollWidth - 2;
    setLimites(atual => atual.anterior === anterior && atual.proximo === proximo ? atual : { anterior, proximo });
  }

  useEffect(() => {
    const elemento = faixa.current;
    if (!elemento) return;
    elemento.scrollTo({ left: 0, behavior: 'instant' });
    const observador = new ResizeObserver(atualizarControles);
    observador.observe(elemento);
    [...elemento.children].forEach(item => observador.observe(item));
    return () => observador.disconnect();
  }, [chave]);

  function mover(direcao: -1 | 1) {
    const elemento = faixa.current;
    if (!elemento) return;
    const limite = elemento.scrollWidth - elemento.clientWidth;
    const posicoes = [...elemento.children].map(slide => (slide as HTMLElement).offsetLeft);
    const atual = elemento.scrollLeft;
    const destino = direcao === 1 ? posicoes.find(posicao => posicao > atual + 2) ?? limite
      : posicoes.findLast(posicao => posicao < atual - 2) ?? 0;
    elemento.scrollTo({ left: Math.min(destino, limite) });
  }

  function teclado(evento: KeyboardEvent<HTMLDivElement>) {
    if (evento.target !== evento.currentTarget) return;
    switch (evento.key) {
      case 'ArrowLeft': mover(-1); break;
      case 'ArrowRight': mover(1); break;
      case 'Home': faixa.current?.scrollTo({ left: 0 }); break;
      case 'End': if (faixa.current) faixa.current.scrollTo({ left: faixa.current.scrollWidth }); break;
      default: return;
    }
    evento.preventDefault();
  }

  return <div role="region" aria-label={nome} aria-roledescription="carrossel">
    <div className="secao-cabecalho">{titulo}<div className="controle-duplo">
      <button type="button" className="controle" aria-controls={id} aria-label={`${nome}: voltar`} disabled={!limites.anterior} onClick={() => mover(-1)}><ChevronLeft size={22} /></button>
      <button type="button" className="controle" aria-controls={id} aria-label={`${nome}: avançar`} disabled={!limites.proximo} onClick={() => mover(1)}><ChevronRight size={22} /></button>
    </div></div>
    <div className="carrossel-faixa" ref={faixa} id={id} tabIndex={0} aria-label={`Itens: ${nome}`} onScroll={atualizarControles} onKeyDown={teclado}>{children}</div>
  </div>;
}
