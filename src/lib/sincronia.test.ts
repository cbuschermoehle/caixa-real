import { describe, expect, it } from 'vitest';
import type { Dados, Lancamento, TransacaoExtrato } from '../types';
import { planoDoRamo } from '../data/planos';
import { guardarCofre, abrirCofre, reducer, refazer, religarExtrato } from '../data/store';
import { conferenciaDoMes } from './calc';
import { confirmarLinha } from './conciliar';
import { pctDe } from './format';

const base = (): Dados => ({
  versao: 1,
  empresa: { id: 'e', nome: 'Teste', ramo: 'servicos', criadaEm: '2026-01-01' },
  contas: [{ id: 'a', nome: 'Banco A', tipo: 'corrente', saldoInicial: 100_000, dataSaldoInicial: '2026-01-01', arquivada: false }],
  categorias: planoDoRamo('servicos'),
  lancamentos: [],
  extrato: [],
});
const linha = (id: string, valor: number, data = '2026-01-05'): TransacaoExtrato => ({
  id, contaId: 'a', importacaoId: 'imp', chave: id, data, descricao: `LINHA ${id}`, valor, situacao: 'pendente',
});
const saida = (d: Dados) => d.categorias.find((c) => c.sentido === 'saida')!.id;
const manual = (d: Dados, id: string, valor: number, data = '2026-01-10'): Lancamento => ({
  id, tipo: 'saida', valor, data, status: 'pago', contaId: 'a', categoriaId: saida(d), origem: 'manual', criadoEm: '2026-01-01',
});

/** Duas linhas confirmadas; a primeira com o lançamento editado numa versão antiga (sem a ligação). */
function comLinhasConfirmadas() {
  let d = base();
  const l1 = linha('l1', -5_000);
  const l2 = linha('l2', -7_000);
  d = { ...d, extrato: [l1, l2] };
  const r1 = confirmarLinha(d, l1, { tipo: 'categoria', categoriaId: saida(d) })!;
  const r2 = confirmarLinha(d, l2, { tipo: 'categoria', categoriaId: saida(d) })!;
  d = reducer(d, { t: 'conciliar', itens: [r1, r2] });
  return { d, r1, r2 };
}

describe('linhas confirmadas do extrato não voltam sozinhas para revisão', () => {
  it('excluir outro lançamento não mexe numa linha cujo lançamento perdeu a ligação', () => {
    const { d: d0, r1 } = comLinhasConfirmadas();
    // Como ficava depois de editar o lançamento numa versão antiga: sem extratoId.
    let d = reducer(d0, { t: 'lancamento', lancamento: { ...r1.lancamento, extratoId: undefined } });
    d = reducer(d, { t: 'lancamentos', lancamentos: [manual(d, 'x', 1_000)] });
    d = reducer(d, { t: 'excluir', ids: ['x'] });
    expect(d.extrato!.map((t) => t.situacao)).toEqual(['confirmada', 'confirmada']);
  });

  it('excluir o lançamento de uma linha devolve só essa linha', () => {
    const { d: d0, r2 } = comLinhasConfirmadas();
    const d = reducer(d0, { t: 'excluir', ids: [r2.lancamento.id] });
    expect(d.extrato!.map((t) => t.situacao)).toEqual(['confirmada', 'pendente']);
  });

  it('ao abrir, religa o lançamento que tinha perdido a ligação', () => {
    const { d: d0, r1 } = comLinhasConfirmadas();
    const d = reducer(d0, { t: 'lancamento', lancamento: { ...r1.lancamento, extratoId: undefined } });
    const curado = religarExtrato(d);
    expect(curado.lancamentos.find((l) => l.id === r1.lancamento.id)!.extratoId).toBe('l1');
    expect(religarExtrato(curado)).toBe(curado);
  });
});

describe('dois aparelhos ao mesmo tempo', () => {
  it('refaz por cima da nuvem o que foi feito aqui, sem perder o que foi feito lá', () => {
    const { d: inicio } = comLinhasConfirmadas();
    const l3 = linha('l3', -2_000);
    const comL3 = { ...inicio, extrato: [...inicio.extrato!, l3] };
    // Lá: lançou uma saída à mão.
    const nuvem = reducer(comL3, { t: 'lancamentos', lancamentos: [manual(comL3, 'la', 3_000)] });
    // Aqui (ainda com a versão antiga): confirmou a linha 3.
    const r3 = confirmarLinha(comL3, l3, { tipo: 'categoria', categoriaId: saida(comL3) })!;
    const juntos = refazer(nuvem, [{ a: { t: 'conciliar', itens: [r3] }, perfil: 'e' }]);
    expect(juntos.lancamentos.map((l) => l.id)).toContain('la');
    expect(juntos.extrato!.every((t) => t.situacao === 'confirmada')).toBe(true);
    expect(juntos.lancamentos.length).toBe(4);
  });

  it('refazer duas vezes não duplica lançamentos', () => {
    const d = base();
    const fila = [{ a: { t: 'lancamentos' as const, lancamentos: [manual(d, 'n1', 1_000), manual(d, 'n2', 2_000)] }, perfil: 'e' }];
    const uma = refazer(d, fila);
    const duas = refazer(uma, fila);
    expect(duas.lancamentos.length).toBe(2);
  });

  it('mudança feita em outro perfil vai para o perfil certo', () => {
    const empresa = base();
    const pessoal: Dados = { ...base(), empresa: { id: 'p', nome: 'Pessoal', ramo: 'servicos', criadaEm: '2026-01-01', tipo: 'pessoal' } };
    const guardado = guardarCofre([empresa, pessoal]);
    const juntos = refazer(guardado, [{ a: { t: 'lancamentos', lancamentos: [manual(pessoal, 'pp', 500)] }, perfil: 'p' }]);
    const perfis = abrirCofre(juntos).perfis;
    expect(perfis[0].lancamentos.length).toBe(0);
    expect(perfis[1].lancamentos.map((l) => l.id)).toEqual(['pp']);
  });
});

describe('conferência do fechamento', () => {
  it('bate quando todos os lançamentos são depois do saldo inicial', () => {
    const d = base();
    d.lancamentos.push(manual(d, 'm', 10_000));
    const c = conferenciaDoMes(d, '2026-01');
    expect(c.diferenca).toBe(0);
    expect(c.antesDoInicio).toEqual([]);
  });

  it('aponta lançamento com data antes do saldo inicial da conta', () => {
    const d = base();
    d.contas[0] = { ...d.contas[0], dataSaldoInicial: '2026-01-15' };
    d.lancamentos.push(manual(d, 'm', 10_000, '2026-01-10'));
    const c = conferenciaDoMes(d, '2026-01');
    expect(c.diferenca).not.toBe(0);
    expect(c.antesDoInicio.map((x) => [x.conta.id, x.qtd, x.valor])).toEqual([['a', 1, -10_000]]);
    expect(c.inicioNoMes.map((x) => x.id)).toEqual(['a']);
  });
});

describe('percentuais', () => {
  it('mostram duas casas decimais', () => {
    expect(pctDe(1_234, 10_000)).toBe('12,34%');
    expect(pctDe(1, 3)).toBe('33,33%');
    expect(pctDe(5, 0)).toBe('–');
  });
});
