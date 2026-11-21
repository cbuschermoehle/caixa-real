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
    .filter((l) => livreParaLinha(dados, l, t) && !jaUsados.has(l.id) && l.valor === alvo && direcaoNaConta(l, t.contaId) === dir && (Math.abs(diasEntre(l.data, t.data)) <= 3 || mesmaFatura(l, t)))
    .sort((a, b) => Number(mesmaFatura(b, t)) - Number(mesmaFatura(a, t)) || (a.status === b.status ? 0 : a.status === 'previsto' ? -1 : 1) || Math.abs(diasEntre(a.data, t.data)) - Math.abs(diasEntre(b.data, t.data)))[0];
}

/**
 * O lançamento ainda pode ser ligado a esta linha do extrato?
 * Sim se não foi conciliado. Uma transferência tem duas pontas: se já foi ligada à linha de uma conta,
 * ainda pode receber a linha da outra conta (ex.: importou a Viacredi e agora importa a Caixa).
 */
export function livreParaLinha(dados: Dados, l: Lancamento, t: TransacaoExtrato): boolean {
  if (!l.extratoId) return true;
  if (l.tipo !== 'transferencia' || l.extratoOutraPontaId) return false;
  const primeira = (dados.extrato ?? []).find((x) => x.id === l.extratoId);
  return !!primeira && primeira.contaId !== t.contaId;
}

/** Transferência já conciliada pela outra conta: esta linha é só a outra ponta dela. */
export const ehOutraPonta = (l: Lancamento) => l.tipo === 'transferencia' && !!l.extratoId;

/** Compra já lançada no cartão na mesma fatura do arquivo importado (ex.: parcela 6/6 lançada à mão). */
const mesmaFatura = (l: Lancamento, t: TransacaoExtrato) => !!t.fatura && l.tipo !== 'transferencia' && l.fatura === t.fatura;

export type Escolha =
  | { tipo: 'categoria'; categoriaId: string }
  | { tipo: 'vinculo'; lancamentoId: string }
  | { tipo: 'transferencia'; outraContaId: string };

/** Monta o que muda ao confirmar uma linha: a linha do extrato e o lançamento criado ou baixado. */
export function confirmarLinha(dados: Dados, t: TransacaoExtrato, e: Escolha): { transacao: TransacaoExtrato; lancamento: Lancamento; extras?: Lancamento[] } | null {
  const sentido = sentidoDe(t);
  const valor = Math.abs(t.valor);
  let lancamento: Lancamento;
  let extras: Lancamento[] | undefined;
  if (e.tipo === 'vinculo') {
    const l = dados.lancamentos.find((x) => x.id === e.lancamentoId);
    if (!l) return null;
    if (ehOutraPonta(l)) {
      // Segunda ponta da mesma transferência: não muda valor nem data, só registra a linha desta conta.
      return { transacao: { ...t, situacao: 'confirmada', lancamentoId: l.id }, lancamento: { ...l, extratoOutraPontaId: t.id } };
    }
    // Transferência (ex.: pagamento de fatura do cartão) fica com o valor que saiu de verdade no banco.
    const conta = l.tipo === 'transferencia' ? { valor } : { contaId: t.contaId };
    lancamento = { ...l, ...conta, status: 'pago', data: t.data, extratoId: t.id };
    const d = diferencaDaBaixa(dados, l, valor);
    if (d?.tipo === 'juros') {
      // Pagou/recebeu a mais: o previsto fica com o valor original e a diferença vira um lançamento separado.
      extras = [{
        id: novoId(), tipo: l.tipo as Sentido, valor: d.valor, data: t.data, status: 'pago', contaId: t.contaId,
        categoriaId: d.categoriaId, descricao: `${l.tipo === 'saida' ? 'Juros/multa' : 'Acréscimo recebido'}: ${l.descricao || t.descricao}`,
        origem: 'extrato', criadoEm: hoje(), extratoId: t.id,
      }];
    } else if (d) {
      // Pagou/recebeu a menos (desconto) ou sem categoria de juros: o lançamento fica com o valor do banco.
      lancamento = { ...lancamento, valor, descricao: [l.descricao, d.nota].filter(Boolean).join(' ') };
    }
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
      ...(t.fatura ? { fatura: t.fatura } : {}),
    };
  }
  return { transacao: { ...t, situacao: 'confirmada', lancamentoId: lancamento.id }, lancamento, extras };
}

/** Categoria que recebe a diferença a mais: juros/multa por atraso (saída) ou outras receitas (entrada). */
function categoriaDaDiferenca(dados: Dados, sentido: Sentido) {
  const nomes = sentido === 'saida' ? ['Juros e multas por atraso'] : ['Outras receitas'];
  return dados.categorias.find((c) => nomes.includes(c.nome) && c.sentido === sentido && !c.paiId);
}

/**
 * O que acontece quando o valor do banco é diferente do previsto.
 * A mais: diferença vai para juros (saída) ou outras receitas (entrada). A menos: desconto, o lançamento fica com o valor do banco.
 */
export function diferencaDaBaixa(dados: Dados, l: Lancamento, valorBanco: number):
  | { tipo: 'juros'; valor: number; categoriaId: string; nomeCategoria: string }
  | { tipo: 'ajuste'; valor: number; nota: string }
  | null {
  const dif = valorBanco - l.valor;
  if (dif === 0 || l.tipo === 'transferencia') return null;
  if (dif > 0) {
    const cat = categoriaDaDiferenca(dados, l.tipo);
    if (cat) return { tipo: 'juros', valor: dif, categoriaId: cat.id, nomeCategoria: cat.nome };
    return { tipo: 'ajuste', valor: dif, nota: `(previsto ${fmt(l.valor)}, acréscimo de ${fmt(dif)})` };
  }
  return { tipo: 'ajuste', valor: -dif, nota: `(previsto ${fmt(l.valor)}, desconto de ${fmt(-dif)})` };
}

const fmt = (c: number) => (c / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });

/** Contas previstas em aberto no mesmo sentido da linha do extrato, das mais próximas na data para as mais distantes. */
export function previstosParaBaixa(dados: Dados, t: TransacaoExtrato, excluir: Set<string> = new Set(), limite = 40): Lancamento[] {
  const sentido = sentidoDe(t);
  return dados.lancamentos
    .filter((l) => l.status === 'previsto' && !l.extratoId && !excluir.has(l.id) && (l.tipo === sentido || (l.tipo === 'transferencia' && direcaoNaConta(l, t.contaId) === Math.sign(t.valor))))
    .sort((a, b) => Math.abs(diasEntre(a.data, t.data)) - Math.abs(diasEntre(b.data, t.data)) || Math.abs(a.valor - Math.abs(t.valor)) - Math.abs(b.valor - Math.abs(t.valor)))
    .slice(0, limite);
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

/** Parte de uma linha dividida. `sentido` diferente do da linha = desconto (ex.: juros da antecipação num borderô). */
export interface ParteDivisao { categoriaId: string; valor: number; descricao?: string; sentido?: Sentido }

/** Quanto a divisão soma no sentido da linha: partes do mesmo sentido somam, as de sentido oposto (descontos) subtraem. */
export function somaDaDivisao(t: TransacaoExtrato, partes: ParteDivisao[]): number {
  const sentido = sentidoDe(t);
  return partes.reduce((a, p) => a + ((p.sentido ?? sentido) === sentido ? p.valor : -p.valor), 0);
}

/**
 * Divide uma linha do extrato em vários lançamentos (ex.: fatura do cartão, ou borderô com receita cheia por cliente
 * menos os juros da antecipação). Partes no mesmo sentido menos os descontos precisam fechar o valor da linha.
 */
export function confirmarDividida(t: TransacaoExtrato, partes: ParteDivisao[]) {
  const sentido = sentidoDe(t);
  if (somaDaDivisao(t, partes) !== Math.abs(t.valor) || partes.some((p) => !p.categoriaId || p.valor <= 0)) return null;
  // A primeira parte precisa ser do sentido da linha (é ela que fica ligada à linha do extrato).
  const ordenadas = [...partes.filter((p) => (p.sentido ?? sentido) === sentido), ...partes.filter((p) => (p.sentido ?? sentido) !== sentido)];
  const lancs: Lancamento[] = ordenadas.map((p) => ({
    id: novoId(), tipo: p.sentido ?? sentido, valor: p.valor, data: t.data, status: 'pago', contaId: t.contaId,
    categoriaId: p.categoriaId, descricao: p.descricao?.trim() || t.descricao, origem: 'extrato', criadoEm: hoje(), extratoId: t.id,
    ...(t.fatura ? { fatura: t.fatura } : {}),
  }));
  return { transacao: { ...t, situacao: 'confirmada' as const, lancamentoId: lancs[0].id }, lancamento: lancs[0], extras: lancs.slice(1) };
}

/** Categoria sugerida para o desconto: juros de antecipação (numa entrada) ou estorno/outras receitas (numa saída). */
export function categoriaDoDesconto(dados: Dados, t: TransacaoExtrato) {
  const oposto: Sentido = sentidoDe(t) === 'entrada' ? 'saida' : 'entrada';
  const nomes = oposto === 'saida' ? ['juros e taxas de antecipacao', 'tarifas bancarias'] : ['outras receitas'];
  const cats = dados.categorias.filter((c) => c.sentido === oposto && !c.oculta);
  for (const n of nomes) {
    const c = cats.find((x) => normalizar(x.nome) === normalizar(n));
    if (c) return c;
  }
  return undefined;
}
