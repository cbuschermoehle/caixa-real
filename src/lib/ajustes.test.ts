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
