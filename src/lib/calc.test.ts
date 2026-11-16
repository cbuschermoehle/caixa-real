import { describe, expect, it } from 'vitest';
import type { Dados, Lancamento } from '../types';
import { atualizarPlano, planoDoRamo } from '../data/planos';
import { dadosDeExemplo } from '../data/exemplo';
import { cascata, longoPrazo, pontoEquilibrio, porMes, projecao, saldos } from './calc';
import { parseValor, somaMeses, ultimoDiaDoMes } from './format';

const base = (): Dados => {
  const categorias = planoDoRamo('comercio');
  return {
    versao: 1,
    empresa: { id: 'e', nome: 'Teste', ramo: 'comercio', criadaEm: '2026-11-01' },
    contas: [
      { id: 'pj', nome: 'PJ', tipo: 'corrente', saldoInicial: 100_000, dataSaldoInicial: '2026-11-01', arquivada: false },
      { id: 'apl', nome: 'Aplicação', tipo: 'aplicacao', saldoInicial: 500_000, dataSaldoInicial: '2026-11-01', arquivada: false },
    ],
    categorias,
    lancamentos: [],
  };
};
const cat = (d: Dados, nome: string) => d.categorias.find((c) => c.nome === nome)!.id;
let n = 0;
const l = (p: Partial<Lancamento>): Lancamento => ({
  id: `l${n++}`, tipo: 'entrada', valor: 0, data: '2026-11-10', status: 'pago', contaId: 'pj', origem: 'manual', criadoEm: '2026-11-01', ...p,
});

describe('formatos', () => {
  it('lê valores em reais', () => {
    expect(parseValor('1.234,56')).toBe(123456);
    expect(parseValor('1234,5')).toBe(123450);
    expect(parseValor('R$ 50')).toBe(5000);
    expect(parseValor('12.5')).toBe(1250);
    expect(parseValor('1.234')).toBe(123400);
    expect(parseValor('abc')).toBeNull();
  });
  it('soma meses sem pular fim de mês', () => {
    expect(somaMeses('2026-01-31', 1)).toBe('2026-02-28');
    expect(somaMeses('2026-11-15', 2)).toBe('2027-01-15');
    expect(ultimoDiaDoMes('2028-02')).toBe('2028-02-29');
  });
});

describe('saldo em regime de caixa', () => {
  it('só pagos mexem no saldo; transferência não muda o total', () => {
    const d = base();
    d.lancamentos = [
      l({ tipo: 'entrada', valor: 30_000, categoriaId: cat(d, 'Vendas no cartão') }),
      l({ tipo: 'saida', valor: 10_000, categoriaId: cat(d, 'Energia') }),
      l({ tipo: 'saida', valor: 99_000, status: 'previsto', categoriaId: cat(d, 'Energia') }),
      l({ tipo: 'transferencia', valor: 20_000, contaDestinoId: 'apl' }),
      l({ tipo: 'entrada', valor: 7_000, data: '2026-10-20', categoriaId: cat(d, 'Vendas no cartão') }),
    ];
    const s = saldos(d, '2026-11-30');
    expect(s.disponivel).toBe(100_000 + 30_000 - 10_000 - 20_000);
    expect(s.aplicado).toBe(520_000);
    expect(s.total).toBe(600_000 + 20_000);
  });

  it('projeção leva atrasados para hoje e acha o primeiro dia negativo', () => {
    const d = base();
    d.lancamentos = [
      l({ tipo: 'saida', valor: 40_000, status: 'previsto', data: '2026-11-08', categoriaId: cat(d, 'Energia') }),
      l({ tipo: 'saida', valor: 70_000, status: 'previsto', data: '2026-11-12', categoriaId: cat(d, 'Aluguel e condomínio') }),
      l({ tipo: 'entrada', valor: 50_000, status: 'previsto', data: '2026-11-14', categoriaId: cat(d, 'Vendas no cartão') }),
    ];
    const p = projecao(d, '2026-11-10', 5);
    expect(p.pontos[0].saldo).toBe(60_000);
    expect(p.primeiroNegativo).toBe('2026-11-12');
    expect(p.pontos.at(-1)!.saldo).toBe(40_000);
  });
});

describe('relatório', () => {
  it('cascata bate com a variação real do caixa', () => {
    const d = base();
    d.lancamentos = [
      l({ tipo: 'entrada', valor: 100_000, data: '2026-11-03', categoriaId: cat(d, 'Vendas no cartão') }),
      l({ tipo: 'saida', valor: 30_000, data: '2026-11-04', categoriaId: cat(d, 'Compra de mercadoria para revenda') }),
      l({ tipo: 'saida', valor: 40_000, data: '2026-11-05', categoriaId: cat(d, 'Aluguel e condomínio') }),
      l({ tipo: 'saida', valor: 10_000, data: '2026-11-06', categoriaId: cat(d, 'Máquinas e equipamentos') }),
      l({ tipo: 'entrada', valor: 25_000, data: '2026-11-07', categoriaId: cat(d, 'Empréstimos recebidos') }),
      l({ tipo: 'saida', valor: 5_000, data: '2026-11-08', categoriaId: cat(d, 'Parcelamento de impostos (REFIS)') }),
      l({ tipo: 'transferencia', valor: 20_000, data: '2026-11-09', contaDestinoId: 'apl' }),
    ];
    const c = cascata(d, '2026-11');
    expect(c.margem[0]).toBe(70_000);
    expect(c.operacional[0]).toBe(30_000);
    expect(c.aposInvestimentos[0]).toBe(20_000);
    expect(c.variacao[0]).toBe(40_000);
    const antes = saldos(d, '2026-10-31').total + 600_000; // saldo inicial vale a partir de 01/11
    expect(saldos(d, '2026-11-30').total - antes).toBe(c.variacao[0]);
  });

  it('ponto de equilíbrio é o dia em que a margem cobre as fixas', () => {
    const d = base();
    const venda = cat(d, 'Vendas no cartão');
    d.lancamentos = [
      l({ tipo: 'saida', valor: 50_000, data: '2026-11-05', categoriaId: cat(d, 'Aluguel e condomínio') }),
      l({ tipo: 'saida', valor: 10_000, data: '2026-11-25', status: 'previsto', categoriaId: cat(d, 'Energia') }),
      l({ tipo: 'entrada', valor: 40_000, data: '2026-11-03', categoriaId: venda }),
      l({ tipo: 'saida', valor: 10_000, data: '2026-11-04', categoriaId: cat(d, 'Embalagens') }),
      l({ tipo: 'entrada', valor: 40_000, data: '2026-11-11', categoriaId: venda }),
    ];
    const p = pontoEquilibrio(d, '2026-11');
    expect(p.fixas).toBe(60_000);
    expect(p.dia).toBe('2026-11-11');
  });

  it('dados de exemplo fecham: variação do mês = diferença de saldo', () => {
    const ex = dadosDeExemplo('2026-11-15');
    const d: Dados = { versao: 1, ...ex };
    const c = cascata(d, '2026-10');
    expect(saldos(d, '2026-10-31').total - saldos(d, '2026-09-30').total).toBe(c.variacao[0]);
  });
});

describe('longo prazo', () => {
  it('exemplo traz REFIS até 2034 e soma por ano', () => {
    const d: Dados = { versao: 1, ...dadosDeExemplo('2026-11-15') };
    const lp = longoPrazo(d, '2026-11-15');
    expect(lp.porAno.at(-1)!.ano).toBe(2034);
    const refis = lp.series.find((s) => s.nome === 'PGTO REFIS SIMPLES')!;
    expect(refis.ultima.slice(0, 7)).toBe('2034-07');
    expect(refis.valorRestante).toBe(refis.restantes * 21_000);
    const meses = porMes(d, '2026-11', 12);
    expect(meses).toHaveLength(12);
    expect(meses[11].data).toBe('2026-11-01');
  });
});

describe('plano de contas', () => {
  it('empresa antiga ganha as categorias novas sem duplicar as que já tem', () => {
    const antigas = planoDoRamo('industria').filter((c) => !['Recebimento de boleto antecipado', 'Pagamento de boleto antecipado'].includes(c.nome));
    const n = atualizarPlano(antigas, 1);
    expect(n.length).toBe(antigas.length + 2);
    expect(n.find((c) => c.nome === 'Pagamento de boleto antecipado')).toMatchObject({ bloco: 'outras', sentido: 'saida' });
    expect(atualizarPlano(n, 1)).toHaveLength(n.length);
  });

  it('v3 move juros de antecipação para custos variáveis mantendo o id', () => {
    const antiga = { id: 'j', nome: 'Juros e taxas de antecipação', bloco: 'outras' as const, sentido: 'saida' as const, oculta: false, ordem: 99 };
    const n = atualizarPlano([...planoDoRamo('industria').filter((c) => !/antecipa/i.test(c.nome)), antiga], 2);
    expect(n.find((c) => c.id === 'j')!.bloco).toBe('custos_variaveis');
    expect(n.filter((c) => /juros e taxas de antecipa/i.test(c.nome))).toHaveLength(1);
  });
});
