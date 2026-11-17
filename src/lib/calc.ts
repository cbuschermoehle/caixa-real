import { nomeCategoria, raiz } from './categorias';
import type { Bloco, Categoria, Conta, Dados, Lancamento } from '../types';
import { diasEntre, mesDe, somaDias, ultimoDiaDoMes } from './format';

/**
 * Efeito de um lançamento no saldo de uma conta (em centavos).
 * Só lançamentos pagos e com data a partir do saldo inicial contam.
 */
export function efeitoNaConta(l: Lancamento, conta: Conta): number {
  if (l.data < conta.dataSaldoInicial) return 0;
  if (l.tipo === 'entrada') return l.contaId === conta.id ? l.valor : 0;
  if (l.tipo === 'saida') return l.contaId === conta.id ? -l.valor : 0;
  let e = 0;
  if (l.contaId === conta.id) e -= l.valor;
  if (l.contaDestinoId === conta.id) e += l.valor;
  return e;
}

/** Saldo real de uma conta no fim do dia `ate`. */
export function saldoConta(dados: Dados, conta: Conta, ate: string): number {
  let s = conta.dataSaldoInicial <= ate ? conta.saldoInicial : 0;
  for (const l of dados.lancamentos) {
    if (l.status !== 'pago' || l.data > ate) continue;
    s += efeitoNaConta(l, conta);
  }
  return s;
}

export const ehDisponivel = (c: Conta) => c.tipo !== 'aplicacao';

export interface Saldos {
  porConta: { conta: Conta; saldo: number }[];
  disponivel: number;
  aplicado: number;
  total: number;
}

export function saldos(dados: Dados, ate: string): Saldos {
  const porConta = dados.contas
    .map((conta) => ({ conta, saldo: saldoConta(dados, conta, ate) }))
    .filter((x) => !x.conta.arquivada || x.saldo !== 0);
  const disponivel = porConta.filter((x) => ehDisponivel(x.conta)).reduce((a, x) => a + x.saldo, 0);
  const total = porConta.reduce((a, x) => a + x.saldo, 0);
  return { porConta, disponivel, aplicado: total - disponivel, total };
}

/** Efeito de um lançamento no conjunto de contas disponíveis (ignora a data do saldo inicial). */
function efeitoNoDisponivel(l: Lancamento, contas: Map<string, Conta>): number {
  const disp = (id?: string) => {
    const c = id ? contas.get(id) : undefined;
    return !!c && ehDisponivel(c);
  };
  if (l.tipo === 'entrada') return disp(l.contaId) ? l.valor : 0;
  if (l.tipo === 'saida') return disp(l.contaId) ? -l.valor : 0;
  return (disp(l.contaDestinoId) ? l.valor : 0) - (disp(l.contaId) ? l.valor : 0);
}

export interface PontoProjecao {
  data: string;
  saldo: number;
  entradas: number;
  saidas: number;
}

/**
 * Projeção do dinheiro disponível: parte do saldo real de hoje e aplica os previstos dia a dia.
 * Previstos atrasados entram no dia de hoje.
 */
export function projecao(dados: Dados, inicio: string, dias: number) {
  const contas = new Map(dados.contas.map((c) => [c.id, c]));
  let saldo = saldos(dados, inicio).disponivel;
  const fim = somaDias(inicio, dias);
  const porDia = new Map<string, { e: number; s: number }>();
  for (const l of dados.lancamentos) {
    if (l.status !== 'previsto' || l.data > fim) continue;
    const dia = l.data < inicio ? inicio : l.data;
    const ef = efeitoNoDisponivel(l, contas);
    if (ef === 0) continue;
    const reg = porDia.get(dia) ?? { e: 0, s: 0 };
    if (ef > 0) reg.e += ef;
    else reg.s += -ef;
    porDia.set(dia, reg);
  }
  const pontos: PontoProjecao[] = [];
  let primeiroNegativo: string | null = null;
  let menor = { data: inicio, saldo: Infinity };
  for (let i = 0; i <= dias; i++) {
    const data = somaDias(inicio, i);
    const reg = porDia.get(data) ?? { e: 0, s: 0 };
    saldo += reg.e - reg.s;
    pontos.push({ data, saldo, entradas: reg.e, saidas: reg.s });
    if (saldo < 0 && !primeiroNegativo) primeiroNegativo = data;
    if (saldo < menor.saldo) menor = { data, saldo };
  }
  return { pontos, primeiroNegativo, menor };
}

// ---------- Relatório mensal em cascata ----------

export interface LinhaCategoria {
  categoria: Categoria;
  realizado: number;
  previsto: number;
  /** Detalhe por subcategoria (a soma já está na linha). "Sem subcategoria" = lançado direto na mãe. */
  subs?: LinhaCategoria[];
}

export interface TotalBloco {
  bloco: Bloco;
  realizado: number;
  previsto: number;
  linhas: LinhaCategoria[];
}

export interface Cascata {
  blocos: Record<Bloco, TotalBloco>;
  /** Cada resultado em [realizado, previsto em aberto]. */
  margem: [number, number];
  operacional: [number, number];
  aposInvestimentos: [number, number];
  variacao: [number, number];
}

/** Sinal do lançamento no relatório: entradas positivas, saídas negativas. */
const sinal = (l: Lancamento) => (l.tipo === 'entrada' ? 1 : -1);

export function cascata(dados: Dados, mes: string): Cascata {
  const cats = new Map(dados.categorias.map((c) => [c.id, c]));
  const blocos = {} as Record<Bloco, TotalBloco>;
  (['entradas', 'custos_variaveis', 'despesas_fixas', 'investimentos', 'outras'] as Bloco[]).forEach(
    (b) => (blocos[b] = { bloco: b, realizado: 0, previsto: 0, linhas: [] }),
  );
  const linhas = new Map<string, LinhaCategoria>();
  const subLinhas = new Map<string, LinhaCategoria>();
  for (const l of dados.lancamentos) {
    if (l.tipo === 'transferencia' || mesDe(l.data) !== mes || !l.categoriaId) continue;
    const propria = cats.get(l.categoriaId);
    if (!propria) continue;
    // Subcategoria soma dentro da categoria mãe.
    const cat = raiz(propria, cats);
    // Entradas e "outras" mantêm o sinal; os blocos de gasto somam valores positivos.
    const v = cat.bloco === 'outras' ? sinal(l) * l.valor : l.valor;
    let linha = linhas.get(cat.id);
    if (!linha) {
      linha = { categoria: cat, realizado: 0, previsto: 0, subs: [] };
      linhas.set(cat.id, linha);
      blocos[cat.bloco].linhas.push(linha);
    }
    let sub = subLinhas.get(propria.id);
    if (!sub) {
      sub = { categoria: propria === cat ? { ...cat, nome: 'Sem subcategoria', ordem: -1 } : propria, realizado: 0, previsto: 0 };
      subLinhas.set(propria.id, sub);
      linha.subs!.push(sub);
    }
    const k = l.status === 'pago' ? 'realizado' : 'previsto';
    linha[k] += v;
    sub[k] += v;
    blocos[cat.bloco][k] += v;
  }
  // Só mostra o detalhe quando existe ao menos uma subcategoria de verdade.
  for (const linha of linhas.values()) {
    if (!linha.subs!.some((x) => x.categoria.id !== linha.categoria.id)) delete linha.subs;
    else linha.subs!.sort((a, z) => a.categoria.ordem - z.categoria.ordem);
  }
  Object.values(blocos).forEach((b) => b.linhas.sort((a, z) => a.categoria.ordem - z.categoria.ordem));
  const r = (k: 'realizado' | 'previsto') => {
    const margem = blocos.entradas[k] - blocos.custos_variaveis[k];
    const operacional = margem - blocos.despesas_fixas[k];
    const aposInvestimentos = operacional - blocos.investimentos[k];
    const variacao = aposInvestimentos + blocos.outras[k];
    return { margem, operacional, aposInvestimentos, variacao };
  };
  const a = r('realizado');
  const b = r('previsto');
  return {
    blocos,
    margem: [a.margem, b.margem],
    operacional: [a.operacional, b.operacional],
    aposInvestimentos: [a.aposInvestimentos, b.aposInvestimentos],
    variacao: [a.variacao, b.variacao],
  };
}

/**
 * Ponto de equilíbrio do mês: primeiro dia em que a margem de contribuição acumulada
 * (entradas pagas menos custos variáveis pagos) cobre as despesas fixas do mês (pagas + previstas).
 */
export function pontoEquilibrio(dados: Dados, mes: string) {
  const cats = new Map(dados.categorias.map((c) => [c.id, c]));
  let fixas = 0;
  const margemDia = new Map<string, number>();
  for (const l of dados.lancamentos) {
    if (l.tipo === 'transferencia' || mesDe(l.data) !== mes || !l.categoriaId) continue;
    const cat = cats.get(l.categoriaId);
    if (!cat) continue;
    if (cat.bloco === 'despesas_fixas') fixas += l.valor;
    if (l.status !== 'pago') continue;
    if (cat.bloco === 'entradas') margemDia.set(l.data, (margemDia.get(l.data) ?? 0) + l.valor);
    if (cat.bloco === 'custos_variaveis') margemDia.set(l.data, (margemDia.get(l.data) ?? 0) - l.valor);
  }
  const fim = ultimoDiaDoMes(mes);
  let acumulada = 0;
  let dia: string | null = null;
  for (let d = `${mes}-01`; d <= fim; d = somaDias(d, 1)) {
    acumulada += margemDia.get(d) ?? 0;
    if (!dia && fixas > 0 && acumulada >= fixas) dia = d;
  }
  return { fixas, margemAcumulada: acumulada, dia, falta: Math.max(0, fixas - acumulada) };
}

// ---------- Painel ----------

/** Entradas e saídas pagas por dia (sem transferências). */
export function entradasSaidasPorDia(dados: Dados, inicio: string, fim: string) {
  const mapa = new Map<string, { e: number; s: number }>();
  for (const l of dados.lancamentos) {
    if (l.status !== 'pago' || l.tipo === 'transferencia' || l.data < inicio || l.data > fim) continue;
    const reg = mapa.get(l.data) ?? { e: 0, s: 0 };
    if (l.tipo === 'entrada') reg.e += l.valor;
    else reg.s += l.valor;
    mapa.set(l.data, reg);
  }
  const dias: { data: string; entradas: number; saidas: number }[] = [];
  for (let d = inicio; d <= fim; d = somaDias(d, 1)) {
    const reg = mapa.get(d) ?? { e: 0, s: 0 };
    dias.push({ data: d, entradas: reg.e, saidas: reg.s });
  }
  return dias;
}

/** Agrupa dias em semanas de 7 dias terminando em `fim`. */
export function porSemana(dados: Dados, fim: string, semanas: number) {
  const inicio = somaDias(fim, -(semanas * 7 - 1));
  const dias = entradasSaidasPorDia(dados, inicio, fim);
  const out: { data: string; entradas: number; saidas: number }[] = [];
  for (let i = 0; i < semanas; i++) {
    const fatia = dias.slice(i * 7, i * 7 + 7);
    out.push({
      data: fatia[0].data,
      entradas: fatia.reduce((a, x) => a + x.entradas, 0),
      saidas: fatia.reduce((a, x) => a + x.saidas, 0),
    });
  }
  return out;
}

export function previstosEntre(dados: Dados, de: string | null, ate: string) {
  return dados.lancamentos
    .filter((l) => l.status === 'previsto' && (de === null || l.data >= de) && l.data <= ate)
    .sort((a, b) => a.data.localeCompare(b.data) || b.valor - a.valor);
}

export function totaisPrevistos(lista: Lancamento[]) {
  let receber = 0;
  let pagar = 0;
  for (const l of lista) {
    if (l.tipo === 'entrada') receber += l.valor;
    else if (l.tipo === 'saida') pagar += l.valor;
  }
  return { receber, pagar, diferenca: receber - pagar };
}

export const diasDeAtraso = (l: Lancamento, ref: string) => Math.max(0, diasEntre(l.data, ref));

/** Entradas e saídas pagas por mês, nos `n` meses terminando em `fimMes` (AAAA-MM). */
export function porMes(dados: Dados, fimMes: string, n: number) {
  const meses: { data: string; entradas: number; saidas: number }[] = [];
  const idx = new Map<string, number>();
  for (let i = n - 1; i >= 0; i--) {
    const [a, m] = fimMes.split('-').map(Number);
    const d = new Date(a, m - 1 - i, 1);
    const chave = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    idx.set(chave, meses.length);
    meses.push({ data: `${chave}-01`, entradas: 0, saidas: 0 });
  }
  for (const l of dados.lancamentos) {
    if (l.status !== 'pago' || l.tipo === 'transferencia') continue;
    const i = idx.get(mesDe(l.data));
    if (i === undefined) continue;
    if (l.tipo === 'entrada') meses[i].entradas += l.valor;
    else meses[i].saidas += l.valor;
  }
  return meses;
}

export interface Serie {
  serieId: string;
  nome: string;
  categoria: string;
  tipo: 'entrada' | 'saida';
  restantes: number;
  total?: number;
  valorRestante: number;
  parcela: number;
  proxima: string;
  ultima: string;
}

/**
 * Compromissos de longo prazo: previstos somados por ano (até o último previsto)
 * e cada série (parcelamento ou conta mensal) com o que ainda falta.
 */
export function longoPrazo(dados: Dados, ref: string) {
  const cats = new Map(dados.categorias.map((c) => [c.id, c]));
  const anos = new Map<number, { receber: number; pagar: number }>();
  const series = new Map<string, Lancamento[]>();
  for (const l of dados.lancamentos) {
    if (l.status !== 'previsto' || l.tipo === 'transferencia') continue;
    const ano = Math.max(Number(l.data.slice(0, 4)), Number(ref.slice(0, 4)));
    const reg = anos.get(ano) ?? { receber: 0, pagar: 0 };
    if (l.tipo === 'entrada') reg.receber += l.valor;
    else reg.pagar += l.valor;
    anos.set(ano, reg);
    if (l.serieId) series.set(l.serieId, [...(series.get(l.serieId) ?? []), l]);
  }
  const porAno = [...anos.entries()].sort((a, b) => a[0] - b[0]).map(([ano, v]) => ({ ano, ...v }));
  const lista: Serie[] = [];
  for (const [serieId, ls] of series) {
    if (ls.length < 2) continue;
    ls.sort((a, b) => a.data.localeCompare(b.data));
    const ult = ls[ls.length - 1];
    lista.push({
      serieId,
      nome: ls[0].descricao || nomeCategoria(ls[0].categoriaId, cats) || 'Sem descrição',
      categoria: nomeCategoria(ls[0].categoriaId, cats),
      tipo: ls[0].tipo as 'entrada' | 'saida',
      restantes: ls.length,
      total: ult.parcela?.total,
      valorRestante: ls.reduce((a, l) => a + l.valor, 0),
      parcela: ls[0].valor,
      proxima: ls[0].data,
      ultima: ult.data,
    });
  }
  lista.sort((a, b) => b.ultima.localeCompare(a.ultima) || b.valorRestante - a.valorRestante);
  return { porAno, series: lista };
}
