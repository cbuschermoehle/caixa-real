import type { Categoria, Conta, Dados, Lancamento } from '../types';
import { raiz } from './categorias';
import { ehCartao } from './cartao';
import { diasEntre, hoje, novoId, somaDias, somaMeses } from './format';

/*
 * Avisos do perfil pessoal:
 * - Repasses da empresa: distribuição de lucros e pró-labore lançados na empresa aparecem no pessoal
 *   para trazer com um toque (vira uma entrada ligada à da empresa).
 * - Renovações anuais: seguro, IPVA, IPTU. Um mês antes de completar um ano do último pagamento, o app lembra.
 */

const ehPessoalD = (d: Dados) => d.empresa?.tipo === 'pessoal';
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

/** Categoria da empresa que é dinheiro indo para o sócio. */
export function tipoRepasse(nomeCategoria: string): 'prolabore' | 'lucros' | null {
  const n = norm(nomeCategoria);
  if (n.includes('pro-labore') || n.includes('pro labore') || n.includes('prolabore')) return 'prolabore';
  if (n.includes('distribuicao de lucro') || n.includes('lucros') || n.includes('retirada')) return 'lucros';
  return null;
}

export interface Repasse {
  /** Lançamento na empresa. */
  origem: Lancamento;
  perfilId: string;
  empresa: string;
  tipo: 'prolabore' | 'lucros';
  /** Entrada já trazida para o pessoal, se houver. */
  vinculado?: Lancamento;
  /** O da empresa mudou depois de trazido (valor, data, ou foi pago lá e aqui ainda está previsto). */
  mudou: boolean;
}

/**
 * Repasses da empresa dos últimos 60 dias até 12 meses à frente que ainda não estão no pessoal
 * (ou que mudaram na empresa depois de trazidos). Os marcados "não é meu" ficam de fora.
 */
export function repassesPendentes(pessoal: Dados, perfis: Dados[], ref = hoje()): Repasse[] {
  if (!ehPessoalD(pessoal)) return [];
  const de = somaDias(ref, -60);
  const ate = somaMeses(ref, 12);
  const ignorados = new Set(pessoal.repassesIgnorados ?? []);
  const trazidos = new Map(pessoal.lancamentos.filter((l) => l.repasse).map((l) => [l.repasse!.lancamentoId, l]));
  const lista: Repasse[] = [];
  for (const p of perfis) {
    if (!p.empresa || ehPessoalD(p)) continue;
    const cats = new Map(p.categorias.map((c) => [c.id, c]));
    for (const l of p.lancamentos) {
      if (l.tipo !== 'saida' || !l.categoriaId || l.data < de || l.data > ate || ignorados.has(l.id)) continue;
      const c = cats.get(l.categoriaId);
      if (!c) continue;
      const tipo = tipoRepasse(c.nome) ?? tipoRepasse(raiz(c, cats).nome);
      if (!tipo) continue;
      const vinculado = trazidos.get(l.id);
      const mudou = !!vinculado && (vinculado.valor !== l.valor || vinculado.data !== l.data || (l.status === 'pago' && vinculado.status === 'previsto'));
      if (vinculado && !mudou) continue;
      lista.push({ origem: l, perfilId: p.empresa.id, empresa: p.empresa.nome, tipo, vinculado, mudou });
    }
  }
  return lista.sort((a, b) => a.origem.data.localeCompare(b.origem.data));
}

/** Categoria de renda do pessoal para o repasse (Pró-labore ou Distribuição de lucros). */
function categoriaDoRepasse(pessoal: Dados, tipo: Repasse['tipo']): Categoria | undefined {
  const rendas = pessoal.categorias.filter((c) => c.bloco === 'entradas' && c.sentido === 'entrada' && !c.oculta);
  return rendas.find((c) => tipoRepasse(c.nome) === tipo) ?? rendas.find((c) => tipoRepasse(c.nome)) ?? rendas[0];
}

/** Conta do pessoal que recebe: a primeira conta corrente ativa (ou outra que não seja cartão nem aplicação). */
function contaQueRecebe(pessoal: Dados): Conta | undefined {
  const ativas = pessoal.contas.filter((c) => !c.arquivada && !ehCartao(c) && c.tipo !== 'aplicacao');
  return ativas.find((c) => c.tipo === 'corrente') ?? ativas[0];
}

/** Monta (ou atualiza) a entrada do pessoal para um repasse. */
export function entradaDoRepasse(pessoal: Dados, r: Repasse): Lancamento | null {
  if (r.vinculado) return { ...r.vinculado, valor: r.origem.valor, data: r.origem.data, status: r.origem.status === 'pago' ? 'pago' : r.vinculado.status };
  const cat = categoriaDoRepasse(pessoal, r.tipo);
  const conta = contaQueRecebe(pessoal);
  if (!cat || !conta) return null;
  return {
    id: novoId(), tipo: 'entrada', valor: r.origem.valor, data: r.origem.data, status: r.origem.status,
    contaId: conta.id, categoriaId: cat.id, descricao: r.origem.descricao || `${cat.nome} (${r.empresa})`,
    origem: 'manual', criadoEm: hoje(), repasse: { perfilId: r.perfilId, lancamentoId: r.origem.id },
  };
}

// ---------- Renovações anuais ----------

export interface Renovacao {
  chave: string;
  categoria: Categoria;
  /** Quando foi o último pagamento (ou a primeira parcela, se parcelado). */
  ultima: string;
  /** Quando deve vencer de novo (um ano depois). */
  proxima: string;
  /** Total pago da última vez (soma das parcelas). */
  valor: number;
  parcelas: number;
  /** Dias até a próxima (negativo = já passou). */
  dias: number;
}

/** Seguros e impostos anuais do pessoal: grupo "Seguros e impostos" ou nome com seguro, IPVA, IPTU, licenciamento. */
export function ehAnual(c: Categoria) {
  return c.sentido === 'saida' && (c.grupo === 'Seguros e impostos' || /seguro|ipva|iptu|licenciamento/.test(norm(c.nome)));
}

/** Renovações que vencem de 30 dias atrás até 30 dias à frente e ainda não foram lançadas nem dispensadas. */
export function renovacoesChegando(dados: Dados, ref = hoje()): Renovacao[] {
  if (!ehPessoalD(dados)) return [];
  const cats = new Map(dados.categorias.map((c) => [c.id, c]));
  const vistos = new Set(dados.lembretesVistos ?? []);
  // Início de cada compra: parcelas de uma série contam como uma só (a data da primeira).
  const inicios = new Map<string, { data: string; valor: number; parcelas: number }[]>();
  const series = new Map<string, Lancamento[]>();
  for (const l of dados.lancamentos) {
    if (l.tipo !== 'saida' || !l.categoriaId) continue;
    const c = cats.get(l.categoriaId);
    if (!c || !ehAnual(c)) continue;
    if (l.serieId && l.parcela) {
      series.set(l.serieId, [...(series.get(l.serieId) ?? []), l]);
      continue;
    }
    inicios.set(c.id, [...(inicios.get(c.id) ?? []), { data: l.data, valor: l.valor, parcelas: 1 }]);
  }
  for (const ls of series.values()) {
    const primeira = ls.reduce((a, l) => (l.data < a.data ? l : a));
    const id = primeira.categoriaId!;
    inicios.set(id, [...(inicios.get(id) ?? []), { data: primeira.data, valor: ls.reduce((a, l) => a + l.valor, 0), parcelas: ls.length }]);
  }
  const lista: Renovacao[] = [];
  for (const [id, xs] of inicios) {
    const ultima = xs.reduce((a, x) => (x.data > a.data ? x : a));
    const proxima = somaMeses(ultima.data, 12);
    const dias = diasEntre(ref, proxima);
    const chave = `${id}|${proxima}`;
    if (dias > 30 || dias < -30 || vistos.has(chave)) continue;
    lista.push({ chave, categoria: cats.get(id)!, ultima: ultima.data, proxima, valor: ultima.valor, parcelas: ultima.parcelas, dias });
  }
  return lista.sort((a, b) => a.proxima.localeCompare(b.proxima));
}
