import { describe, expect, it } from 'vitest';
import type { Dados, Lancamento } from '../types';
import { planoDoRamo, planoPessoal } from '../data/planos';
import { dadosDeExemplo, dadosPessoaisDeExemplo } from '../data/exemplo';
import { abrirCofre, guardarCofre, reducerCofre, vazio } from '../data/store';
import { cascata, longoPrazo, saldos, totaisPrevistos } from './calc';
import { compromissos, futuroMensal, limitesDoMes, rendaComprometida } from './futuro';
import { faturaDaCompra, faturaDoPagamento, faturasDoCartao, resumoCartao, sincronizarFaturas, vencimentoDaFatura } from './cartao';
import { confirmarLinha, vinculoPara } from './conciliar';
import { adivinharMapeamento, aplicarMapeamento, comprasPositivas, ehPagamentoDeFatura, lerCSV } from './importar';

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
    const rc = rendaComprometida(d, '2026-11');
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

describe('futuro e lançamento rápido', () => {
  const montar = () => {
    const d = base();
    const sal = cat(d, 'Salário');
    const carro = cat(d, 'Financiamento do veículo');
    d.lancamentos = [
      // Salário previsto todo mês, de nov a fev.
      ...[0, 1, 2, 3].map((i) => l({ tipo: 'entrada', valor: 1_000_000, categoriaId: sal, data: ['2026-11-05', '2026-12-05', '2027-01-05', '2027-02-05'][i], status: i ? 'previsto' : 'pago' })),
      // Escola todo mês.
      ...['2026-11-08', '2026-12-08', '2027-01-08', '2027-02-08'].map((data) => l({ valor: 200_000, categoriaId: cat(d, 'Escola e cursos'), data, status: data <= '2026-11-20' ? 'pago' : 'previsto' })),
      // Carro: últimas 2 parcelas (dez e jan).
      ...[0, 1].map((i) => l({ valor: 150_000, categoriaId: carro, data: ['2026-12-15', '2027-01-15'][i], status: 'previsto', serieId: 'carro', parcela: { n: 47 + i, total: 48 }, descricao: 'Financiamento do carro' })),
      // TV em 3x no cartão.
      ...[0, 1, 2].map((i) => l({ contaId: 'cr', valor: 100_000, categoriaId: cat(d, 'Casa e manutenção'), data: '2026-11-06', fatura: ['2026-12', '2027-01', '2027-02'][i], serieId: 'tv', parcela: { n: i + 1, total: 3 }, descricao: 'TV' })),
      l({ contaId: 'cr', valor: 30_000, categoriaId: cat(d, 'Mercado'), data: '2026-11-07' }),
    ];
    return sincronizarFaturas(d, '2026-11-20');
  };

  it('comprometido de cada mês = essenciais + dívidas + parcelas do cartão', () => {
    const m = futuroMensal(montar(), '2026-11', 4);
    expect(m.map((x) => [x.mes, x.renda, x.comprometido, x.pct])).toEqual([
      ['2026-11', 1_000_000, 200_000, 20],
      ['2026-12', 1_000_000, 450_000, 45],
      ['2027-01', 1_000_000, 450_000, 45],
      ['2027-02', 1_000_000, 300_000, 30],
    ]);
    // Compra comum (não parcelada) no cartão entra em "outros", fora do comprometido.
    expect(m[1].outros).toBe(30_000);
  });

  it('lista o que termina primeiro, com o que falta pagar', () => {
    const c = compromissos(montar(), '2026-11-20');
    expect(c.map((x) => [x.nome, x.restantes, x.ultimoMes, x.valorRestante, x.noCartao])).toEqual([
      ['Financiamento do carro', 2, '2027-01', 300_000, false],
      ['TV', 3, '2027-02', 300_000, true],
    ]);
  });

  it('limite por categoria compara com o gasto do mês (cartão no mês da fatura)', () => {
    const d = montar();
    d.categorias = d.categorias.map((c) => (c.nome === 'Mercado' ? { ...c, limite: 40_000 } : c));
    expect(limitesDoMes(d, '2026-11')).toEqual([expect.objectContaining({ gasto: 0, pct: 0 })]);
    expect(limitesDoMes(d, '2026-12')).toEqual([expect.objectContaining({ gasto: 30_000, pct: 75, falta: 10_000 })]);
  });

  it('pendente fica guardado no perfil e sai ao completar', () => {
    let c = abrirCofre(base());
    c = reducerCofre(c, { t: 'pendente', pendente: { id: 'p1', valor: 18_740, data: '2026-11-17', descricao: 'mercado', criadoEm: '2026-11-17' } });
    expect(guardarCofre(c.perfis).pendentes).toHaveLength(1);
    c = reducerCofre(c, { t: 'excluirPendente', id: 'p1' });
    expect(c.perfis[0].pendentes).toEqual([]);
  });
});

describe('compra antiga lançada no cartão depois do cadastro', () => {
  it('faturas que venceram antes do cadastro do cartão não viram conta em aberto', () => {
    const d = base();
    const ipva = d.categorias.find((c) => c.nome === 'IPVA e licenciamento')!.id;
    // IPVA de maio em 6x; cartão cadastrado em 2026-11-01. Faturas jun a nov (vencem dia 10).
    d.lancamentos = Array.from({ length: 6 }, (_, i) =>
      l({ contaId: 'cr', valor: 50_000, categoriaId: ipva, data: '2026-05-04', serieId: 'ipva', parcela: { n: i + 1, total: 6 }, fatura: `2026-${String(6 + i).padStart(2, '0')}` }));
    const s = sincronizarFaturas(d, '2026-11-18');
    const faturas = faturasDoCartao(s, s.contas[1]);
    expect(faturas.map((f) => [f.mes, f.falta, !!f.anterior])).toEqual([
      ['2026-06', 0, true], ['2026-07', 0, true], ['2026-08', 0, true], ['2026-09', 0, true], ['2026-10', 0, true], ['2026-11', 50_000, false],
    ]);
    // Só a fatura que vence depois do cadastro ganha pagamento previsto.
    expect(s.lancamentos.filter((x) => x.faturaAuto).map((x) => x.fatura)).toEqual(['2026-11']);
  });
});

describe('parcelas lançadas depois do vencimento da fatura', () => {
  it('cartão cadastrado antes da compra: parcelas de faturas já vencidas quando lançadas não cobram nada', () => {
    const d = base();
    d.contas[1] = { ...d.contas[1], dataSaldoInicial: '2026-01-01' };
    const ipva = d.categorias.find((c) => c.nome === 'IPVA e licenciamento')!.id;
    d.lancamentos = Array.from({ length: 6 }, (_, i) =>
      l({ contaId: 'cr', valor: 46_421, categoriaId: ipva, data: '2026-05-11', criadoEm: '2026-11-18', serieId: 'ipva', parcela: { n: i + 1, total: 6 }, fatura: `2026-${String(6 + i).padStart(2, '0')}` }));
    // Uma compra de verdade, lançada no dia, na fatura de dezembro.
    d.lancamentos.push(l({ contaId: 'cr', valor: 10_000, categoriaId: d.categorias.find((c) => c.nome === 'Mercado')!.id, data: '2026-11-18', criadoEm: '2026-11-18', fatura: '2026-12' }));
    const s = sincronizarFaturas(d, '2026-11-18');
    expect(faturasDoCartao(s, s.contas[1]).map((f) => [f.mes, f.falta])).toEqual([
      ['2026-06', 0], ['2026-07', 0], ['2026-08', 0], ['2026-09', 0], ['2026-10', 0], ['2026-11', 0], ['2026-12', 10_000],
    ]);
    expect(s.lancamentos.filter((x) => x.faturaAuto).map((x) => x.fatura)).toEqual(['2026-12']);
  });
});

describe('importar fatura do cartão (CSV em inglês, estilo Nubank)', () => {
  const csv = 'date,title,amount\n2026-10-28,Padaria Exemplo,23.50\n2026-10-30,Pagamento recebido,-812.40\n2026-05-11,Imposto Exemplo - Parcela 6/6,464.21\n2026-11-01,Estorno Loja,-10.00\n';

  it('acha as colunas, inverte o sinal e reconhece o pagamento da fatura', () => {
    const tabela = lerCSV(csv);
    const m = adivinharMapeamento(tabela);
    expect([m.linhaCabecalho, m.data, m.descricao, m.valor]).toEqual([0, 0, 1, 2]);
    const linhas = aplicarMapeamento(tabela, m).linhas;
    expect(comprasPositivas(linhas)).toBe(true);
    const inv = aplicarMapeamento(tabela, { ...m, inverterSinal: true }).linhas.filter((l) => !ehPagamentoDeFatura(l.descricao));
    expect(inv.map((l) => l.valor)).toEqual([-2350, -46421, 1000]);
    expect(faturaDaCompra('2026-11-01', info)).toBe('2026-11');
  });

  it('parcela já lançada à mão é sugerida para ligar (mesma fatura), e a compra nova entra na fatura do arquivo', () => {
    const d = base();
    const ipva = Array.from({ length: 6 }, (_, i): Lancamento => ({
      id: `ip${i + 1}`, tipo: 'saida', valor: 46_421, data: '2026-05-11', status: 'pago', contaId: 'cr', origem: 'manual',
      criadoEm: '2026-11-18', fatura: `2026-${String(i + 6).padStart(2, '0')}`, parcela: { n: i + 1, total: 6 }, serieId: 'ip',
    }));
    d.lancamentos = ipva;
    const t = { id: 't', contaId: 'cr', importacaoId: 'i', chave: 'k', data: '2026-05-11', descricao: 'Imposto - Parcela 6/6', valor: -46_421, situacao: 'pendente' as const, fatura: '2026-11' };
    expect(vinculoPara(d, t)?.id).toBe('ip6');
    const cat = d.categorias.find((c) => c.nome === 'Mercado')!.id;
    const r = confirmarLinha(d, { ...t, id: 't2', descricao: 'Padaria', valor: -2350, data: '2026-10-28' }, { tipo: 'categoria', categoriaId: cat })!;
    expect(r.lancamento.fatura).toBe('2026-11');
  });
});
