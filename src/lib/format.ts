const fmtBRL = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtNum = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/*
 * Ocultar valores (botão de olho no topo): as telas mostram "R$ •••••" no lugar dos valores.
 * Fica guardado só neste aparelho. O PDF de fechamento sempre usa os valores reais (brlReal).
 */
let ocultos = false;
const CHAVE_OCULTAR = 'caixa-real:ocultar';
const MASCARA = 'R$ •••••';

export function valoresOcultos(): boolean {
  return ocultos;
}
export function lerOcultar(): boolean {
  try {
    return localStorage.getItem(CHAVE_OCULTAR) === '1';
  } catch {
    return false;
  }
}
export function definirOcultar(v: boolean, guardar = false) {
  ocultos = v;
  if (!guardar) return;
  try {
    if (v) localStorage.setItem(CHAVE_OCULTAR, '1');
    else localStorage.removeItem(CHAVE_OCULTAR);
  } catch {
    /* sem armazenamento: vale só até fechar */
  }
}

export const brlReal = (centavos: number) => fmtBRL.format(centavos / 100);
export const brl = (centavos: number) => (ocultos ? MASCARA : brlReal(centavos));
export const num = (centavos: number) => (ocultos ? '•••••' : fmtNum.format(centavos / 100));

/** Formato curto para eixos de gráfico: 12,3 mil, 1,2 mi. */
export function brlCurto(centavos: number): string {
  if (ocultos) return centavos === 0 ? '0' : '•••';
  const v = centavos / 100;
  const a = Math.abs(v);
  if (a >= 1_000_000) return `${(v / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mi`;
  if (a >= 1_000) return `${(v / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil`;
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 });
}

/**
 * Lê um valor digitado em reais e devolve centavos.
 * Aceita "1.234,56", "1234,56", "1234.56", "R$ 50" e "50".
 */
export function parseValor(texto: string): number | null {
  let s = texto.replace(/R\$|\s/g, '').trim();
  if (!s) return null;
  const temVirgula = s.includes(',');
  if (temVirgula) {
    s = s.replace(/\./g, '').replace(',', '.');
  } else {
    // "1.234" com 3 casas depois do ponto é milhar; "12.5" é decimal.
    const partes = s.split('.');
    if (partes.length > 2 || (partes.length === 2 && partes[1].length === 3)) s = partes.join('');
  }
  if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
  return Math.round(parseFloat(s) * 100);
}

/** Centavos para o texto de um campo de valor ("1234,50"). */
export const valorParaCampo = (centavos: number) =>
  (centavos / 100).toFixed(2).replace('.', ',');

// ---------- Datas ----------

const pad = (n: number) => String(n).padStart(2, '0');

export const isoDe = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

export function dataDe(iso: string): Date {
  const [a, m, d] = iso.split('-').map(Number);
  return new Date(a, m - 1, d);
}

export const hoje = () => isoDe(new Date());

export function somaDias(iso: string, dias: number): string {
  const d = dataDe(iso);
  d.setDate(d.getDate() + dias);
  return isoDe(d);
}

/** Soma meses mantendo o dia; se o mês for mais curto, usa o último dia (31/01 + 1 = 28/02). */
export function somaMeses(iso: string, meses: number): string {
  const [a, m, d] = iso.split('-').map(Number);
  const alvo = new Date(a, m - 1 + meses, 1);
  const ultimo = new Date(alvo.getFullYear(), alvo.getMonth() + 1, 0).getDate();
  alvo.setDate(Math.min(d, ultimo));
  return isoDe(alvo);
}

export const mesDe = (iso: string) => iso.slice(0, 7);

export function somaMesesMes(mes: string, n: number): string {
  return somaMeses(`${mes}-01`, n).slice(0, 7);
}

export function ultimoDiaDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return isoDe(new Date(a, m, 0));
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const MESES_CURTOS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const DIAS = ['domingo', 'segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado'];

export function nomeMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number);
  return `${MESES[m - 1]} de ${a}`;
}

export const dataCurta = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`;
export const dataBR = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}`;

export function dataEixo(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MESES_CURTOS[Number(iso.slice(5, 7)) - 1]}`;
}

/** "Hoje", "Amanhã", "Ontem" ou "quarta, 18/11". */
export function dataAmigavel(iso: string, ref = hoje()): string {
  if (iso === ref) return 'Hoje';
  if (iso === somaDias(ref, 1)) return 'Amanhã';
  if (iso === somaDias(ref, -1)) return 'Ontem';
  return `${DIAS[dataDe(iso).getDay()]}, ${dataCurta(iso)}`;
}

export function diasEntre(de: string, ate: string): number {
  return Math.round((dataDe(ate).getTime() - dataDe(de).getTime()) / 86_400_000);
}

export function novoId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  }
}

/** "nov/26" para eixos de meses. */
export const mesCurto = (iso: string) => `${MESES_CURTOS[Number(iso.slice(5, 7)) - 1]}/${iso.slice(2, 4)}`;

/** Percentual de `v` sobre `base`, com duas casas (ex.: 12,34%). Sem base, mostra "–". */
export function pctDe(v: number, base: number): string {
  if (!base) return '–';
  return `${((v / base) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}%`;
}
