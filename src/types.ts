// Valores em centavos (inteiros). Datas como 'AAAA-MM-DD' no fuso local.

export type Ramo = 'comercio' | 'servicos' | 'alimentacao' | 'construcao' | 'industria' | 'pessoal';

/** Perfil de empresa (padrão) ou de finanças pessoais/da casa. */
export type TipoPerfil = 'empresa' | 'pessoal';

/** No perfil pessoal os mesmos blocos ganham outros nomes; 'dividas' só existe no pessoal. */
export type Bloco = 'entradas' | 'custos_variaveis' | 'despesas_fixas' | 'dividas' | 'investimentos' | 'outras';

export type Sentido = 'entrada' | 'saida';

export type TipoConta = 'corrente' | 'caixa' | 'maquininha' | 'aplicacao' | 'cartao';

export type TipoLancamento = 'entrada' | 'saida' | 'transferencia';

export type Status = 'pago' | 'previsto';

export interface Empresa {
  id: string;
  nome: string;
  ramo: Ramo;
  criadaEm: string;
  exemplo?: boolean;
  /** Ausente = empresa (dados criados antes dos perfis). */
  tipo?: TipoPerfil;
}

/** Dados do cartão de crédito (dias de 1 a 31). */
export interface InfoCartao {
  fechamento: number;
  vencimento: number;
  limite?: number;
  /** Conta de onde sai o pagamento da fatura. */
  contaPagamentoId?: string;
}

export interface Conta {
  id: string;
  nome: string;
  tipo: TipoConta;
  saldoInicial: number;
  /** Data em que o saldo inicial vale. Só lançamentos a partir dela mexem no saldo. */
  dataSaldoInicial: string;
  arquivada: boolean;
  /** Só em contas do tipo cartão de crédito. */
  cartao?: InfoCartao;
}

export interface Categoria {
  id: string;
  nome: string;
  bloco: Bloco;
  sentido: Sentido;
  grupo?: string;
  oculta: boolean;
  ordem: number;
  /** Subcategoria: id da categoria "mãe" (mesmo bloco e sentido). No relatório soma dentro da mãe. */
  paiId?: string;
  /** Limite de gasto por mês (centavos), opcional. */
  limite?: number;
}

/** Gasto anotado às pressas (Lançamento rápido), esperando categoria e forma de pagamento. */
export interface Pendente {
  id: string;
  valor: number;
  data: string;
  descricao?: string;
  criadoEm: string;
  /** Foto do cupom: caminho no Supabase Storage, ou imagem embutida (data:) na versão de teste. */
  foto?: string;
}

/** Tipos de investimento no modo simples (sem ativo por ativo). */
export type TipoInvestimento = 'acoes' | 'fiis' | 'etfs' | 'cripto' | 'exterior' | 'renda_fixa' | 'previdencia';

/** Quanto valia um tipo de investimento numa corretora/carteira numa data (digitado à mão). */
export interface Avaliacao {
  id: string;
  contaId: string;
  tipo: TipoInvestimento;
  data: string;
  valor: number;
}

export type TipoBem = 'imovel' | 'veiculo' | 'outro';

/** Bem do patrimônio (casa, carro...). Não é dinheiro: não mexe em saldo nenhum. */
export interface Bem {
  id: string;
  nome: string;
  tipo: TipoBem;
  /** Valores informados ao longo do tempo, do mais antigo para o mais novo. */
  valores: { data: string; valor: number }[];
}

/** Documento de origem de uma conta a receber (OS ou pedido), antes de virar nota fiscal. */
export interface Documento {
  tipo: 'os' | 'pedido';
  numero: string;
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
  /** OS ou pedido que originou a conta a receber. */
  documento?: Documento;
  /** Número da nota fiscal (numeração própria, diferente da OS/pedido). */
  nf?: string;
  /**
   * Cartão de crédito: mês (AAAA-MM) em que vence a fatura desta compra.
   * Em pagamentos de fatura (transferência para o cartão), a fatura que está sendo paga.
   */
  fatura?: string;
  /** Pagamento de fatura previsto criado e atualizado sozinho pelo app. */
  faturaAuto?: boolean;
  /** Foto do cupom (veio do Lançamento rápido). Mesmo formato de `Pendente.foto`. */
  anexo?: string;
  /** No pessoal: lançamento da empresa (distribuição de lucros, pró-labore) que originou esta entrada. */
  repasse?: { perfilId: string; lancamentoId: string };
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
  /** Fatura do cartão (AAAA-MM) de onde veio a linha, quando o arquivo importado é uma fatura. */
  fatura?: string;
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
  /**
   * Só no formato guardado (nuvem, navegador e cópia de segurança): os outros perfis da mesma conta.
   * O primeiro perfil fica na raiz, assim versões antigas do app continuam abrindo a empresa.
   */
  outrosPerfis?: Dados[];
  /** Lançamentos rápidos ainda não completados. Não mexem no saldo. */
  pendentes?: Pendente[];
  /** Valor atual dos investimentos, por corretora e tipo (histórico). */
  avaliacoes?: Avaliacao[];
  /** Bens do patrimônio. */
  bens?: Bem[];
  /** Repasses da empresa que a pessoa disse não serem dela (ids dos lançamentos da empresa). */
  repassesIgnorados?: string[];
  /** Lembretes de renovação já resolvidos (chave categoria|data prevista). */
  lembretesVistos?: string[];
}
