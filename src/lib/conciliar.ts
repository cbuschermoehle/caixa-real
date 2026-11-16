import type { Dados, Lancamento, Regra, Sentido, TransacaoExtrato } from '../types';
import { diasEntre, hoje, novoId } from './format';
import { normalizar } from './importar';

/** Tira números, datas e códigos da descrição para achar a "parte que se repete" (ex.: "PAGTO ENERGIA CELESC"). */
export function trechoDaDescricao(descricao: string): string {
  return normalizar(descricao)
    .split(/[\s\-/*:]+/)
    .filter((p) => p.length > 1 && !/\d/.test(p) && /[A-Z]/.test(p))
    .join(' ')
    .slice(0, 48)
    .trim();
}

export const sentidoDe = (t: TransacaoExtrato): Sentido => (t.valor > 0 ? 'entrada' : 'saida');

/** Regra que casa com a descrição: a de trecho mais longo, no mesmo sentido, com categoria ainda existente. */
export function regraPara(dados: Dados, t: TransacaoExtrato): Regra | undefined {
  const alvo = ` ${trechoDaDescricao(t.descricao)} `;
  const sentido = sentidoDe(t);
  const cats = new Set(dados.categorias.map((c) => c.id));
  return (dados.regras ?? [])
    .filter((r) => r.sentido === sentido && cats.has(r.categoriaId) && r.trecho && alvo.includes(` ${r.trecho} `))
    .sort((a, b) => b.trecho.length - a.trecho.length || b.usos - a.usos)[0];
}

/** Direção do lançamento na conta do extrato: +1 entra, −1 sai, 0 não mexe. */
function direcaoNaConta(l: Lancamento, contaId: string): number {
  if (l.tipo === 'entrada') return l.contaId === contaId ? 1 : 0;
  if (l.tipo === 'saida') return l.contaId === contaId ? -1 : 0;
  if (l.contaId === contaId) return -1;
  if (l.contaDestinoId === contaId) return 1;
  return 0;
}

/**
 * Lançamento que provavelmente é a mesma movimentação: mesma conta, mesmo valor e sentido,
 * até 3 dias de diferença, ainda não conciliado. Previstos têm prioridade; depois o mais próximo na data.
 */
export function vinculoPara(dados: Dados, t: TransacaoExtrato, jaUsados: Set<string> = new Set()): Lancamento | undefined {
  const alvo = Math.abs(t.valor);
  const dir = Math.sign(t.valor);
  return dados.lancamentos
    .filter((l) => !l.extratoId && !jaUsados.has(l.id) && l.valor === alvo && direcaoNaConta(l, t.contaId) === dir && Math.abs(diasEntre(l.data, t.data)) <= 3)
    .sort((a, b) => (a.status === b.status ? 0 : a.status === 'previsto' ? -1 : 1) || Math.abs(diasEntre(a.data, t.data)) - Math.abs(diasEntre(b.data, t.data)))[0];
}

export type Escolha =
  | { tipo: 'categoria'; categoriaId: string }
  | { tipo: 'vinculo'; lancamentoId: string }
  | { tipo: 'transferencia'; outraContaId: string };

/** Monta o que muda ao confirmar uma linha: a linha do extrato e o lançamento criado ou baixado. */
export function confirmarLinha(dados: Dados, t: TransacaoExtrato, e: Escolha): { transacao: TransacaoExtrato; lancamento: Lancamento } | null {
  const sentido = sentidoDe(t);
  const valor = Math.abs(t.valor);
  let lancamento: Lancamento;
  if (e.tipo === 'vinculo') {
    const l = dados.lancamentos.find((x) => x.id === e.lancamentoId);
    if (!l) return null;
    lancamento = { ...l, status: 'pago', data: t.data, extratoId: t.id };
  } else if (e.tipo === 'transferencia') {
    lancamento = {
      id: novoId(), tipo: 'transferencia', valor, data: t.data, status: 'pago',
      contaId: sentido === 'saida' ? t.contaId : e.outraContaId,
      contaDestinoId: sentido === 'saida' ? e.outraContaId : t.contaId,
      descricao: t.descricao, origem: 'extrato', criadoEm: hoje(), extratoId: t.id,
    };
  } else {
    lancamento = {
      id: novoId(), tipo: sentido, valor, data: t.data, status: 'pago', contaId: t.contaId,
      categoriaId: e.categoriaId, descricao: t.descricao, origem: 'extrato', criadoEm: hoje(), extratoId: t.id,
    };
  }
  return { transacao: { ...t, situacao: 'confirmada', lancamentoId: lancamento.id }, lancamento };
}

/** Aprende (ou reforça) a regra da descrição para a categoria escolhida. */
export function aprender(dados: Dados, t: TransacaoExtrato, categoriaId: string, novas: Regra[] = []): Regra | null {
  const trecho = trechoDaDescricao(t.descricao);
  if (trecho.length < 3) return null;
  const sentido = sentidoDe(t);
  const todas = [...novas, ...(dados.regras ?? [])];
  const existente = todas.find((r) => r.trecho === trecho && r.sentido === sentido);
  if (existente) return { ...existente, categoriaId, usos: existente.usos + 1 };
  return { id: novoId(), trecho, sentido, categoriaId, usos: 1 };
}

/** Divide uma linha do extrato em vários lançamentos (ex.: fatura do cartão). A soma precisa bater com o valor da linha. */
export function confirmarDividida(t: TransacaoExtrato, partes: { categoriaId: string; valor: number; descricao?: string }[]) {
  const soma = partes.reduce((a, p) => a + p.valor, 0);
  if (soma !== Math.abs(t.valor) || partes.some((p) => !p.categoriaId || p.valor <= 0)) return null;
  const sentido = sentidoDe(t);
  const lancs: Lancamento[] = partes.map((p) => ({
    id: novoId(), tipo: sentido, valor: p.valor, data: t.data, status: 'pago', contaId: t.contaId,
    categoriaId: p.categoriaId, descricao: p.descricao?.trim() || t.descricao, origem: 'extrato', criadoEm: hoje(), extratoId: t.id,
  }));
  return { transacao: { ...t, situacao: 'confirmada' as const, lancamentoId: lancs[0].id }, lancamento: lancs[0], extras: lancs.slice(1) };
}
