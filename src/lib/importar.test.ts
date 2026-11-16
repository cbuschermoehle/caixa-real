import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Dados, TransacaoExtrato } from '../types';
import { planoDoRamo } from '../data/planos';
import { adivinharMapeamento, aplicarMapeamento, chaves, marcarRepetidas, decodificar, formatoDoArquivo, lerCSV, lerData, lerOFX, lerValor, lerXLSX } from './importar';
import { aprender, confirmarDividida, confirmarLinha, regraPara, trechoDaDescricao, vinculoPara } from './conciliar';

const arq = (n: string) => {
  const b = readFileSync(new URL(`./__fixtures__/${n}`, import.meta.url));
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

describe('leitura de valores e datas', () => {
  it('valores em vários formatos de banco', () => {
    expect(lerValor('-1.850,40')).toBe(-185040);
    expect(lerValor('1.850,40-')).toBe(-185040);
    expect(lerValor('(45,90)')).toBe(-4590);
    expect(lerValor('45,90 D')).toBe(-4590);
    expect(lerValor('4.800,00 C')).toBe(480000);
    expect(lerValor('-1850.40')).toBe(-185040);
    expect(lerValor('1,850.40')).toBe(185040);
    expect(lerValor('R$ 50')).toBe(5000);
    expect(lerValor('abc')).toBeNull();
  });
  it('datas', () => {
    expect(lerData('10/11/2026')).toBe('2026-11-10');
    expect(lerData('1/2/26')).toBe('2026-02-01');
    expect(lerData('20261110120000[-3:BRT]')).toBe('2026-11-10');
    expect(lerData('2026-11-10')).toBe('2026-11-10');
    expect(lerData('46336')).toBe('2026-11-10');
    expect(lerData('31/02/2026')).toBeNull();
  });
});

describe('arquivos', () => {
  it('OFX em Windows-1252', () => {
    const buf = arq('extrato.ofx');
    expect(formatoDoArquivo('extrato.ofx', buf)).toBe('ofx');
    const linhas = lerOFX(decodificar(buf));
    expect(linhas).toHaveLength(3);
    expect(linhas[0]).toEqual({ data: '2026-11-10', valor: -185040, descricao: 'PAGTO ENERGIA CELESC 0012345', fitid: 'A001' });
    expect(linhas[2].descricao).toBe('CASAN - CONTA DE ÁGUA');
  });

  it('CSV com linhas de cabeçalho do banco, saldo e acento', () => {
    const tabela = lerCSV(decodificar(arq('extrato.csv')));
    const m = adivinharMapeamento(tabela);
    expect(m.linhaCabecalho).toBe(2);
    expect([m.data, m.descricao, m.valor, m.modoValor]).toEqual([0, 1, 3, 'unico']);
    const { linhas, puladas } = aplicarMapeamento(tabela, m);
    expect(linhas.map((l) => l.valor)).toEqual([-185040, 480000, -4590, -4590]);
    expect(puladas).toBe(1);
  });

  it('XLSX com crédito e débito em colunas separadas', async () => {
    const buf = arq('extrato.xlsx');
    expect(formatoDoArquivo('extrato.xlsx', buf)).toBe('xlsx');
    const tabela = await lerXLSX(buf);
    const m = adivinharMapeamento(tabela);
    expect(m.modoValor).toBe('separado');
    const { linhas } = aplicarMapeamento(tabela, m);
    expect(linhas).toEqual([
      { data: '2026-11-10', descricao: 'PAGTO ENERGIA CELESC', valor: -185040 },
      { data: '2026-11-11', descricao: 'PIX RECEBIDO CONSTRUTORA ALFA', valor: 480000 },
    ]);
  });

  it('chaves repetem igual ao reimportar e separam linhas iguais no mesmo dia', () => {
    const tabela = lerCSV(decodificar(arq('extrato.csv')));
    const { linhas } = aplicarMapeamento(tabela, adivinharMapeamento(tabela));
    const a = chaves('pj', linhas);
    expect(new Set(a).size).toBe(4);
    expect(chaves('pj', linhas)).toEqual(a);
    expect(chaves('outra', linhas)[0]).not.toBe(a[0]);
  });

  it('bloqueia a mesma movimentação vinda de OFX e depois de CSV, mas aceita a 2ª tarifa igual', () => {
    const ofx = lerOFX(decodificar(arq('extrato.ofx')));
    const existentes = marcarRepetidas('pj', ofx, []).map((m, i) => ({ ...ofx[i], chave: m.chave, contaId: 'pj' }));
    const tabela = lerCSV(decodificar(arq('extrato.csv')));
    const { linhas } = aplicarMapeamento(tabela, adivinharMapeamento(tabela));
    const r = marcarRepetidas('pj', linhas, existentes);
    expect(r.map((x) => x.repetida)).toEqual([true, true, false, false]);
    const depois = [...existentes, ...r.map((m, i) => ({ ...linhas[i], chave: m.chave, contaId: 'pj' }))];
    expect(marcarRepetidas('pj', linhas, depois).every((x) => x.repetida)).toBe(true);
  });
});

describe('conciliação', () => {
  const base = (): Dados => ({
    versao: 1,
    empresa: { id: 'e', nome: 'T', ramo: 'comercio', criadaEm: '2026-11-01' },
    contas: [
      { id: 'pj', nome: 'PJ', tipo: 'corrente', saldoInicial: 0, dataSaldoInicial: '2026-11-01', arquivada: false },
      { id: 'cx', nome: 'Caixa', tipo: 'caixa', saldoInicial: 0, dataSaldoInicial: '2026-11-01', arquivada: false },
    ],
    categorias: planoDoRamo('comercio'),
    lancamentos: [],
  });
  const t = (p: Partial<TransacaoExtrato>): TransacaoExtrato => ({
    id: 't1', contaId: 'pj', importacaoId: 'i', chave: 'k', data: '2026-11-10', descricao: 'PAGTO ENERGIA CELESC 0012345', valor: -50000, situacao: 'pendente', ...p,
  });

  it('trecho tira números e códigos', () => {
    expect(trechoDaDescricao('PAGTO ENERGIA CELESC 0012345')).toBe('PAGTO ENERGIA CELESC');
    expect(trechoDaDescricao('PIX - 10/11 Fornecedor Ltda.')).toBe('PIX FORNECEDOR LTDA.');
  });

  it('aprende a regra e sugere na próxima importação', () => {
    const d = base();
    const energia = d.categorias.find((c) => c.nome === 'Energia')!.id;
    const r = aprender(d, t({}), energia)!;
    d.regras = [r];
    expect(regraPara(d, t({ descricao: 'PAGTO ENERGIA CELESC 0099999' }))?.categoriaId).toBe(energia);
    expect(regraPara(d, t({ valor: 50000 }))).toBeUndefined();
  });

  it('sugere vincular ao previsto de mesmo valor até 3 dias e dá baixa nele', () => {
    const d = base();
    d.lancamentos = [
      { id: 'p', tipo: 'saida', valor: 50000, data: '2026-11-08', status: 'previsto', contaId: 'pj', categoriaId: 'x', origem: 'manual', criadoEm: '2026-11-01' },
      { id: 'longe', tipo: 'saida', valor: 50000, data: '2026-11-01', status: 'previsto', contaId: 'pj', categoriaId: 'x', origem: 'manual', criadoEm: '2026-11-01' },
    ];
    const v = vinculoPara(d, t({}))!;
    expect(v.id).toBe('p');
    const r = confirmarLinha(d, t({}), { tipo: 'vinculo', lancamentoId: 'p' })!;
    expect(r.lancamento).toMatchObject({ id: 'p', status: 'pago', data: '2026-11-10', extratoId: 't1' });
    expect(r.transacao.situacao).toBe('confirmada');
    expect(vinculoPara(d, t({}), new Set(['p']))).toBeUndefined();
  });

  it('transferência sai da conta do extrato quando o valor é negativo', () => {
    const d = base();
    const r = confirmarLinha(d, t({ valor: -20000 }), { tipo: 'transferencia', outraContaId: 'cx' })!;
    expect(r.lancamento).toMatchObject({ tipo: 'transferencia', contaId: 'pj', contaDestinoId: 'cx', valor: 20000 });
  });
});

describe('dividir linha', () => {
  const t: TransacaoExtrato = { id: 't9', contaId: 'pj', importacaoId: 'i', chave: 'k', data: '2026-11-10', descricao: 'PAGTO FATURA CARTAO', valor: -300000, situacao: 'pendente' };
  it('só aceita quando a soma bate', () => {
    expect(confirmarDividida(t, [{ categoriaId: 'a', valor: 180000 }, { categoriaId: 'b', valor: 90000 }])).toBeNull();
    const r = confirmarDividida(t, [{ categoriaId: 'a', valor: 180000 }, { categoriaId: 'b', valor: 90000 }, { categoriaId: 'c', valor: 30000 }])!;
    expect([r.lancamento, ...r.extras].map((l) => [l.tipo, l.valor, l.extratoId])).toEqual([['saida', 180000, 't9'], ['saida', 90000, 't9'], ['saida', 30000, 't9']]);
  });
});
