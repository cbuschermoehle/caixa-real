import type { Bloco, Dados, Lancamento } from '../types';
import { raiz } from './categorias';
import { dataDeCaixa, ehCompraNoCartao } from './cartao';
import { hoje, mesDe, somaMesesMes } from './format';

/*
 * Fluxo de caixa futuro do perfil pessoal: quanto da renda de cada mês já está preso
 * em gastos essenciais, dívidas e parcelas do cartão, antes mesmo de o mês começar.
 * Usa o que já foi pago e o que está previsto (contas "todo mês", parcelas, faturas).
 */

export type Faixa = 'ok' | 'atencao' | 'alto';

export interface MesFuturo {
  mes: string;
  renda: number;
  essenciais: number;
  dividas: number;
  /** Parcelas de compras no cartão que não são gasto essencial nem dívida (ex.: TV em 10x). */
  parcelasCartao: number;
  /** Outros gastos já lançados ou previstos no mês (dia a dia, investimentos). */
  outros: number;
  comprometido: number;
  pct: number | null;
  faixa: Faixa | null;
}

/** Referência: até 50% tranquilo, até 70% atenção, acima disso apertado. */
export const faixaDe = (pct: number | null): Faixa | null => (pct === null ? null : pct <= 50 ? 'ok' : pct <= 70 ? 'atencao' : 'alto');

const vazioMes = (mes: string): MesFuturo => ({ mes, renda: 0, essenciais: 0, dividas: 0, parcelasCartao: 0, outros: 0, comprometido: 0, pct: null, faixa: null });

/** Meses de `inicio` (AAAA-MM) em diante, `n` meses. */
export function futuroMensal(dados: Dados, inicio: string, n: number): MesFuturo[] {
  const meses = Array.from({ length: n }, (_, i) => vazioMes(somaMesesMes(inicio, i)));
  const idx = new Map(meses.map((m, i) => [m.mes, i]));
  const cats = new Map(dados.categorias.map((c) => [c.id, c]));
  const contas = new Map(dados.contas.map((c) => [c.id, c]));
  for (const l of dados.lancamentos) {
    if (l.tipo === 'transferencia' || !l.categoriaId) continue;
    const i = idx.get(mesDe(dataDeCaixa(l, contas)));
    if (i === undefined) continue;
    const propria = cats.get(l.categoriaId);
    if (!propria) continue;
    const bloco: Bloco = raiz(propria, cats).bloco;
    const m = meses[i];
    const v = l.tipo === 'saida' ? l.valor : -l.valor;
    if (bloco === 'entradas') m.renda += l.valor;
    else if (bloco === 'despesas_fixas') m.essenciais += v;
    else if (bloco === 'dividas') m.dividas += v;
    else if (bloco === 'outras') continue;
    else if (l.parcela && ehCompraNoCartao(l, contas)) m.parcelasCartao += v;
    else m.outros += v;
  }
  for (const m of meses) {
    m.comprometido = m.essenciais + m.dividas + m.parcelasCartao;
    m.pct = m.renda > 0 ? Math.round((m.comprometido / m.renda) * 100) : null;
    m.faixa = faixaDe(m.pct);
  }
  return meses;
}

/** Renda comprometida de um mês só (painel e relatório). */
export const rendaComprometida = (dados: Dados, mes: string) => futuroMensal(dados, mes, 1)[0];

export interface Compromisso {
  serieId: string;
  nome: string;
  noCartao: boolean;
  /** Valor da próxima parcela. */
  parcela: number;
  restantes: number;
  total?: number;
  valorRestante: number;
  proximoMes: string;
  ultimoMes: string;
}

/**
 * Parcelamentos que ainda têm parcelas a pagar (financiamentos, empréstimos, compras parceladas no cartão),
 * do que termina antes para o que termina depois.
 */
export function compromissos(dados: Dados, ref = hoje()): Compromisso[] {
  const contas = new Map(dados.contas.map((c) => [c.id, c]));
  const cats = new Map(dados.categorias.map((c) => [c.id, c]));
  const series = new Map<string, Lancamento[]>();
  const mesRef = mesDe(ref);
  for (const l of dados.lancamentos) {
    if (l.tipo !== 'saida' || !l.serieId || !l.parcela) continue;
    const cartao = ehCompraNoCartao(l, contas);
    const quando = dataDeCaixa(l, contas);
    // Falta pagar: previsto, ou parcela do cartão numa fatura que ainda não venceu.
    const falta = cartao ? quando >= ref : l.status === 'previsto' && mesDe(quando) >= mesRef;
    if (!falta) continue;
    series.set(l.serieId, [...(series.get(l.serieId) ?? []), l]);
  }
  const lista: Compromisso[] = [];
  for (const [serieId, ls] of series) {
    const com = ls.map((l) => ({ l, quando: dataDeCaixa(l, contas) })).sort((a, b) => a.quando.localeCompare(b.quando));
    const primeiro = com[0].l;
    const cat = primeiro.categoriaId ? cats.get(primeiro.categoriaId) : undefined;
    lista.push({
      serieId,
      nome: primeiro.descricao || cat?.nome || 'Parcelamento',
      noCartao: ehCompraNoCartao(primeiro, contas),
      parcela: primeiro.valor,
      restantes: com.length,
      total: primeiro.parcela?.total,
      valorRestante: com.reduce((a, x) => a + x.l.valor, 0),
      proximoMes: mesDe(com[0].quando),
      ultimoMes: mesDe(com[com.length - 1].quando),
    });
  }
  return lista.sort((a, b) => a.ultimoMes.localeCompare(b.ultimoMes) || b.parcela - a.parcela);
}

/** Gasto do mês (pago + previsto) por categoria raiz, para comparar com o limite. */
export function limitesDoMes(dados: Dados, mes: string) {
  const cats = new Map(dados.categorias.map((c) => [c.id, c]));
  const contas = new Map(dados.contas.map((c) => [c.id, c]));
  const gasto = new Map<string, number>();
  for (const l of dados.lancamentos) {
    if (l.tipo === 'transferencia' || !l.categoriaId) continue;
    if (mesDe(dataDeCaixa(l, contas)) !== mes) continue;
    const c = cats.get(l.categoriaId);
    if (!c) continue;
    const r = raiz(c, cats);
    gasto.set(r.id, (gasto.get(r.id) ?? 0) + (l.tipo === 'saida' ? l.valor : -l.valor));
  }
  return dados.categorias
    .filter((c) => !c.paiId && c.limite && c.limite > 0 && c.sentido === 'saida')
    .map((c) => {
      const g = Math.max(0, gasto.get(c.id) ?? 0);
      const pct = Math.round((g / c.limite!) * 100);
      return { categoria: c, gasto: g, limite: c.limite!, pct, falta: c.limite! - g };
    })
    .sort((a, b) => b.pct - a.pct);
}
