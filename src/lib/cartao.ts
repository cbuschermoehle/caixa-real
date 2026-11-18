import type { Conta, Dados, InfoCartao, Lancamento } from '../types';
import { hoje, mesCurto, mesDe, novoId, somaMesesMes, ultimoDiaDoMes } from './format';

/*
 * Cartão de crédito em regime de caixa.
 * A compra entra no cartão (não mexe no dinheiro disponível) e cai na fatura do mês certo.
 * Cada fatura vira um pagamento previsto da conta corrente para o cartão, que o app
 * cria e atualiza sozinho. O dinheiro só sai quando esse pagamento é confirmado.
 */

export const ehCartao = (c: Conta | undefined): c is Conta & { cartao: InfoCartao } => !!c && c.tipo === 'cartao' && !!c.cartao;

const pad = (n: number) => String(n).padStart(2, '0');

/** Dia `dia` do mês, ou o último dia se o mês for mais curto (dia 31 em fevereiro = 28/29). */
export function diaNoMes(mes: string, dia: number): string {
  const ultimo = Number(ultimoDiaDoMes(mes).slice(8, 10));
  return `${mes}-${pad(Math.min(Math.max(1, dia), ultimo))}`;
}

/** Data de vencimento da fatura do mês `fatura` (AAAA-MM). */
export const vencimentoDaFatura = (fatura: string, info: InfoCartao) => diaNoMes(fatura, info.vencimento);

/** Data de fechamento da fatura do mês `fatura`. Se o vencimento vem antes do fechamento no mês, fechou no mês anterior. */
export function fechamentoDaFatura(fatura: string, info: InfoCartao): string {
  const mes = info.vencimento > info.fechamento ? fatura : somaMesesMes(fatura, -1);
  return diaNoMes(mes, info.fechamento);
}

/**
 * Em que fatura cai uma compra: compras até a véspera do fechamento entram na fatura que fecha naquele mês;
 * do dia do fechamento em diante, na seguinte. A fatura é identificada pelo mês do vencimento.
 */
export function faturaDaCompra(data: string, info: InfoCartao): string {
  const mes = mesDe(data);
  const mesFechamento = data < diaNoMes(mes, info.fechamento) ? mes : somaMesesMes(mes, 1);
  return info.vencimento > info.fechamento ? mesFechamento : somaMesesMes(mesFechamento, 1);
}

/** Fatura que um pagamento feito em `data` provavelmente quitou: a de vencimento mais próximo. */
export function faturaDoPagamento(data: string, info: InfoCartao): string {
  const mes = mesDe(data);
  const opcoes = [somaMesesMes(mes, -1), mes, somaMesesMes(mes, 1)];
  const dist = (f: string) => Math.abs(Date.parse(vencimentoDaFatura(f, info)) - Date.parse(data));
  return opcoes.sort((a, b) => dist(a) - dist(b))[0];
}

/** Compras e estornos do cartão (não inclui pagamentos de fatura). */
const ehDoCartao = (l: Lancamento, id: string) => l.tipo !== 'transferencia' && l.contaId === id;
/** Pagamentos de fatura: transferências que entram no cartão. */
const ehPagamento = (l: Lancamento, id: string) => l.tipo === 'transferencia' && l.contaDestinoId === id;

export interface Fatura {
  mes: string;
  vencimento: string;
  fechamento: string;
  /** Compras menos estornos. */
  total: number;
  /** Pagamentos já confirmados. */
  pago: number;
  /** O que ainda falta pagar (nunca negativo). */
  falta: number;
  /** Venceu antes de o cartão ser cadastrado no app: já foi paga por fora, não cobra nada. */
  anterior?: boolean;
  /** Compras lançadas no app só depois que esta fatura venceu (ex.: IPVA de maio lançado em novembro): já pagas por fora. */
  retroativo: number;
  compras: Lancamento[];
}

/** Todas as faturas do cartão, da mais antiga para a mais nova. */
export function faturasDoCartao(dados: Dados, conta: Conta): Fatura[] {
  if (!ehCartao(conta)) return [];
  const info = conta.cartao;
  const mapa = new Map<string, Fatura>();
  const pegar = (mes: string) => {
    let f = mapa.get(mes);
    if (!f) {
      f = { mes, vencimento: vencimentoDaFatura(mes, info), fechamento: fechamentoDaFatura(mes, info), total: 0, pago: 0, falta: 0, retroativo: 0, compras: [] };
      mapa.set(mes, f);
    }
    return f;
  };
  for (const l of dados.lancamentos) {
    if (ehDoCartao(l, conta.id)) {
      const f = pegar(l.fatura ?? faturaDaCompra(l.data, info));
      f.total += l.tipo === 'saida' ? l.valor : -l.valor;
      f.compras.push(l);
      if (l.tipo === 'saida' && l.criadoEm.slice(0, 10) > f.vencimento) f.retroativo += l.valor;
    } else if (ehPagamento(l, conta.id) && l.status === 'pago') {
      pegar(l.fatura ?? faturaDoPagamento(l.data, info)).pago += l.valor;
    }
  }
  const lista = [...mapa.values()].sort((a, b) => a.mes.localeCompare(b.mes));
  for (const f of lista) {
    // Compras antigas lançadas depois (ex.: IPVA de maio parcelado no cartão, lançado em novembro):
    // faturas que venceram antes do cadastro do cartão, e parcelas lançadas depois do vencimento da
    // fatura delas, já foram pagas fora do app e não viram conta em aberto.
    f.anterior = f.vencimento < conta.dataSaldoInicial;
    f.falta = f.anterior ? 0 : Math.max(0, f.total - f.pago - f.retroativo);
    f.compras.sort((a, b) => a.data.localeCompare(b.data));
  }
  return lista;
}

export interface ResumoCartao {
  conta: Conta & { cartao: InfoCartao };
  /** Fatura que recebe as compras de hoje. */
  aberta: Fatura | null;
  mesAberta: string;
  /** Faturas com algo a pagar, por ordem de vencimento (inclui atrasadas). */
  aPagar: Fatura[];
  /** Soma do que falta pagar em todas as faturas (o que está usando do limite). */
  usado: number;
  /** Quanto das faturas futuras já está comprometido em parcelas. */
  futuro: number;
}

export function resumoCartao(dados: Dados, conta: Conta, ref = hoje()): ResumoCartao | null {
  if (!ehCartao(conta)) return null;
  const faturas = faturasDoCartao(dados, conta);
  const mesAberta = faturaDaCompra(ref, conta.cartao);
  return {
    conta,
    mesAberta,
    aberta: faturas.find((f) => f.mes === mesAberta) ?? null,
    aPagar: faturas.filter((f) => f.falta > 0),
    usado: faturas.reduce((a, f) => a + f.falta, 0),
    futuro: faturas.filter((f) => f.mes > mesAberta).reduce((a, f) => a + f.falta, 0),
  };
}

/** Conta que paga a fatura: a escolhida no cartão ou a primeira conta corrente ativa. */
export function contaQuePaga(dados: Dados, conta: Conta): Conta | undefined {
  const escolhida = dados.contas.find((c) => c.id === conta.cartao?.contaPagamentoId && !c.arquivada && c.tipo !== 'cartao');
  return escolhida ?? dados.contas.find((c) => !c.arquivada && c.tipo === 'corrente') ?? dados.contas.find((c) => !c.arquivada && c.tipo !== 'cartao' && c.tipo !== 'aplicacao');
}

/**
 * Mantém os pagamentos de fatura previstos em dia com as compras.
 * - Compras sem fatura recebem a fatura certa (ex.: vindas da importação do extrato).
 * - Cada fatura com saldo em aberto tem um pagamento previsto com o valor que falta.
 * - Fatura quitada (ou sem compras) não tem pagamento previsto automático.
 * Devolve o mesmo objeto quando nada muda.
 */
export function sincronizarFaturas(dados: Dados, ref = hoje()): Dados {
  const cartoes = dados.contas.filter(ehCartao);
  const temAuto = dados.lancamentos.some((l) => l.faturaAuto);
  if (!cartoes.length && !temAuto) return dados;
  const porId = new Map(cartoes.map((c) => [c.id, c]));
  let mudou = false;

  // 1. Fatura em compras e pagamentos que ainda não têm.
  let lancamentos = dados.lancamentos.map((l) => {
    if (l.fatura) return l;
    const doCartao = l.tipo === 'transferencia' ? porId.get(l.contaDestinoId ?? '') : porId.get(l.contaId);
    if (!doCartao) return l;
    mudou = true;
    const fatura = l.tipo === 'transferencia' ? faturaDoPagamento(l.data, doCartao.cartao) : faturaDaCompra(l.data, doCartao.cartao);
    return { ...l, fatura };
  });

  // 2. Pagamentos previstos automáticos.
  const remover = new Set<string>();
  const novos: Lancamento[] = [];
  const atualizar = new Map<string, Lancamento>();
  const autos = lancamentos.filter((l) => l.faturaAuto && l.status === 'previsto');
  for (const a of autos) if (!porId.has(a.contaDestinoId ?? '')) remover.add(a.id); // cartão apagado ou mudou de tipo
  for (const conta of cartoes) {
    const base: Dados = { ...dados, lancamentos };
    const pagadora = contaQuePaga(dados, conta);
    const faturas = new Map(faturasDoCartao(base, conta).map((f) => [f.mes, f]));
    const meus = autos.filter((a) => a.contaDestinoId === conta.id);
    const meses = new Set([...faturas.keys(), ...meus.map((a) => a.fatura ?? '')]);
    for (const mes of meses) {
      const f = faturas.get(mes);
      const falta = f?.falta ?? 0;
      const existentes = meus.filter((a) => a.fatura === mes);
      if (falta <= 0 || conta.arquivada) {
        existentes.forEach((a) => remover.add(a.id));
        continue;
      }
      const [primeiro, ...sobras] = existentes;
      sobras.forEach((a) => remover.add(a.id));
      if (primeiro) {
        if (primeiro.valor !== falta) atualizar.set(primeiro.id, { ...primeiro, valor: falta });
      } else if (pagadora && f) {
        novos.push({
          id: novoId(), tipo: 'transferencia', valor: falta, data: f.vencimento, status: 'previsto',
          contaId: pagadora.id, contaDestinoId: conta.id, descricao: `Fatura ${conta.nome} ${mesCurto(`${mes}-01`)}`,
          fatura: mes, faturaAuto: true, origem: 'manual', criadoEm: ref,
        });
      }
    }
  }
  if (remover.size || atualizar.size || novos.length) {
    mudou = true;
    lancamentos = lancamentos.filter((l) => !remover.has(l.id)).map((l) => atualizar.get(l.id) ?? l).concat(novos);
  }
  return mudou ? { ...dados, lancamentos } : dados;
}

/**
 * Data em que um lançamento mexe no caixa. Compras no cartão contam no vencimento da fatura
 * (é quando o dinheiro sai de verdade); o resto, na própria data.
 */
export function dataDeCaixa(l: Lancamento, contas: Map<string, Conta>): string {
  if (l.tipo === 'transferencia') return l.data;
  const c = contas.get(l.contaId);
  if (!ehCartao(c)) return l.data;
  return vencimentoDaFatura(l.fatura ?? faturaDaCompra(l.data, c.cartao), c.cartao);
}

/** Lançamento de compra/estorno em conta de cartão. */
export const ehCompraNoCartao = (l: Lancamento, contas: Map<string, Conta>) => l.tipo !== 'transferencia' && ehCartao(contas.get(l.contaId));
