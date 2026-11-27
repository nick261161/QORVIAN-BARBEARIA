export const servicos = [
  { id: 'corte', nome: 'Corte clássico', descricao: 'Tesoura, máquina e acabamento na navalha. Do clássico ao degradê.', duracao: 40, valor: 55 },
  { id: 'barba', nome: 'Barba completa', descricao: 'Toalha quente, desenho da barba e finalização com óleo.', duracao: 30, valor: 40 },
  { id: 'combo', nome: 'Corte + barba', descricao: 'Corte e barba completos em um só atendimento.', duracao: 60, valor: 85 },
] as const;

export const profissionais = ['Rafael', 'Diego'] as const;

export const produtos = [
  { id: 'pomada', nome: 'Pomada matte', descricao: 'Fixação média e efeito seco · 80 g', valor: 49, categoria: 'Cabelo' },
  { id: 'oleo', nome: 'Óleo para barba', descricao: 'Óleo de jojoba e cedro · 30 ml', valor: 45, categoria: 'Barba' },
  { id: 'shampoo', nome: 'Shampoo diário', descricao: 'Limpeza suave com hortelã · 250 ml', valor: 39, categoria: 'Cabelo' },
] as const;

export type Reserva = {
  id: string;
  profissional: string;
  dia: string;
  minuto: number;
  duracao: number;
  servico: string;
  produtos: string[];
  total: number;
};

const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', maximumFractionDigits: 2 });
const fuso = 'America/Fortaleza';
const formatoDia = new Intl.DateTimeFormat('sv-SE', { timeZone: fuso, year: 'numeric', month: '2-digit', day: '2-digit' });
const formatoRotulo = new Intl.DateTimeFormat('pt-BR', { timeZone: 'UTC', dateStyle: 'long' });

export const reais = (valor: number) => moeda.format(valor);
export const hora = (minuto: number) => `${String(Math.floor(minuto / 60)).padStart(2, '0')}:${String(minuto % 60).padStart(2, '0')}`;
export const rotuloDia = (dia: string) => formatoRotulo.format(new Date(`${dia}T12:00:00Z`));

export function diasDisponiveis(agora = new Date()) {
  const dia = new Date(`${formatoDia.format(agora)}T12:00:00Z`);
  return Array.from({ length: 21 }, (_, indice) => {
    const data = new Date(dia);
    data.setUTCDate(dia.getUTCDate() + indice);
    return data;
  }).filter(data => data.getUTCDay() !== 0 && data.getUTCDay() !== 1)
    .map(data => data.toISOString().slice(0, 10));
}

export function horarios(dia: string, profissional: string, duracao: number, reservas: Reserva[], agora = new Date()) {
  const sabado = new Date(`${dia}T12:00:00Z`).getUTCDay() === 6;
  const periodos = [[9 * 60, 12 * 60], [13 * 60, (sabado ? 17 : 19) * 60]];

  return periodos.flatMap(([abre, fecha]) => {
    const opcoes: number[] = [];
    for (let inicio = abre; inicio + duracao <= fecha; inicio += 30) {
      const futuro = new Date(`${dia}T${hora(inicio)}:00-03:00`) > agora;
      const ocupado = reservas.some(reserva => reserva.dia === dia && reserva.profissional === profissional &&
        reserva.minuto < inicio + duracao && inicio < reserva.minuto + reserva.duracao);
      if (futuro && !ocupado) opcoes.push(inicio);
    }
    return opcoes;
  });
}

const chaveReservas = 'navalha:reservas:v1';

export function lerReservas(): Reserva[] {
  const dados: unknown = JSON.parse(localStorage.getItem(chaveReservas) ?? '[]');
  if (!Array.isArray(dados)) throw new Error('Dados da agenda indisponíveis.');
  return dados as Reserva[];
}

export async function gravarReserva(reserva: Reserva) {
  const gravar = () => {
    const atuais = lerReservas();
    if (!diasDisponiveis().includes(reserva.dia) || !horarios(reserva.dia, reserva.profissional, reserva.duracao, atuais).includes(reserva.minuto)) {
      return false;
    }
    localStorage.setItem(chaveReservas, JSON.stringify([...atuais, reserva]));
    return true;
  };

  return navigator.locks ? navigator.locks.request(chaveReservas, gravar) : gravar();
}

export function linksAgenda(reserva: Reserva) {
  const instante = (minuto: number) => new Date(`${reserva.dia}T${hora(minuto)}:00-03:00`).toISOString().replace(/[-:]/g, '').replace('.000', '');
  const inicio = instante(reserva.minuto);
  const fim = instante(reserva.minuto + reserva.duracao);
  const titulo = `${reserva.servico} | Navalha & Cia. (demonstração)`;
  const descricao = `Barbeiro: ${reserva.profissional}`;
  const google = new URLSearchParams({ action: 'TEMPLATE', text: titulo, dates: `${inicio}/${fim}`, details: descricao, ctz: fuso });
  const calendario = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Navalha e Cia//Agenda//PT', 'BEGIN:VEVENT',
    `UID:${reserva.id}@navalha-demo`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').replace('.000', '')}`,
    `DTSTART:${inicio}`, `DTEND:${fim}`, `SUMMARY:${titulo}`, `DESCRIPTION:${descricao}`, 'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
  return { google: `https://calendar.google.com/calendar/render?${google}`, ics: `data:text/calendar;charset=utf-8,${encodeURIComponent(calendario)}` };
}
