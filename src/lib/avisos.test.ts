import { describe, expect, it } from 'vitest';
import type { Dados, Lancamento } from '../types';
import { planoDoRamo, planoPessoal } from '../data/planos';
import { reducer } from '../data/store';
import { entradaDoRepasse, renovacoesChegando, repassesPendentes, tipoRepasse } from './avisos';

const contas = [{ id: 'cc', nome: 'Conta', tipo: 'corrente' as const, saldoInicial: 0, dataSaldoInicial: '2025-01-01', arquivada: false }];
const pessoal = (): Dados => ({
  versao: 1, empresa: { id: 'pf', nome: 'Casa', ramo: 'pessoal', tipo: 'pessoal', criadaEm: '2025-01-01' },
  contas, categorias: planoPessoal(), lancamentos: [],
});
const empresa = (): Dados => ({
  versao: 1, empresa: { id: 'pj', nome: 'Loja', ramo: 'comercio', criadaEm: '2025-01-01' },
  contas, categorias: planoDoRamo('comercio'), lancamentos: [],
});
const cat = (d: Dados, nome: string) => d.categorias.find((c) => c.nome === nome)!.id;
let n = 0;
const l = (p: Partial<Lancamento>): Lancamento => ({
  id: `l${n++}`, tipo: 'saida', valor: 0, data: '2026-11-10', status: 'pago', contaId: 'cc', origem: 'manual', criadoEm: '2026-01-01', ...p,
});

describe('repasses da empresa para o pessoal', () => {
  it('reconhece pró-labore e distribuição de lucros', () => {
    expect(tipoRepasse('Pró-labore')).toBe('prolabore');
    expect(tipoRepasse('Distribuição de lucros')).toBe('lucros');
    expect(tipoRepasse('Retiradas dos sócios')).toBe('lucros');
    expect(tipoRepasse('Aluguel')).toBeNull();
  });

  it('lista, traz com um toque, avisa quando muda na empresa e respeita o "ignorar"', () => {
    const pj = empresa();
    pj.lancamentos = [
      l({ id: 'lucro', valor: 500_000, categoriaId: cat(pj, 'Distribuição de lucros'), data: '2026-12-15', status: 'previsto', descricao: 'Lucros' }),
      l({ id: 'pl', valor: 300_000, categoriaId: cat(pj, 'Pró-labore'), data: '2026-11-05' }),
      l({ id: 'velho', valor: 1, categoriaId: cat(pj, 'Pró-labore'), data: '2026-06-05' }),
      l({ id: 'aluguel', valor: 9, categoriaId: cat(pj, 'Energia'), data: '2026-11-05' }),
    ];
    let pf = pessoal();
    const lista = repassesPendentes(pf, [pj, pf], '2026-11-17');
    expect(lista.map((r) => [r.origem.id, r.tipo])).toEqual([['pl', 'prolabore'], ['lucro', 'lucros']]);

    // Trazer: entrada no pessoal com mesma data, valor e situação, na categoria certa.
    for (const r of lista) pf = reducer(pf, { t: 'lancamento', lancamento: entradaDoRepasse(pf, r)! });
    const lucro = pf.lancamentos.find((x) => x.repasse?.lancamentoId === 'lucro')!;
    expect(lucro).toMatchObject({ tipo: 'entrada', valor: 500_000, data: '2026-12-15', status: 'previsto', categoriaId: cat(pf, 'Distribuição de lucros') });
    expect(pf.lancamentos.find((x) => x.repasse?.lancamentoId === 'pl')!.categoriaId).toBe(cat(pf, 'Pró-labore'));
    expect(repassesPendentes(pf, [pj, pf], '2026-11-17')).toHaveLength(0);

    // Empresa muda o valor e paga: aparece para atualizar.
    pj.lancamentos[0] = { ...pj.lancamentos[0], valor: 550_000, status: 'pago' };
    const mudou = repassesPendentes(pf, [pj, pf], '2026-11-17');
    expect(mudou.map((r) => [r.origem.id, r.mudou])).toEqual([['lucro', true]]);
    pf = reducer(pf, { t: 'lancamento', lancamento: entradaDoRepasse(pf, mudou[0])! });
    expect(pf.lancamentos.find((x) => x.id === lucro.id)).toMatchObject({ valor: 550_000, status: 'pago' });
    expect(pf.lancamentos).toHaveLength(2);

    // Recebido no pessoal antes de a empresa dar baixa: não reclama.
    const pj2 = { ...pj, lancamentos: pj.lancamentos.map((x) => (x.id === 'pl' ? { ...x, status: 'previsto' as const } : x)) };
    expect(repassesPendentes(pf, [pj2, pf], '2026-11-17')).toHaveLength(0);

    // Ignorar some com o repasse.
    const pj3 = { ...pj, lancamentos: [...pj.lancamentos, l({ id: 'socio2', valor: 300_000, categoriaId: cat(pj, 'Pró-labore'), data: '2026-11-06' })] };
    expect(repassesPendentes(pf, [pj3, pf], '2026-11-17')).toHaveLength(1);
    pf = reducer(pf, { t: 'ignorarRepasse', id: 'socio2' });
    expect(repassesPendentes(pf, [pj3, pf], '2026-11-17')).toHaveLength(0);
  });
});

describe('renovação anual (seguro, IPVA, IPTU)', () => {
  it('avisa 30 dias antes de fazer um ano, conta parcelado como uma compra e some ao lançar ou dispensar', () => {
    let d = pessoal();
    const seguro = cat(d, 'Seguro do carro');
    d.lancamentos = [
      // Seguro em 10x começando em 2025-12-10.
      ...Array.from({ length: 10 }, (_, i) => l({ valor: 40_000, categoriaId: seguro, data: `${i < 1 ? '2025-12' : `2026-${String(i).padStart(2, '0')}`}-10`, serieId: 's', parcela: { n: i + 1, total: 10 } })),
      l({ valor: 300_000, categoriaId: cat(d, 'IPVA e licenciamento'), data: '2026-03-20' }),
      l({ valor: 10_000, categoriaId: cat(d, 'Mercado'), data: '2025-11-20' }),
    ];
    const r = renovacoesChegando(d, '2026-11-17');
    expect(r.map((x) => [x.categoria.nome, x.proxima, x.valor, x.parcelas, x.dias])).toEqual([['Seguro do carro', '2026-12-10', 400_000, 10, 23]]);
    // Fora da janela: nada.
    expect(renovacoesChegando(d, '2026-10-01')).toHaveLength(0);
    // Dispensar.
    expect(renovacoesChegando(reducer(d, { t: 'lembreteVisto', chave: r[0].chave }), '2026-11-17')).toHaveLength(0);
    // Lançar a renovação (prevista para dezembro) também tira o aviso.
    d = reducer(d, { t: 'lancamentos', lancamentos: [l({ valor: 420_000, categoriaId: seguro, data: '2026-12-10', status: 'previsto' })] });
    expect(renovacoesChegando(d, '2026-11-17')).toHaveLength(0);
  });

  it('não vale para o perfil da empresa', () => {
    expect(renovacoesChegando(empresa(), '2026-11-17')).toEqual([]);
  });
});
