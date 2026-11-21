import { describe, expect, it } from 'vitest';
import type { Categoria, Dados, Lancamento, TransacaoExtrato } from '../types';
import { planoDoRamo } from '../data/planos';
import { cascata } from './calc';
import { emArvore, nomeCategoria, rotuloDocumento } from './categorias';
import { confirmarLinha, previstosParaBaixa } from './conciliar';

const base = (): Dados => ({
  versao: 1,
  empresa: { id: 'e', nome: 'Teste', ramo: 'servicos', criadaEm: '2026-11-01' },
  contas: [
    { id: 'pj', nome: 'PJ', tipo: 'corrente', saldoInicial: 0, dataSaldoInicial: '2026-11-01', arquivada: false },
    { id: 'pj2', nome: 'PJ 2', tipo: 'corrente', saldoInicial: 0, dataSaldoInicial: '2026-11-01', arquivada: false },
  ],
  categorias: planoDoRamo('servicos'),
  lancamentos: [],
});
const cat = (d: Dados, nome: string) => d.categorias.find((c) => c.nome === nome)!;
let n = 0;
const l = (p: Partial<Lancamento>): Lancamento => ({
  id: `l${n++}`, tipo: 'saida', valor: 0, data: '2026-11-10', status: 'pago', contaId: 'pj', origem: 'manual', criadoEm: '2026-11-01', ...p,
});
const sub = (pai: Categoria, nome: string): Categoria => ({ ...pai, id: `sub-${nome}`, nome, paiId: pai.id, ordem: 900 + n++ });

describe('subcategorias', () => {
  it('somam dentro da categoria mãe e mostram o detalhe', () => {
    const d = base();
    const sal = cat(d, 'Salários');
    const a = sub(sal, 'Funcionário A');
    const b = sub(sal, 'Funcionário B');
    d.categorias.push(a, b);
    d.lancamentos.push(
      l({ categoriaId: a.id, valor: 300_000 }),
      l({ categoriaId: b.id, valor: 250_000, status: 'previsto' }),
      l({ categoriaId: sal.id, valor: 10_000 }),
    );
    const c = cascata(d, '2026-11');
    expect(c.blocos.despesas_fixas.realizado).toBe(310_000);
    expect(c.blocos.despesas_fixas.previsto).toBe(250_000);
    const linha = c.blocos.despesas_fixas.linhas.find((x) => x.categoria.id === sal.id)!;
    expect(linha.realizado).toBe(310_000);
    expect(linha.subs!.map((x) => [x.categoria.nome, x.realizado, x.previsto])).toEqual([
      ['Sem subcategoria', 10_000, 0],
      ['Funcionário A', 300_000, 0],
      ['Funcionário B', 0, 250_000],
    ]);
    expect(c.blocos.despesas_fixas.linhas.length).toBe(1);
  });
  it('categoria sem sub não mostra detalhe', () => {
    const d = base();
    d.lancamentos.push(l({ categoriaId: cat(d, 'Energia').id, valor: 1000 }));
    expect(cascata(d, '2026-11').blocos.despesas_fixas.linhas[0].subs).toBeUndefined();
  });
  it('nome e ordem nos seletores', () => {
    const d = base();
    const sal = cat(d, 'Salários');
    const a = sub(sal, 'Funcionário A');
    d.categorias.push(a);
    expect(nomeCategoria(a.id, d.categorias)).toBe('Salários › Funcionário A');
    const arv = emArvore(d.categorias.filter((c) => c.bloco === 'despesas_fixas'), d.categorias);
    const i = arv.findIndex((x) => x.c.id === sal.id);
    expect(arv[i + 1]).toEqual({ c: a, nivel: 1 });
  });
});

describe('OS e nota fiscal', () => {
  it('rótulo mostra os dois números', () => {
    expect(rotuloDocumento({ documento: { tipo: 'os', numero: '567' } })).toBe('OS 567');
    expect(rotuloDocumento({ documento: { tipo: 'pedido', numero: '88' }, nf: '1234' })).toBe('NF 1234 (Pedido 88)');
    expect(rotuloDocumento({ nf: '9' })).toBe('NF 9');
    expect(rotuloDocumento({})).toBe('');
  });
});

describe('baixa manual pelo extrato', () => {
  const linha = (valor: number, data = '2026-11-20', contaId = 'pj2'): TransacaoExtrato => ({
    id: `t${n++}`, contaId, importacaoId: 'i', chave: 'k', data, descricao: 'PAGTO BOLETO', valor, situacao: 'pendente',
  });
  it('lista previstos do mesmo sentido, mesmo com valor e data diferentes', () => {
    const d = base();
    const p = l({ status: 'previsto', valor: 10_000, data: '2026-11-01', categoriaId: cat(d, 'Energia').id });
    d.lancamentos.push(p, l({ status: 'previsto', tipo: 'entrada', valor: 10_000, categoriaId: cat(d, 'Serviços prestados').id }));
    expect(previstosParaBaixa(d, linha(-10_500)).map((x) => x.id)).toEqual([p.id]);
  });
  it('pago a mais: previsto fica igual e a diferença vira juros', () => {
    const d = base();
    const p = l({ status: 'previsto', valor: 10_000, data: '2026-11-01', categoriaId: cat(d, 'Energia').id, descricao: 'Luz' });
    d.lancamentos.push(p);
    const r = confirmarLinha(d, linha(-10_500), { tipo: 'vinculo', lancamentoId: p.id })!;
    expect(r.lancamento).toMatchObject({ id: p.id, valor: 10_000, status: 'pago', contaId: 'pj2', data: '2026-11-20' });
    expect(r.extras).toHaveLength(1);
    expect(r.extras![0]).toMatchObject({ tipo: 'saida', valor: 500, categoriaId: cat(d, 'Juros e multas por atraso').id, contaId: 'pj2' });
  });
  it('pago a menos: fica com o valor do banco e anota o desconto', () => {
    const d = base();
    const p = l({ status: 'previsto', valor: 10_000, categoriaId: cat(d, 'Energia').id, descricao: 'Luz' });
    d.lancamentos.push(p);
    const r = confirmarLinha(d, linha(-9_000), { tipo: 'vinculo', lancamentoId: p.id })!;
    expect(r.lancamento.valor).toBe(9_000);
    expect(r.lancamento.descricao).toContain('desconto');
    expect(r.extras).toBeUndefined();
  });
  it('recebido a mais vai para outras receitas', () => {
    const d = base();
    const p = l({ tipo: 'entrada', status: 'previsto', valor: 10_000, categoriaId: cat(d, 'Serviços prestados').id, nf: '12' });
    d.lancamentos.push(p);
    const r = confirmarLinha(d, linha(10_200), { tipo: 'vinculo', lancamentoId: p.id })!;
    expect(r.extras![0]).toMatchObject({ tipo: 'entrada', valor: 200, categoriaId: cat(d, 'Outras receitas').id });
    expect(r.lancamento.nf).toBe('12');
  });
});

import { reducer } from '../data/store';
describe('desfazer importação', () => {
  it('apaga linhas e lançamentos do arquivo e devolve previstos', () => {
    const d = base();
    const prev = l({ id: 'prev', status: 'previsto', valor: 500, categoriaId: cat(d, 'Energia').id });
    d.lancamentos.push(prev, l({ id: 'outro', valor: 100, categoriaId: cat(d, 'Energia').id }));
    d.importacoes = [{ id: 'imp', contaId: 'pj', arquivo: 'a.ofx', em: '2026-11-17', novas: 2, bloqueadas: 0 }];
    d.extrato = [
      { id: 't1', contaId: 'pj', importacaoId: 'imp', chave: 'k1', data: '2026-11-10', descricao: 'X', valor: -200, situacao: 'confirmada' },
      { id: 't2', contaId: 'pj', importacaoId: 'imp', chave: 'k2', data: '2026-11-11', descricao: 'Y', valor: -500, situacao: 'confirmada' },
    ];
    d.lancamentos.push(l({ id: 'novo', valor: 200, origem: 'extrato', extratoId: 't1', categoriaId: cat(d, 'Energia').id }));
    d.lancamentos = d.lancamentos.map((x) => (x.id === 'prev' ? { ...x, status: 'pago', extratoId: 't2' } : x));
    const r = reducer(d, { t: 'desfazerImportacao', id: 'imp' });
    expect(r.extrato).toEqual([]);
    expect(r.importacoes).toEqual([]);
    expect(r.lancamentos.map((x) => x.id).sort()).toEqual(['outro', 'prev']);
    expect(r.lancamentos.find((x) => x.id === 'prev')).toMatchObject({ status: 'previsto', extratoId: undefined });
  });
});

import { categoriaDoDesconto, confirmarDividida, somaDaDivisao } from './conciliar';
import { exclusaoDeCategoria } from './categorias';
describe('dividir com desconto (borderô de antecipação)', () => {
  const t: TransacaoExtrato = { id: 'tb', contaId: 'pj', importacaoId: 'i', chave: 'k', data: '2026-11-20', descricao: 'CREDITO BORDERO', valor: 529_305, situacao: 'pendente' };
  const receitas = [56_000, 230_000, 15_000, 10_384, 227_000].map((valor, i) => ({ categoriaId: 'venda', valor, descricao: `Cliente ${i + 1}` }));
  it('receita cheia por cliente menos os juros fecha no líquido do extrato', () => {
    const d = base();
    const juros = categoriaDoDesconto(d, t)!;
    expect(juros.nome).toBe('Juros e taxas de antecipação');
    const partes = [...receitas, { categoriaId: juros.id, valor: 9_079, sentido: 'saida' as const }];
    expect(somaDaDivisao(t, partes)).toBe(529_305);
    const r = confirmarDividida(t, partes)!;
    const todos = [r.lancamento, ...r.extras];
    expect(r.lancamento.tipo).toBe('entrada');
    expect(todos.filter((x) => x.tipo === 'entrada').reduce((a, x) => a + x.valor, 0)).toBe(538_384);
    expect(todos.filter((x) => x.tipo === 'saida').map((x) => [x.valor, x.categoriaId])).toEqual([[9_079, juros.id]]);
    expect(todos.every((x) => x.extratoId === 'tb' && x.contaId === 'pj')).toBe(true);
  });
  it('recusa quando o desconto não fecha ou quando só há desconto', () => {
    expect(confirmarDividida(t, receitas)).toBeNull();
    expect(confirmarDividida(t, [...receitas, { categoriaId: 'j', valor: 9_000, sentido: 'saida' }])).toBeNull();
    expect(confirmarDividida({ ...t, valor: -100 }, [{ categoriaId: 'j', valor: 100, sentido: 'entrada' }])).toBeNull();
  });
  it('saída com uma parte de estorno (simétrico)', () => {
    const s = { ...t, valor: -50_000 };
    const r = confirmarDividida(s, [{ categoriaId: 'a', valor: 30_000 }, { categoriaId: 'b', valor: 25_000 }, { categoriaId: 'c', valor: 5_000, sentido: 'entrada' }])!;
    expect([r.lancamento, ...r.extras].map((x) => [x.tipo, x.valor])).toEqual([['saida', 30_000], ['saida', 25_000], ['entrada', 5_000]]);
  });
});

describe('excluir categoria', () => {
  it('exclui (com subcategorias e regras) só quando não há lançamentos', () => {
    const d = base();
    const en = cat(d, 'Energia');
    const s1 = sub(en, 'Matriz');
    d.categorias.push(s1);
    d.regras = [{ id: 'r', trecho: 'CELESC', sentido: 'saida', categoriaId: s1.id, usos: 1 }];
    expect(exclusaoDeCategoria(d, en.id)).toEqual({ ids: [en.id, s1.id], lancamentos: 0, subs: 1 });
    const r = reducer(d, { t: 'excluirCategoria', id: en.id });
    expect(r.categorias.some((c) => c.id === en.id || c.id === s1.id)).toBe(false);
    expect(r.regras).toEqual([]);
  });
  it('não exclui se a categoria ou uma subcategoria tem lançamento', () => {
    const d = base();
    const en = cat(d, 'Energia');
    const s1 = sub(en, 'Filial');
    d.categorias.push(s1);
    d.lancamentos.push(l({ valor: 100, categoriaId: s1.id }));
    expect(exclusaoDeCategoria(d, en.id).lancamentos).toBe(1);
    expect(reducer(d, { t: 'excluirCategoria', id: en.id })).toBe(d);
    expect(reducer(d, { t: 'excluirCategoria', id: s1.id })).toBe(d);
  });
});
