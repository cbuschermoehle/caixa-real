import { describe, expect, it } from 'vitest';
import type { Dados, Lancamento } from '../types';
import { planoDoRamo, planoPessoal } from '../data/planos';
import { dadosDeExemplo, dadosPessoaisDeExemplo } from '../data/exemplo';
import { abrirCofre, guardarCofre, reducerCofre, vazio } from '../data/store';
import { cascata, longoPrazo, rendaComprometida, saldos, totaisPrevistos } from './calc';
import { faturaDaCompra, faturaDoPagamento, faturasDoCartao, resumoCartao, sincronizarFaturas, vencimentoDaFatura } from './cartao';
import { confirmarLinha, vinculoPara } from './conciliar';

const info = { fechamento: 3, vencimento: 10 };

const base = (): Dados => ({
  versao: 1,
  empresa: { id: 'p', nome: 'Casa', ramo: 'pessoal', tipo: 'pessoal', criadaEm: '2026-11-01' },
  contas: [
    { id: 'cc', nome: 'Conta', tipo: 'corrente', saldoInicial: 500_000, dataSaldoInicial: '2026-11-01', arquivada: false },
    { id: 'cr', nome: 'Cartão', tipo: 'cartao', saldoInicial: 0, dataSaldoInicial: '2026-11-01', arquivada: false, cartao: { ...info, limite: 1_000_000, contaPagamentoId: 'cc' } },
  ],
  categorias: planoPessoal(),
  lancamentos: [],
});
const cat = (d: Dados, nome: string) => d.categorias.find((c) => c.nome === nome)!.id;
let n = 0;
const l = (p: Partial<Lancamento>): Lancamento => ({
  id: `x${n++}`, tipo: 'saida', valor: 0, data: '2026-11-10', status: 'pago', contaId: 'cc', origem: 'manual', criadoEm: '2026-11-01', ...p,
});

describe('cartão de crédito: em que fatura cai a compra', () => {
  it('antes do fechamento fica na fatura do mês; no dia do fechamento em diante, na seguinte', () => {
    expect(faturaDaCompra('2026-11-02', info)).toBe('2026-11');
    expect(faturaDaCompra('2026-11-03', info)).toBe('2026-12');
    expect(faturaDaCompra('2026-11-28', info)).toBe('2026-12');
  });
  it('vencimento antes do fechamento: a fatura vence no mês seguinte ao fechamento', () => {
    const i = { fechamento: 25, vencimento: 5 };
    expect(faturaDaCompra('2026-11-20', i)).toBe('2026-12');
    expect(faturaDaCompra('2026-11-26', i)).toBe('2027-01');
    expect(vencimentoDaFatura('2026-12', i)).toBe('2026-12-05');
  });
  it('dia 31 em mês curto vira o último dia', () => {
    expect(vencimentoDaFatura('2027-02', { fechamento: 24, vencimento: 31 })).toBe('2027-02-28');
  });
  it('pagamento é ligado à fatura de vencimento mais próximo', () => {
    expect(faturaDoPagamento('2026-12-09', info)).toBe('2026-12');
    expect(faturaDoPagamento('2026-12-14', info)).toBe('2026-12');
    expect(faturaDoPagamento('2026-11-28', info)).toBe('2026-12');
  });
});

describe('cartão de crédito: faturas e pagamentos previstos', () => {
  const comCompras = () => {
    const d = base();
    const merc = cat(d, 'Mercado');
    d.lancamentos = [
      l({ contaId: 'cr', data: '2026-11-05', valor: 30_000, categoriaId: merc }),
      l({ contaId: 'cr', data: '2026-11-20', valor: 20_000, categoriaId: merc }),
      // TV em 3x de 100: data da compra igual, uma parcela por fatura.
      ...[0, 1, 2].map((i) => l({ contaId: 'cr', data: '2026-11-06', valor: 10_000, categoriaId: cat(d, 'Casa e manutenção'), fatura: ['2026-12', '2027-01', '2027-02'][i], parcela: { n: i + 1, total: 3 } })),
    ];
    return sincronizarFaturas(d, '2026-11-25');
  };

  it('preenche a fatura das compras e cria um pagamento previsto por fatura', () => {
    const d = comCompras();
    expect(d.lancamentos.filter((x) => x.contaId === 'cr').every((x) => x.fatura)).toBe(true);
    const auto = d.lancamentos.filter((x) => x.faturaAuto).sort((a, b) => a.data.localeCompare(b.data));
    expect(auto.map((x) => [x.fatura, x.valor, x.data, x.contaId, x.contaDestinoId])).toEqual([
      ['2026-12', 60_000, '2026-12-10', 'cc', 'cr'],
      ['2027-01', 10_000, '2027-01-10', 'cc', 'cr'],
      ['2027-02', 10_000, '2027-02-10', 'cc', 'cr'],
    ]);
    // Rodar de novo não muda nada.
    expect(sincronizarFaturas(d, '2026-11-25')).toBe(d);
  });

  it('compra nova atualiza o valor da fatura; pagamento confirmado quita', () => {
    let d = comCompras();
    d = sincronizarFaturas({ ...d, lancamentos: [...d.lancamentos, l({ contaId: 'cr', data: '2026-11-21', valor: 5_000, categoriaId: cat(d, 'Mercado') })] });
    const dez = () => d.lancamentos.filter((x) => x.faturaAuto && x.fatura === '2026-12');
    expect(dez().map((x) => x.valor)).toEqual([65_000]);
    // Pagou só 50.000: fica um previsto com o resto.
    d = sincronizarFaturas({ ...d, lancamentos: d.lancamentos.map((x) => (x.id === dez()[0].id ? { ...x, status: 'pago' as const, valor: 50_000 } : x)) });
    expect(dez().filter((x) => x.status === 'previsto').map((x) => x.valor)).toEqual([15_000]);
    expect(faturasDoCartao(d, d.contas[1]).find((f) => f.mes === '2026-12')!.falta).toBe(15_000);
  });

  it('apagar todas as compras da fatura apaga o pagamento previsto', () => {
    let d = comCompras();
    d = sincronizarFaturas({ ...d, lancamentos: d.lancamentos.filter((x) => x.fatura !== '2027-02' || x.faturaAuto) });
    expect(d.lancamentos.some((x) => x.faturaAuto && x.fatura === '2027-02')).toBe(false);
  });

  it('compra no cartão não mexe no dinheiro disponível; o pagamento da fatura, sim', () => {
    const d = comCompras();
    const s = saldos(d, '2026-11-25');
    expect(s.disponivel).toBe(500_000);
    expect(s.cartoes).toBe(-80_000);
    expect(s.total).toBe(500_000);
    const r = resumoCartao(d, d.contas[1], '2026-11-25')!;
    expect(r.mesAberta).toBe('2026-12');
    expect(r.aberta!.total).toBe(60_000);
    expect(r.usado).toBe(80_000);
    expect(r.futuro).toBe(20_000);
  });

  it('no relatório a compra conta no mês em que a fatura vence', () => {
    const d = comCompras();
    const nov = cascata(d, '2026-11', '2026-11-25');
    expect(nov.blocos.custos_variaveis.realizado + nov.blocos.custos_variaveis.previsto).toBe(0);
    const dezAntes = cascata(d, '2026-12', '2026-11-25');
    expect(dezAntes.blocos.custos_variaveis.previsto).toBe(60_000);
    const dezDepois = cascata(d, '2026-12', '2026-12-10');
    expect(dezDepois.blocos.custos_variaveis.realizado).toBe(60_000);
  });

  it('fatura entra em "a pagar" e no longo prazo', () => {
    const d = comCompras();
    const prev = d.lancamentos.filter((x) => x.status === 'previsto');
    expect(totaisPrevistos(prev).pagar).toBe(80_000);
    expect(longoPrazo(d, '2026-11-25').porAno).toEqual([{ ano: 2026, receber: 0, pagar: 60_000 }, { ano: 2027, receber: 0, pagar: 20_000 }]);
  });

  it('débito da fatura no extrato do banco dá baixa no pagamento previsto, com o valor do banco', () => {
    const d = comCompras();
    const t = { id: 't1', contaId: 'cc', importacaoId: 'i', chave: 'k', data: '2026-12-10', descricao: 'PAGAMENTO FATURA', valor: -60_000, situacao: 'pendente' as const };
    const v = vinculoPara(d, t)!;
    expect(v.faturaAuto).toBe(true);
    const r = confirmarLinha(d, { ...t, valor: -59_000 }, { tipo: 'vinculo', lancamentoId: v.id })!;
    expect(r.lancamento.status).toBe('pago');
    expect(r.lancamento.valor).toBe(59_000);
  });
});

describe('perfil pessoal', () => {
  it('cascata: renda menos essenciais, dia a dia e dívidas = quanto sobrou', () => {
    const d = base();
    d.lancamentos = [
      l({ tipo: 'entrada', valor: 1_000_000, categoriaId: cat(d, 'Salário') }),
      l({ valor: 300_000, categoriaId: cat(d, 'Condomínio') }),
      l({ valor: 100_000, categoriaId: cat(d, 'Mercado') }),
      l({ valor: 200_000, categoriaId: cat(d, 'Financiamento do veículo'), status: 'previsto', data: '2026-11-20' }),
      l({ valor: 50_000, categoriaId: cat(d, 'Ações') }),
    ];
    const c = cascata(d, '2026-11', '2026-11-15');
    expect(c.blocos.dividas.previsto).toBe(200_000);
    expect(c.operacional).toEqual([600_000, -200_000]);
    expect(c.aposInvestimentos[0]).toBe(550_000);
    const rc = rendaComprometida(c);
    expect(rc.pct).toBe(50);
    expect(rc.faixa).toBe('ok');
  });

  it('plano pessoal tem categorias em todos os blocos', () => {
    const blocos = new Set(planoPessoal().map((c) => c.bloco));
    expect([...blocos].sort()).toEqual(['custos_variaveis', 'despesas_fixas', 'dividas', 'entradas', 'investimentos', 'outras']);
    expect(planoDoRamo('pessoal').length).toBe(planoPessoal().length);
  });

  it('exemplo pessoal abre sem faturas atrasadas e com o cartão funcionando', () => {
    const ex = dadosPessoaisDeExemplo('2026-11-17');
    const d: Dados = { versao: 1, empresa: ex.empresa, contas: ex.contas, categorias: ex.categorias, lancamentos: ex.lancamentos };
    expect(sincronizarFaturas(d, '2026-11-17')).toBe(d);
    const atrasadas = d.lancamentos.filter((x) => x.faturaAuto && x.status === 'previsto' && x.data < '2026-11-17');
    expect(atrasadas).toEqual([]);
    const r = resumoCartao(d, ex.contas.find((c) => c.tipo === 'cartao')!, '2026-11-17')!;
    expect(r.futuro).toBeGreaterThan(0);
  });
});

describe('perfis no mesmo login', () => {
  const empresa = (): Dados => {
    const ex = dadosDeExemplo('2026-11-17');
    return { versao: 1, empresa: ex.empresa, contas: ex.contas, categorias: ex.categorias, lancamentos: ex.lancamentos, planoVersao: 3 };
  };

  it('dados antigos (só a empresa) abrem como um perfil', () => {
    const c = abrirCofre(empresa());
    expect(c.perfis).toHaveLength(1);
    expect(guardarCofre(c.perfis).outrosPerfis).toBeUndefined();
  });

  it('criar perfil pessoal guarda a empresa na raiz e o pessoal em outrosPerfis', () => {
    let c = abrirCofre(empresa());
    c = reducerCofre(c, { t: 'novoPerfil' });
    expect(c.ativo).toBe(1);
    expect(guardarCofre(c.perfis).outrosPerfis).toBeUndefined(); // perfil em branco não é gravado
    const p = base();
    c = reducerCofre(c, { t: 'iniciar', empresa: p.empresa!, contas: p.contas, categorias: p.categorias });
    const g = guardarCofre(c.perfis);
    expect(g.empresa!.nome).toBe('Metalúrgica Exemplo');
    expect(g.outrosPerfis!.map((x) => x.empresa!.nome)).toEqual(['Casa']);
    // Versões antigas do app fazem { ...d, ... } ao salvar: o perfil pessoal continua lá.
    const salvoPorVersaoAntiga = { ...g, lancamentos: [...g.lancamentos] };
    const reaberto = abrirCofre(salvoPorVersaoAntiga, p.empresa!.id);
    expect(reaberto.perfis).toHaveLength(2);
    expect(reaberto.ativo).toBe(1);
  });

  it('lançamentos vão só para o perfil aberto; trocar de perfil não muda os dados', () => {
    let c = abrirCofre({ ...empresa(), outrosPerfis: [base()] });
    const antes = c.perfis[0].lancamentos.length;
    c = reducerCofre(c, { t: 'trocarPerfil', indice: 1 });
    c = reducerCofre(c, { t: 'lancamentos', lancamentos: [l({ valor: 1_000, categoriaId: cat(c.perfis[1], 'Mercado') })] });
    expect(c.perfis[0].lancamentos.length).toBe(antes);
    expect(c.perfis[1].lancamentos.length).toBe(1);
  });

  it('apagar um perfil mantém os outros; cancelar cadastro novo volta ao anterior', () => {
    let c = abrirCofre({ ...empresa(), outrosPerfis: [base()] });
    c = reducerCofre(c, { t: 'trocarPerfil', indice: 1 });
    c = reducerCofre(c, { t: 'zerar' });
    expect(c.perfis.map((x) => x.empresa?.nome)).toEqual(['Metalúrgica Exemplo']);
    c = reducerCofre(c, { t: 'novoPerfil' });
    expect(c.perfis[c.ativo]).toBe(vazio);
    c = reducerCofre(c, { t: 'cancelarNovoPerfil' });
    expect(c.perfis[c.ativo].empresa?.nome).toBe('Metalúrgica Exemplo');
  });

  it('restaurar cópia com vários perfis troca tudo; cópia de um perfil troca só o aberto', () => {
    let c = abrirCofre(empresa());
    c = reducerCofre(c, { t: 'restaurar', dados: { ...base(), outrosPerfis: [empresa()] } });
    expect(c.perfis.map((x) => x.empresa?.nome)).toEqual(['Casa', 'Metalúrgica Exemplo']);
    c = reducerCofre(c, { t: 'restaurar', dados: base() });
    expect(c.perfis).toHaveLength(2);
  });
});
