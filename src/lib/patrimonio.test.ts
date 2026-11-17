import { describe, expect, it } from 'vitest';
import type { Dados, Lancamento } from '../types';
import { planoPessoal } from '../data/planos';
import { dadosPessoaisDeExemplo } from '../data/exemplo';
import { reducer } from '../data/store';
import { carteira, evolucaoPatrimonio, movimentoInvestimentos, patrimonioEm, valorDaConta } from './patrimonio';
import { futuroMensal } from './futuro';

const base = (): Dados => ({
  versao: 1,
  empresa: { id: 'p', nome: 'Casa', ramo: 'pessoal', tipo: 'pessoal', criadaEm: '2026-09-01' },
  contas: [
    { id: 'cc', nome: 'Conta', tipo: 'corrente', saldoInicial: 500_000, dataSaldoInicial: '2026-09-01', arquivada: false },
    { id: 'xp', nome: 'XP', tipo: 'aplicacao', saldoInicial: 1_000_000, dataSaldoInicial: '2026-09-01', arquivada: false },
    { id: 'cr', nome: 'Cartão', tipo: 'cartao', saldoInicial: 0, dataSaldoInicial: '2026-09-01', arquivada: false, cartao: { fechamento: 3, vencimento: 10, contaPagamentoId: 'cc' } },
  ],
  categorias: planoPessoal(),
  lancamentos: [],
});
const cat = (d: Dados, nome: string) => d.categorias.find((c) => c.nome === nome)!.id;
let n = 0;
const l = (p: Partial<Lancamento>): Lancamento => ({
  id: `x${n++}`, tipo: 'saida', valor: 0, data: '2026-11-10', status: 'pago', contaId: 'cc', origem: 'manual', criadoEm: '2026-09-01', ...p,
});

describe('investimentos (modo simples)', () => {
  it('sem valores digitados usa o saldo da conta; depois, o último valor de cada tipo', () => {
    let d = base();
    expect(valorDaConta(d, d.contas[1], '2026-11-20')).toMatchObject({ total: 1_000_000, atualizadoEm: null });
    d = reducer(d, { t: 'avaliar', avaliacoes: [
      { id: 'a1', contaId: 'xp', tipo: 'acoes', data: '2026-10-01', valor: 600_000 },
      { id: 'a2', contaId: 'xp', tipo: 'fiis', data: '2026-10-01', valor: 500_000 },
    ] });
    d = reducer(d, { t: 'avaliar', avaliacoes: [{ id: 'a3', contaId: 'xp', tipo: 'acoes', data: '2026-11-01', valor: 700_000 }] });
    expect(valorDaConta(d, d.contas[1], '2026-10-15').total).toBe(1_100_000);
    const c = carteira(d, '2026-11-20');
    expect(c.total).toBe(1_200_000);
    expect(c.porTipo.map((x) => [x.tipo, x.valor, x.pct])).toEqual([['acoes', 700_000, 58], ['fiis', 500_000, 42]]);
    expect(c.pctExterior).toBe(0);
    // Mesma corretora, tipo e dia: a nova substitui.
    d = reducer(d, { t: 'avaliar', avaliacoes: [{ id: 'a4', contaId: 'xp', tipo: 'acoes', data: '2026-11-01', valor: 650_000 }] });
    expect(d.avaliacoes).toHaveLength(3);
    expect(carteira(d, '2026-11-20').total).toBe(1_150_000);
  });

  it('aportes, resgates e dividendos; dividendo fica fora da renda', () => {
    const d = base();
    d.lancamentos = [
      l({ tipo: 'transferencia', valor: 200_000, contaDestinoId: 'xp', data: '2026-11-06' }),
      l({ valor: 50_000, categoriaId: cat(d, 'Ações'), data: '2026-11-07' }),
      l({ tipo: 'transferencia', contaId: 'xp', contaDestinoId: 'cc', valor: 30_000, data: '2026-11-08' }),
      l({ tipo: 'entrada', contaId: 'xp', valor: 4_000, categoriaId: cat(d, 'Dividendos e rendimentos'), data: '2026-11-15' }),
      l({ tipo: 'entrada', valor: 900_000, categoriaId: cat(d, 'Salário'), data: '2026-11-05' }),
      l({ tipo: 'entrada', contaId: 'xp', valor: 1_000, categoriaId: cat(d, 'Dividendos e rendimentos'), data: '2026-11-25', status: 'previsto' }),
    ];
    const m = movimentoInvestimentos(d, '2026-11-01', '2026-11-30');
    expect([m.aportes, m.resgates, m.dividendos]).toEqual([250_000, 30_000, 4_000]);
    expect(futuroMensal(d, '2026-11', 1)[0].renda).toBe(900_000);
  });
});

describe('patrimônio', () => {
  it('tenho (contas + investimentos + bens) menos devo (financiamentos + cartão)', () => {
    let d = base();
    d.lancamentos = [
      // Carro: 3 parcelas, a primeira já paga.
      ...['2026-10-15', '2026-11-15', '2026-12-15'].map((data, i) =>
        l({ valor: 100_000, data, status: data <= '2026-11-01' ? 'pago' : 'previsto', categoriaId: cat(d, 'Financiamento do veículo'), serieId: 'carro', parcela: { n: i + 1, total: 3 }, descricao: 'Carro' })),
      l({ contaId: 'cr', valor: 80_000, categoriaId: cat(d, 'Mercado'), data: '2026-10-20' }),
    ];
    d = reducer(d, { t: 'bem', bem: { id: 'b', nome: 'Carro', tipo: 'veiculo', valores: [{ data: '2026-09-01', valor: 5_000_000 }] } });
    const p = patrimonioEm(d, '2026-11-01');
    expect(p.contas).toBe(400_000);
    expect(p.investimentos).toBe(1_000_000);
    expect(p.totalBens).toBe(5_000_000);
    expect(p.dividas.map((x) => [x.nome, x.valor])).toEqual([['Carro', 200_000], ['Cartão', 80_000]]);
    expect(p.liquido).toBe(400_000 + 1_000_000 + 5_000_000 - 280_000);
    // Antes do financiamento começar, ele não conta como dívida.
    expect(patrimonioEm(d, '2026-09-30').dividas).toHaveLength(0);
    // Excluir o bem tira do patrimônio.
    expect(patrimonioEm(reducer(d, { t: 'excluirBem', id: 'b' }), '2026-11-01').totalBens).toBe(0);
  });

  it('evolução começa quando os dados começam e termina hoje', () => {
    const ev = evolucaoPatrimonio(base(), '2026-11-20', 12);
    expect(ev.map((x) => x.data)).toEqual(['2026-09-30', '2026-10-31', '2026-11-20']);
  });

  it('exemplo pessoal tem investimentos, dividendos e bens', () => {
    const ex = dadosPessoaisDeExemplo('2026-11-17');
    const d: Dados = { versao: 1, empresa: ex.empresa, contas: ex.contas, categorias: ex.categorias, lancamentos: ex.lancamentos, avaliacoes: ex.avaliacoes, bens: ex.bens };
    const p = patrimonioEm(d, '2026-11-17');
    expect(p.investimentos).toBe(6_720_000);
    expect(p.bens).toHaveLength(2);
    expect(p.devo).toBeGreaterThan(0);
    expect(movimentoInvestimentos(d, '2026-01-01', '2026-11-17').dividendos).toBeGreaterThan(0);
  });
});
