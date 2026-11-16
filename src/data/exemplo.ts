import type { Categoria, Conta, Empresa, Lancamento } from '../types';
import { hoje, isoDe, novoId, somaDias, somaMeses } from '../lib/format';
import { planoDoRamo } from './planos';

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
