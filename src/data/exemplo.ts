import type { Categoria, Conta, Dados, Empresa, Lancamento } from '../types';
import { hoje, isoDe, novoId, somaDias, somaMeses, somaMesesMes } from '../lib/format';
import { faturaDaCompra, sincronizarFaturas } from '../lib/cartao';
import { planoDoRamo, planoPessoal } from './planos';

/** Gera uma empresa fictícia (indústria) com ~3 meses de movimento, para testar as telas. */
export function dadosDeExemplo(ref = hoje()) {
  const empresa: Empresa = { id: novoId(), nome: 'Metalúrgica Exemplo', ramo: 'industria', criadaEm: ref, exemplo: true };
  const inicio = somaDias(ref, -75);
  const conta = (nome: string, tipo: Conta['tipo'], saldo: number): Conta => ({
    id: novoId(), nome, tipo, saldoInicial: saldo * 100, dataSaldoInicial: inicio, arquivada: false,
  });
  const pj = conta('Conta PJ', 'corrente', 38_000);
  const caixa = conta('Caixa (dinheiro)', 'caixa', 600);
  const maq = conta('Maquininha', 'maquininha', 0);
  const apl = conta('Aplicação', 'aplicacao', 45_000);
  const contas = [pj, caixa, maq, apl];
  const categorias: Categoria[] = planoDoRamo('industria');
  const cat = (nome: string) => categorias.find((c) => c.nome === nome)!.id;

  // Gerador pseudoaleatório fixo, para o exemplo ser sempre igual.
  let semente = 7;
  const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
  const entre = (a: number, b: number) => Math.round((a + rnd() * (b - a)) * 100);

  const lanc: Lancamento[] = [];
  const add = (tipo: 'entrada' | 'saida', data: string, valor: number, categoria: string, descricao: string, contaId = pj.id, extra: Partial<Lancamento> = {}) =>
    lanc.push({
      id: novoId(), tipo, valor, data, status: data <= ref ? 'pago' : 'previsto', contaId,
      categoriaId: cat(categoria), descricao, origem: 'manual', criadoEm: ref, ...extra,
    });

  const fim = somaDias(ref, 45);
  for (let d = inicio; d <= fim; d = somaDias(d, 1)) {
    const dia = Number(d.slice(8, 10));
    const semana = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, dia).getDay();
    const util = semana > 0 && semana < 6;
    if (util && rnd() < 0.55) add('entrada', d, entre(1_800, 9_500), 'Venda de produtos', `NF ${2500 + lanc.length}`);
    if (util && rnd() < 0.15) add('entrada', d, entre(300, 1_400), 'Venda de produtos', 'Venda balcão', maq.id);
    if (util && rnd() < 0.3) add('saida', d, entre(900, 5_200), 'Matéria-prima', 'Aço e chapas');
    if (util && rnd() < 0.12) add('saida', d, entre(150, 700), 'Ferramentas e consumíveis', 'Brocas e discos', caixa.id);
    if (util && rnd() < 0.1) add('saida', d, entre(250, 900), 'Fretes', 'Transportadora');
    if (dia === 5) {
      add('saida', d, 1_850_000, 'Salários', 'Folha do mês');
      add('saida', d, 600_000, 'Pró-labore', 'Pró-labore sócios');
      add('saida', d, 420_000, 'Aluguel e condomínio', 'Aluguel do galpão');
    }
    if (dia === 10) add('saida', d, entre(1_600, 2_300), 'Energia', 'PAGTO ENERGIA CELESC');
    if (dia === 15) add('saida', d, 95_000, 'Contador', 'Escritório contábil');
    if (dia === 20) {
      add('saida', d, entre(3_800, 5_600), 'Impostos sobre vendas (Simples/ICMS)', 'DAS Simples Nacional');
      add('saida', d, 52_000, 'INSS e FGTS', 'FGTS e INSS');
    }
    if (dia === 22) add('saida', d, 18_990, 'Internet e telefone', 'Internet fibra');
    if (dia === 25) add('saida', d, 12_900, 'Softwares e sistemas', 'Sistema de notas');
  }

  // Um investimento, uma transferência para a aplicação e duas contas atrasadas.
  add('saida', somaDias(ref, -30), 1_250_000, 'Máquinas e equipamentos', 'Torno CNC (entrada)');
  lanc.push({
    id: novoId(), tipo: 'transferencia', valor: 1_000_000, data: somaDias(ref, -20), status: 'pago',
    contaId: pj.id, contaDestinoId: apl.id, descricao: 'Aplicação mensal', origem: 'manual', criadoEm: ref,
  });
  const atrasada = (dias: number, valor: number, categoria: string, descricao: string, tipo: 'entrada' | 'saida' = 'saida') =>
    lanc.push({
      id: novoId(), tipo, valor, data: somaDias(ref, -dias), status: 'previsto', contaId: pj.id,
      categoriaId: cat(categoria), descricao, origem: 'manual', criadoEm: ref,
    });
  atrasada(3, 480_000, 'Venda de produtos', 'NF 2488 - cliente atrasou', 'entrada');
  atrasada(2, 26_000, 'Água', 'Conta de água');
  // Recebimentos parcelados de um pedido grande.
  const serie = novoId();
  for (let i = 0; i < 3; i++) {
    const data = somaMeses(somaDias(ref, 6), i);
    lanc.push({
      id: novoId(), tipo: 'entrada', valor: 1_400_000, data, status: 'previsto', contaId: pj.id,
      categoriaId: cat('Venda de produtos'), descricao: 'Pedido 318 - Construtora Alfa', serieId: serie,
      parcela: { n: i + 1, total: 3 }, origem: 'manual', criadoEm: ref,
    });
  }
  // Parcelamentos longos: só as parcelas a partir do início do exemplo.
  const parcelamento = (primeira: string, total: number, valor: number, categoria: string, descricao: string) => {
    const serieId = novoId();
    for (let i = 0; i < total; i++) {
      const data = somaMeses(primeira, i);
      if (data < inicio) continue;
      lanc.push({
        id: novoId(), tipo: 'saida', valor, data, status: data <= ref ? 'pago' : 'previsto', contaId: pj.id,
        categoriaId: cat(categoria), descricao, serieId, parcela: { n: i + 1, total }, origem: 'manual', criadoEm: ref,
      });
    }
  };
  parcelamento(somaMeses(ref.slice(0, 8) + '20', -52), 145, 21_000, 'Parcelamento de impostos (REFIS)', 'PGTO REFIS SIMPLES');
  parcelamento(somaMeses(ref.slice(0, 8) + '20', -60), 145, 38_500, 'Parcelamento de impostos (REFIS)', 'PGTO REFIS INSS');
  parcelamento(somaMeses(ref.slice(0, 8) + '12', -20), 48, 330_000, 'Parcelas de empréstimos', 'Parcela Pronampe');

  return { empresa, contas, categorias, lancamentos: lanc, geradoEm: isoDe(new Date()) };
}

/** Gera finanças pessoais fictícias com ~3 meses de movimento, cartão de crédito e financiamento. Valores inventados. */
export function dadosPessoaisDeExemplo(ref = hoje()) {
  const empresa: Empresa = { id: novoId(), nome: 'Família Exemplo', ramo: 'pessoal', tipo: 'pessoal', criadaEm: ref, exemplo: true };
  const inicio = somaDias(ref, -80);
  const conta = (nome: string, tipo: Conta['tipo'], saldo: number): Conta => ({
    id: novoId(), nome, tipo, saldoInicial: saldo * 100, dataSaldoInicial: inicio, arquivada: false,
  });
  const cc = conta('Conta corrente', 'corrente', 8_500);
  const carteira = conta('Carteira (dinheiro)', 'caixa', 300);
  const cartao: Conta = { ...conta('Cartão de crédito', 'cartao', 0), cartao: { fechamento: 3, vencimento: 10, limite: 1_500_000, contaPagamentoId: cc.id } };
  const inv = conta('Investimentos', 'aplicacao', 62_000);
  const contas = [cc, carteira, cartao, inv];
  const categorias: Categoria[] = planoPessoal();
  const cat = (nome: string) => categorias.find((c) => c.nome === nome)!.id;

  let semente = 11;
  const rnd = () => ((semente = (semente * 16807) % 2147483647) / 2147483647);
  const entre = (a: number, b: number) => Math.round((a + rnd() * (b - a)) * 100);

  const lanc: Lancamento[] = [];
  const add = (tipo: 'entrada' | 'saida', data: string, valor: number, categoria: string, descricao: string, contaId = cc.id, extra: Partial<Lancamento> = {}) =>
    lanc.push({
      id: novoId(), tipo, valor, data, status: data <= ref ? 'pago' : 'previsto', contaId,
      categoriaId: cat(categoria), descricao, origem: 'manual', criadoEm: ref, ...extra,
    });
  // Compra no cartão: sempre "paga" (já aconteceu); o dinheiro sai quando a fatura é paga.
  const noCartao = (data: string, valor: number, categoria: string, descricao: string, extra: Partial<Lancamento> = {}) => {
    if (data > ref) return;
    add('saida', data, valor, categoria, descricao, cartao.id, { status: 'pago', ...extra });
  };

  const fim = somaDias(ref, 40);
  for (let d = inicio; d <= fim; d = somaDias(d, 1)) {
    const dia = Number(d.slice(8, 10));
    const semana = new Date(Number(d.slice(0, 4)), Number(d.slice(5, 7)) - 1, dia).getDay();
    if (semana === 6 && rnd() < 0.9) noCartao(d, entre(380, 720), 'Mercado', 'Supermercado');
    if (semana === 3 && rnd() < 0.6) noCartao(d, entre(90, 220), 'Mercado', 'Hortifruti');
    if (semana === 1 && rnd() < 0.8) noCartao(d, entre(220, 320), 'Combustível', 'Posto de combustível');
    if ((semana === 5 || semana === 0) && rnd() < 0.5) noCartao(d, entre(80, 260), 'Restaurantes e delivery', 'Restaurante');
    if (rnd() < 0.05) noCartao(d, entre(40, 180), 'Farmácia e saúde', 'Farmácia');
    if (rnd() < 0.04 && d <= ref) add('saida', d, entre(20, 90), 'Outros gastos', 'Feira e pequenos gastos', carteira.id);
    if (dia === 2) {
      noCartao(d, 5_590, 'Assinaturas e streaming', 'Streaming de vídeo');
      noCartao(d, 2_190, 'Assinaturas e streaming', 'Música');
    }
    if (dia === 5) add('entrada', d, 900_000, 'Pró-labore', 'Pró-labore');
    if (dia === 15) add('entrada', d, 450_000, 'Distribuição de lucros', 'Lucros da empresa');
    if (dia === 6) add('saida', d, 150_000, 'Fundos imobiliários (FIIs)', 'Aporte mensal');
    if (dia === 8) add('saida', d, 140_000, 'Escola e cursos', 'Mensalidade escolar');
    if (dia === 10) add('saida', d, 85_000, 'Condomínio', 'Condomínio');
    if (dia === 12) add('saida', d, entre(260, 380), 'Energia', 'Conta de luz');
    if (dia === 14) add('saida', d, entre(90, 140), 'Água', 'Conta de água');
    if (dia === 18) noCartao(d, 18_990, 'Internet, TV e celular', 'Internet e celular');
    if (dia === 20) add('saida', d, 110_000, 'Plano de saúde', 'Plano de saúde');
  }

  // Financiamento do carro: 48 parcelas, começou há 14 meses (só as parcelas a partir do início do exemplo).
  const serieCarro = novoId();
  const primeira = somaMeses(ref.slice(0, 8) + '15', -14);
  for (let i = 0; i < 48; i++) {
    const data = somaMeses(primeira, i);
    if (data < inicio) continue;
    add('saida', data, 189_000, 'Financiamento do veículo', 'Financiamento do carro', cc.id, { serieId: serieCarro, parcela: { n: i + 1, total: 48 } });
  }

  // Seguro do carro em 10x no cartão (compra feita há 2 meses) e uma TV em 6x feita há 10 dias.
  const parcelado = (data: string, total: number, valor: number, categoria: string, descricao: string) => {
    const serieId = novoId();
    const f0 = faturaDaCompra(data, cartao.cartao!);
    for (let i = 0; i < total; i++) {
      noCartao(data, valor, categoria, descricao, { serieId, parcela: { n: i + 1, total }, fatura: somaMesesMes(f0, i) });
    }
  };
  parcelado(somaDias(ref, -62), 10, 38_000, 'Seguro do carro', 'Seguro do carro');
  parcelado(somaDias(ref, -10), 6, 54_900, 'Casa e manutenção', 'TV nova');

  // Faturas: cria os pagamentos previstos e dá como pagas as que já venceram.
  let dados: Dados = { versao: 1, empresa, contas, categorias, lancamentos: lanc };
  dados = sincronizarFaturas(dados, ref);
  const lancamentos = dados.lancamentos.map((l) => (l.faturaAuto && l.data < ref ? { ...l, status: 'pago' as const } : l));
  return { empresa, contas, categorias, lancamentos, geradoEm: isoDe(new Date()) };
}
