import { describe, expect, it } from 'vitest';
import type { Dados, TransacaoExtrato } from '../types';
import { planoDoRamo } from '../data/planos';
import { reducer } from '../data/store';
import { saldos } from './calc';
import { confirmarLinha, vinculoPara } from './conciliar';

const base = (): Dados => ({
  versao: 1,
  empresa: { id: 'e', nome: 'Teste', ramo: 'servicos', criadaEm: '2026-01-01' },
  contas: [
    { id: 'a', nome: 'Banco A', tipo: 'corrente', saldoInicial: 100_000, dataSaldoInicial: '2026-01-01', arquivada: false },
    { id: 'b', nome: 'Banco B', tipo: 'corrente', saldoInicial: -5_000, dataSaldoInicial: '2026-01-01', arquivada: false },
  ],
  categorias: planoDoRamo('servicos'),
  lancamentos: [],
  extrato: [],
});
const linha = (id: string, contaId: string, valor: number, importacaoId: string): TransacaoExtrato => ({
  id, contaId, importacaoId, chave: id, data: '2026-01-02', descricao: `LINHA ${id}`, valor, situacao: 'pendente',
});

describe('transferência importada pelas duas contas', () => {
  function montar() {
    let d = base();
    const sai = linha('sai', 'a', -71_500, 'impA');
    const entra = linha('entra', 'b', 71_500, 'impB');
    d = { ...d, extrato: [sai, entra] };
    const r = confirmarLinha(d, sai, { tipo: 'transferencia', outraContaId: 'b' })!;
    d = reducer(d, { t: 'conciliar', itens: [r] });
    return { d, entra };
  }

  it('sugere a transferência já lançada para a linha da outra conta, sem criar outra', () => {
    const { d: d0, entra } = montar();
    const v = vinculoPara(d0, entra)!;
    expect(v.tipo).toBe('transferencia');
    const r = confirmarLinha(d0, entra, { tipo: 'vinculo', lancamentoId: v.id })!;
    const d = reducer(d0, { t: 'conciliar', itens: [r] });
    expect(d.lancamentos.length).toBe(1);
    expect(d.lancamentos[0].extratoOutraPontaId).toBe('entra');
    expect(d.extrato!.every((t) => t.situacao === 'confirmada')).toBe(true);
    expect(saldos(d, '2026-01-31').porConta.map((x) => x.saldo)).toEqual([28_500, 66_500]);
    // Depois de ligada às duas pontas, não é sugerida para uma terceira linha.
    expect(vinculoPara(d, linha('outra', 'b', 71_500, 'impC'))).toBeUndefined();
  });

  it('não sugere para outra linha da mesma conta', () => {
    const { d } = montar();
    expect(vinculoPara(d, linha('sai2', 'a', -71_500, 'impA'))).toBeUndefined();
  });

  it('desfazer a importação de uma conta mantém a transferência presa à outra', () => {
    const { d: d0, entra } = montar();
    const v = vinculoPara(d0, entra)!;
    const d1 = reducer(d0, { t: 'conciliar', itens: [confirmarLinha(d0, entra, { tipo: 'vinculo', lancamentoId: v.id })!] });
    const semA = reducer(d1, { t: 'desfazerImportacao', id: 'impA' });
    expect(semA.lancamentos.length).toBe(1);
    expect(semA.lancamentos[0].extratoId).toBe('entra');
    expect(semA.lancamentos[0].extratoOutraPontaId).toBeUndefined();
    const semB = reducer(d1, { t: 'desfazerImportacao', id: 'impB' });
    expect(semB.lancamentos[0].extratoId).toBe('sai');
    expect(semB.lancamentos[0].extratoOutraPontaId).toBeUndefined();
  });

  it('apagar a transferência devolve as duas linhas para revisão', () => {
    const { d: d0, entra } = montar();
    const v = vinculoPara(d0, entra)!;
    const d1 = reducer(d0, { t: 'conciliar', itens: [confirmarLinha(d0, entra, { tipo: 'vinculo', lancamentoId: v.id })!] });
    const d2 = reducer(d1, { t: 'excluir', ids: [v.id] });
    expect(d2.extrato!.map((t) => t.situacao)).toEqual(['pendente', 'pendente']);
  });
});

describe('saldo no início do mês', () => {
  it('conta o saldo inicial cadastrado no dia 1, sem os lançamentos do dia', () => {
    const d = base();
    d.lancamentos.push({ id: 'x', tipo: 'saida', valor: 10_000, data: '2026-01-01', status: 'pago', contaId: 'a', categoriaId: d.categorias[5].id, origem: 'manual', criadoEm: '2026-01-01' });
    expect(saldos(d, '2026-01-01', true).total).toBe(95_000);
    expect(saldos(d, '2026-01-01').total).toBe(85_000);
    expect(saldos(d, '2025-12-31').total).toBe(0);
  });
});
