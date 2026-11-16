// Valores em centavos (inteiros). Datas como 'AAAA-MM-DD' no fuso local.

export type Ramo = 'comercio' | 'servicos' | 'alimentacao' | 'construcao' | 'industria';

export type Bloco = 'entradas' | 'custos_variaveis' | 'despesas_fixas' | 'investimentos' | 'outras';

export type Sentido = 'entrada' | 'saida';

export type TipoConta = 'corrente' | 'caixa' | 'maquininha' | 'aplicacao';

export type TipoLancamento = 'entrada' | 'saida' | 'transferencia';

export type Status = 'pago' | 'previsto';

export interface Empresa {
  id: string;
  nome: string;
  ramo: Ramo;
  criadaEm: string;
  exemplo?: boolean;
}

export interface Conta {
  id: string;
  nome: string;
  tipo: TipoConta;
  saldoInicial: number;
  /** Data em que o saldo inicial vale. Só lançamentos a partir dela mexem no saldo. */
  dataSaldoInicial: string;
  arquivada: boolean;
}

export interface Categoria {
  id: string;
  nome: string;
  bloco: Bloco;
  sentido: Sentido;
  grupo?: string;
  oculta: boolean;
  ordem: number;
}

export interface Lancamento {
  id: string;
  tipo: TipoLancamento;
  valor: number;
  data: string;
  status: Status;
  contaId: string;
  /** Só em transferências. */
  contaDestinoId?: string;
  /** Vazio em transferências. */
  categoriaId?: string;
  descricao?: string;
  serieId?: string;
  parcela?: { n: number; total: number };
  origem: 'manual' | 'extrato';
  criadoEm: string;
  /** Linha do extrato que confirmou este lançamento (conciliado). */
  extratoId?: string;
}

export type SituacaoExtrato = 'pendente' | 'confirmada' | 'ignorada';

/** Linha importada de um extrato, aguardando revisão no Inbox bancário. */
export interface TransacaoExtrato {
  id: string;
  contaId: string;
  importacaoId: string;
  chave: string;
  data: string;
  descricao: string;
  /** Centavos com sinal: positivo entrou, negativo saiu. */
  valor: number;
  situacao: SituacaoExtrato;
  lancamentoId?: string;
}

export interface Importacao {
  id: string;
  contaId: string;
  arquivo: string;
  em: string;
  novas: number;
  bloqueadas: number;
}

/** Regra de memória: descrição que contém `trecho` vai para a categoria. */
export interface Regra {
  id: string;
  trecho: string;
  sentido: Sentido;
  categoriaId: string;
  usos: number;
}

export interface ModeloColunas {
  contaId: string;
  assinatura: string;
  mapeamento: import('./lib/importar').Mapeamento;
}

export interface Dados {
  versao: 1;
  empresa: Empresa | null;
  contas: Conta[];
  categorias: Categoria[];
  lancamentos: Lancamento[];
  extrato?: TransacaoExtrato[];
  importacoes?: Importacao[];
  regras?: Regra[];
  modelos?: ModeloColunas[];
  /** Versão do plano de contas padrão já aplicada (para incluir categorias novas em empresas antigas). */
  planoVersao?: number;
}
