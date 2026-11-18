import type { Bem, Conta, Dados, Lancamento, TipoBem, TipoInvestimento } from '../types';
import { raiz } from './categorias';
import { saldoConta, ehDisponivel } from './calc';
import { ehCartao, resumoCartao } from './cartao';
import { hoje, mesDe, somaMesesMes, ultimoDiaDoMes } from './format';

/*
 * Investimentos (modo simples) e patrimônio do perfil pessoal.
 * Investimentos: cada corretora/carteira é uma conta do tipo "aplicação"; o valor de cada tipo
 * (ações, FIIs, cripto...) é digitado à mão de vez em quando. Sem cotação automática.
 * Patrimônio: o que tem (contas + investimentos + bens) menos o que deve (financiamentos e cartões).
 */

export const TIPOS_INVESTIMENTO: { id: TipoInvestimento; nome: string; ajuda?: string }[] = [
  { id: 'acoes', nome: 'Ações' },
  { id: 'fiis', nome: 'Fundos imobiliários (FIIs)' },
  { id: 'etfs', nome: 'ETFs' },
  { id: 'cripto', nome: 'Criptomoedas' },
  { id: 'exterior', nome: 'Exterior', ajuda: 'Ações, ETFs ou fundos fora do Brasil' },
  { id: 'renda_fixa', nome: 'Renda fixa e poupança' },
  { id: 'previdencia', nome: 'Previdência privada' },
];

export const nomeTipoInvestimento = (t: TipoInvestimento) => TIPOS_INVESTIMENTO.find((x) => x.id === t)?.nome ?? t;

export const TIPOS_BEM: { id: TipoBem; nome: string; ajuda: string }[] = [
  { id: 'imovel', nome: 'Imóvel', ajuda: 'Casa, apartamento, terreno. Use uma avaliação ou o valor de anúncios parecidos.' },
  { id: 'veiculo', nome: 'Veículo', ajuda: 'Carro, moto. Use o valor da tabela FIPE.' },
  { id: 'outro', nome: 'Outro bem', ajuda: 'Algo de valor que você venderia se precisasse.' },
];

export const ehInvestimento = (c: Conta | undefined) => !!c && c.tipo === 'aplicacao';

export interface ValorConta {
  conta: Conta;
  total: number;
  porTipo: Map<TipoInvestimento, number>;
  /** Data da avaliação mais recente usada (null = sem avaliação, usando o saldo da conta). */
  atualizadoEm: string | null;
}

/** Quanto vale uma corretora em `data`: últimos valores digitados por tipo, ou o saldo da conta se nunca foi avaliada. */
export function valorDaConta(dados: Dados, conta: Conta, data: string): ValorConta {
  const porTipo = new Map<TipoInvestimento, { data: string; valor: number }>();
  for (const a of dados.avaliacoes ?? []) {
    if (a.contaId !== conta.id || a.data > data) continue;
    const atual = porTipo.get(a.tipo);
    if (!atual || a.data >= atual.data) porTipo.set(a.tipo, { data: a.data, valor: a.valor });
  }
  if (porTipo.size === 0) {
    return { conta, total: saldoConta(dados, conta, data), porTipo: new Map(), atualizadoEm: null };
  }
  const valores = new Map([...porTipo].map(([t, x]) => [t, x.valor]));
  return {
    conta,
    total: [...valores.values()].reduce((a, v) => a + v, 0),
    porTipo: valores,
    atualizadoEm: [...porTipo.values()].reduce((a, x) => (x.data > a ? x.data : a), ''),
  };
}

export interface Carteira {
  total: number;
  porConta: ValorConta[];
  /** Soma por tipo (só do que foi avaliado por tipo). */
  porTipo: { tipo: TipoInvestimento; valor: number; pct: number }[];
  /** Valor das contas que ainda não têm divisão por tipo. */
  semTipo: number;
  /** % da carteira fora do Brasil (tipo Exterior). */
  pctExterior: number | null;
}

export function carteira(dados: Dados, data = hoje()): Carteira {
  const porConta = dados.contas
    .filter((c) => ehInvestimento(c) && (!c.arquivada || (dados.avaliacoes ?? []).some((a) => a.contaId === c.id)))
    .map((c) => valorDaConta(dados, c, data))
    .filter((v) => !v.conta.arquivada || v.total !== 0);
  const total = porConta.reduce((a, v) => a + v.total, 0);
  const soma = new Map<TipoInvestimento, number>();
  let semTipo = 0;
  for (const v of porConta) {
    if (!v.atualizadoEm) semTipo += v.total;
    for (const [t, x] of v.porTipo) soma.set(t, (soma.get(t) ?? 0) + x);
  }
  const porTipo = TIPOS_INVESTIMENTO.map((t) => ({ tipo: t.id, valor: soma.get(t.id) ?? 0, pct: total > 0 ? Math.round(((soma.get(t.id) ?? 0) / total) * 100) : 0 })).filter((x) => x.valor > 0);
  const exterior = soma.get('exterior') ?? 0;
  return { total, porConta, porTipo, semTipo, pctExterior: total > 0 ? Math.round((exterior / total) * 100) : null };
}

/**
 * Aportes, resgates e dividendos pagos entre duas datas (inclusive).
 * Aporte: transferência para uma corretora, ou saída numa categoria de Investimentos.
 * Resgate: transferência de uma corretora para outra conta.
 * Dividendo: entrada numa corretora, ou na categoria "Dividendos e rendimentos" (fica fora da renda).
 */
export function movimentoInvestimentos(dados: Dados, de: string, ate: string) {
  const contas = new Map(dados.contas.map((c) => [c.id, c]));
  const cats = new Map(dados.categorias.map((c) => [c.id, c]));
  let aportes = 0;
  let resgates = 0;
  let dividendos = 0;
  const listaDividendos: Lancamento[] = [];
  for (const l of dados.lancamentos) {
    if (l.status !== 'pago' || l.data < de || l.data > ate) continue;
    const origem = contas.get(l.contaId);
    if (l.tipo === 'transferencia') {
      const destino = contas.get(l.contaDestinoId ?? '');
      if (ehInvestimento(destino) && !ehInvestimento(origem)) aportes += l.valor;
      else if (ehInvestimento(origem) && !ehInvestimento(destino)) resgates += l.valor;
      continue;
    }
    const cat = l.categoriaId ? cats.get(l.categoriaId) : undefined;
    if (l.tipo === 'saida') {
      if (cat && raiz(cat, cats).bloco === 'investimentos') aportes += l.valor;
      continue;
    }
    if (ehDividendo(l, cat?.nome, origem)) {
      dividendos += l.valor;
      listaDividendos.push(l);
    }
  }
  return { aportes, resgates, dividendos, listaDividendos };
}

function ehDividendo(l: Lancamento, nomeCat: string | undefined, conta: Conta | undefined) {
  const nome = (nomeCat ?? '').toLowerCase();
  if (/resgat|empr[eé]stimo|reembolso|venda/.test(nome)) return false;
  return /dividend|rendiment|proventos|juros sobre/.test(nome) || (ehInvestimento(conta) && l.tipo === 'entrada');
}

/** Dividendos de cada um dos últimos `n` meses até `mesFim`. */
export function dividendosPorMes(dados: Dados, mesFim: string, n: number) {
  return Array.from({ length: n }, (_, i) => {
    const mes = somaMesesMes(mesFim, i - n + 1);
    return { mes, valor: movimentoInvestimentos(dados, `${mes}-01`, ultimoDiaDoMes(mes)).dividendos };
  });
}

// ---------- Patrimônio ----------

export const valorDoBem = (b: Bem, data: string): number | null => {
  let v: number | null = null;
  for (const x of b.valores) if (x.data <= data) v = x.valor;
  return v;
};

export const ultimoValor = (b: Bem) => b.valores[b.valores.length - 1];

export interface Divida {
  id: string;
  nome: string;
  valor: number;
  cartao: boolean;
  parcelas?: number;
  ultimoMes?: string;
}

export interface Patrimonio {
  data: string;
  contas: number;
  investimentos: number;
  bens: { bem: Bem; valor: number }[];
  totalBens: number;
  tenho: number;
  dividas: Divida[];
  devo: number;
  liquido: number;
}

/**
 * Foto do patrimônio em `data`.
 * Devo = parcelas que ainda faltam dos parcelamentos fora do cartão (financiamentos, empréstimos)
 * + compras no cartão ainda não pagas (inclui parcelas das próximas faturas).
 */
export function patrimonioEm(dados: Dados, data = hoje()): Patrimonio {
  const contas = dados.contas.filter(ehDisponivel).reduce((a, c) => a + saldoConta(dados, c, data), 0);
  const investimentos = carteira(dados, data).total;
  const bens = (dados.bens ?? [])
    .map((bem) => ({ bem, valor: valorDoBem(bem, data) }))
    .filter((x): x is { bem: Bem; valor: number } => x.valor !== null);
  const totalBens = bens.reduce((a, x) => a + x.valor, 0);

  const mapa = new Map(dados.contas.map((c) => [c.id, c]));
  const dividas: Divida[] = [];
  // Parcelamentos fora do cartão: começaram até `data` e ainda tinham parcelas depois dela (ou previstas em aberto).
  const series = new Map<string, Lancamento[]>();
  for (const l of dados.lancamentos) {
    if (l.tipo !== 'saida' || !l.serieId || !l.parcela || ehCartao(mapa.get(l.contaId))) continue;
    series.set(l.serieId, [...(series.get(l.serieId) ?? []), l]);
  }
  for (const [id, ls] of series) {
    if (!ls.some((l) => l.data <= data)) continue;
    const falta = ls.filter((l) => l.data > data || l.status === 'previsto').sort((a, b) => a.data.localeCompare(b.data));
    if (!falta.length) continue;
    const valor = falta.reduce((a, l) => a + l.valor, 0);
    dividas.push({ id, nome: falta[0].descricao || 'Parcelamento', valor, cartao: false, parcelas: falta.length, ultimoMes: mesDe(falta[falta.length - 1].data) });
  }
  for (const c of dados.contas) {
    if (!ehCartao(c)) continue;
    // Hoje: o que falta pagar das faturas (já desconta compras antigas pagas por fora). No passado: pelo saldo do cartão.
    const aberto = data >= hoje() ? resumoCartao(dados, c, data)?.usado ?? 0 : -saldoConta(dados, c, data);
    if (aberto > 0) dividas.push({ id: c.id, nome: c.nome, valor: aberto, cartao: true });
  }
  dividas.sort((a, b) => b.valor - a.valor);
  const devo = dividas.reduce((a, d) => a + d.valor, 0);
  const tenho = contas + investimentos + totalBens;
  return { data, contas, investimentos, bens, totalBens, tenho, dividas, devo, liquido: tenho - devo };
}

/** Patrimônio no fim de cada mês (até `n` meses), terminando hoje. Começa quando os dados começam. */
export function evolucaoPatrimonio(dados: Dados, ref = hoje(), n = 12) {
  const inicio = primeiraData(dados) ?? ref;
  const mesRef = mesDe(ref);
  const pontos: { data: string; tenho: number; devo: number; liquido: number; investimentos: number }[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const mes = somaMesesMes(mesRef, -i);
    const data = i === 0 ? ref : ultimoDiaDoMes(mes);
    if (data < inicio) continue;
    const p = patrimonioEm(dados, data);
    pontos.push({ data, tenho: p.tenho, devo: p.devo, liquido: p.liquido, investimentos: p.investimentos });
  }
  return pontos;
}

/** Data mais antiga com informação: saldo inicial de uma conta, avaliação ou valor de bem. */
function primeiraData(dados: Dados): string | null {
  const datas = [
    ...dados.contas.filter((c) => !c.arquivada).map((c) => c.dataSaldoInicial),
    ...(dados.avaliacoes ?? []).map((a) => a.data),
    ...(dados.bens ?? []).flatMap((b) => b.valores.map((v) => v.data)),
  ].sort();
  return datas[0] ?? null;
}
