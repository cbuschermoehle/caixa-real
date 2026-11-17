import type { Bloco, Categoria, Empresa, Ramo, Sentido } from '../types';
import { novoId } from '../lib/format';

/** Ramos de empresa (o perfil pessoal usa o ramo 'pessoal', que não aparece nesta lista). */
export const RAMOS: { id: Exclude<Ramo, 'pessoal'>; nome: string; exemplo: string }[] = [
  { id: 'comercio', nome: 'Comércio / Varejo', exemplo: 'Loja, mercado, revenda' },
  { id: 'servicos', nome: 'Prestação de Serviços', exemplo: 'Oficina, salão, consultoria' },
  { id: 'alimentacao', nome: 'Alimentação / Delivery', exemplo: 'Restaurante, lanchonete, padaria' },
  { id: 'construcao', nome: 'Construção', exemplo: 'Obras, reformas, empreiteira' },
  { id: 'industria', nome: 'Indústria', exemplo: 'Fábrica, usinagem, manufatura' },
];

export interface InfoBloco { id: Bloco; nome: string; curto: string; ajuda: string }

/** Blocos do perfil empresa, na ordem do relatório. */
export const BLOCOS: InfoBloco[] = [
  { id: 'entradas', nome: 'Entradas', curto: 'Entradas', ajuda: 'O dinheiro que entra pelas vendas e serviços.' },
  { id: 'custos_variaveis', nome: 'Custos variáveis', curto: 'Custos variáveis', ajuda: 'Gastos que crescem junto com as vendas.' },
  { id: 'despesas_fixas', nome: 'Despesas fixas', curto: 'Despesas fixas', ajuda: 'Gastos que existem todo mês, vendendo ou não.' },
  { id: 'investimentos', nome: 'Investimentos', curto: 'Investimentos', ajuda: 'Gastos para melhorar ou expandir o negócio.' },
  { id: 'outras', nome: 'Outras movimentações', curto: 'Outras', ajuda: 'Empréstimos, aportes, parcelamentos e retiradas. Mexem no saldo, mas ficam fora dos indicadores.' },
];

/** Blocos do perfil pessoal, na ordem do relatório. */
export const BLOCOS_PESSOAL: InfoBloco[] = [
  { id: 'entradas', nome: 'Renda', curto: 'Renda', ajuda: 'Salário, pró-labore, lucros recebidos e outras rendas.' },
  { id: 'despesas_fixas', nome: 'Gastos essenciais', curto: 'Essenciais', ajuda: 'Contas da casa que vêm todo mês: moradia, escola, saúde, seguros.' },
  { id: 'custos_variaveis', nome: 'Dia a dia', curto: 'Dia a dia', ajuda: 'Gastos que mudam de um mês para outro: mercado, combustível, lazer.' },
  { id: 'dividas', nome: 'Dívidas e financiamentos', curto: 'Dívidas', ajuda: 'Parcelas de financiamento, empréstimos, consórcio e juros.' },
  { id: 'investimentos', nome: 'Investimentos', curto: 'Investimentos', ajuda: 'Dinheiro guardado para o futuro: aportes em ações, fundos, previdência.' },
  { id: 'outras', nome: 'Outras movimentações', curto: 'Outras', ajuda: 'Reembolsos, venda de bens e outros valores fora do dia a dia. Mexem no saldo, mas ficam fora dos indicadores.' },
];

export const ehPessoal = (e: Empresa | null | undefined) => e?.tipo === 'pessoal';

export type LinhaRelatorio =
  | { bloco: Bloco; op: '+' | '−' | '±' }
  | { resultado: 'margem' | 'operacional' | 'aposInvestimentos' | 'variacao'; rotulo: string; forte?: boolean };

/** Ordem das linhas do relatório em cascata (blocos e resultados) de cada tipo de perfil. */
export function linhasDoRelatorio(e: Empresa | null | undefined): LinhaRelatorio[] {
  if (ehPessoal(e)) {
    return [
      { bloco: 'entradas', op: '+' },
      { bloco: 'despesas_fixas', op: '−' },
      { bloco: 'custos_variaveis', op: '−' },
      { bloco: 'dividas', op: '−' },
      { resultado: 'operacional', rotulo: '= Quanto sobrou' },
      { bloco: 'investimentos', op: '−' },
      { resultado: 'aposInvestimentos', rotulo: '= Depois dos investimentos' },
      { bloco: 'outras', op: '±' },
      { resultado: 'variacao', rotulo: '= Variação do caixa', forte: true },
    ];
  }
  return [
    { bloco: 'entradas', op: '+' },
    { bloco: 'custos_variaveis', op: '−' },
    { resultado: 'margem', rotulo: '= Margem de contribuição' },
    { bloco: 'despesas_fixas', op: '−' },
    { resultado: 'operacional', rotulo: '= Resultado operacional' },
    { bloco: 'investimentos', op: '−' },
    { resultado: 'aposInvestimentos', rotulo: '= Resultado após investimentos' },
    { bloco: 'outras', op: '±' },
    { resultado: 'variacao', rotulo: '= Variação do caixa', forte: true },
  ];
}

/** Blocos do perfil (empresa ou pessoal). */
export const blocosDe = (e: Empresa | null | undefined): InfoBloco[] => (ehPessoal(e) ? BLOCOS_PESSOAL : BLOCOS);

export const nomeBloco = (b: Bloco, e?: Empresa | null) => (blocosDe(e).find((x) => x.id === b) ?? BLOCOS_PESSOAL.find((x) => x.id === b))!.nome;

type Item = [nome: string, grupo?: string];

const ENTRADAS: Record<Exclude<Ramo, 'pessoal'>, string[]> = {
  comercio: ['Vendas à vista (dinheiro/Pix)', 'Vendas no cartão', 'Vendas a prazo (boleto/crediário)', 'Outras receitas'],
  servicos: ['Serviços prestados', 'Contratos mensais', 'Reembolso de despesas do cliente', 'Outras receitas'],
  alimentacao: ['Vendas no balcão/salão', 'Vendas por aplicativo', 'Taxa de entrega recebida', 'Outras receitas'],
  construcao: ['Medições de obra', 'Sinal de contrato', 'Serviços avulsos', 'Outras receitas'],
  industria: ['Venda de produtos', 'Serviços de industrialização', 'Venda de sucata', 'Outras receitas'],
};

const CUSTOS: Record<Exclude<Ramo, 'pessoal'>, string[]> = {
  comercio: ['Compra de mercadoria para revenda', 'Fretes', 'Embalagens', 'Comissão de vendedores', 'Taxa da maquininha', 'Imposto sobre vendas (DAS/Simples)', 'Juros e taxas de antecipação'],
  servicos: ['Materiais usados no serviço', 'Serviços terceirizados', 'Comissões', 'Deslocamento até o cliente', 'Imposto sobre notas (DAS/ISS)', 'Taxa da maquininha', 'Juros e taxas de antecipação'],
  alimentacao: ['Ingredientes e insumos', 'Bebidas para revenda', 'Embalagens', 'Taxa dos aplicativos de delivery', 'Entregadores', 'Gás', 'Taxa da maquininha', 'Imposto sobre vendas (DAS)', 'Juros e taxas de antecipação'],
  construcao: ['Materiais de obra', 'Empreiteiros e mão de obra terceirizada', 'Aluguel de equipamentos', 'Fretes e caçambas', 'Imposto sobre notas (DAS/ISS)', 'Juros e taxas de antecipação'],
  industria: ['Matéria-prima', 'Material para revenda', 'Serviços terceirizados', 'Ferramentas e consumíveis', 'Fretes', 'Comissões', 'Impostos sobre vendas (Simples/ICMS)', 'Tarifas de boleto e cartão', 'Juros e taxas de antecipação'],
};

const FIXAS: Item[] = [
  ['Salários', 'Pessoal'], ['Pró-labore', 'Pessoal'], ['INSS e FGTS', 'Pessoal'], ['13º e férias', 'Pessoal'],
  ['Vale-transporte e alimentação', 'Pessoal'], ['Plano de saúde', 'Pessoal'],
  ['Aluguel e condomínio', 'Estrutura'], ['Energia', 'Estrutura'], ['Água', 'Estrutura'], ['Internet e telefone', 'Estrutura'],
  ['IPTU, alvará e taxas', 'Estrutura'], ['Manutenção e limpeza', 'Estrutura'],
  ['Contador', 'Administrativo'], ['Softwares e sistemas', 'Administrativo'], ['Tarifas bancárias', 'Administrativo'],
  ['Material de escritório', 'Administrativo'], ['Combustível e veículos', 'Administrativo'], ['Seguros', 'Administrativo'],
];

const FIXAS_EXTRAS: Partial<Record<Ramo, Item[]>> = {
  industria: [['Manutenção de máquinas', 'Estrutura'], ['Segurança do trabalho (EPI, exames)', 'Pessoal']],
  construcao: [['Manutenção de máquinas', 'Estrutura'], ['Segurança do trabalho (EPI, exames)', 'Pessoal']],
  comercio: [['Aluguel da maquininha', 'Administrativo']],
};

const INVESTIMENTOS = ['Máquinas e equipamentos', 'Reformas e estrutura', 'Móveis e informática', 'Marketing e divulgação', 'Cursos e consultoria'];

const OUTRAS_ENTRADAS = ['Empréstimos recebidos', 'Recebimento de boleto antecipado', 'Aporte dos sócios', 'Venda de bens usados', 'Rendimentos de aplicações'];
const OUTRAS_SAIDAS = ['Parcelas de empréstimos', 'Pagamento de boleto antecipado', 'Parcelamento de impostos (REFIS)', 'Juros e multas por atraso', 'Distribuição de lucros', 'Retiradas dos sócios'];

const PESSOAL: [Bloco, Sentido, Item[]][] = [
  ['entradas', 'entrada', [['Salário'], ['Pró-labore'], ['Distribuição de lucros'], ['13º e férias'], ['Aluguéis recebidos'], ['Renda extra'], ['Outras rendas']]],
  ['despesas_fixas', 'saida', [
    ['Aluguel ou prestação da casa', 'Moradia'], ['Condomínio', 'Moradia'], ['Energia', 'Moradia'], ['Água', 'Moradia'], ['Gás', 'Moradia'],
    ['Internet, TV e celular', 'Moradia'], ['IPTU', 'Moradia'], ['Diarista ou empregada', 'Moradia'],
    ['Escola e cursos', 'Família'], ['Plano de saúde', 'Família'],
    ['Seguro do carro', 'Seguros e impostos'], ['Seguro de vida', 'Seguros e impostos'], ['Seguro da casa', 'Seguros e impostos'], ['IPVA e licenciamento', 'Seguros e impostos'],
  ]],
  ['custos_variaveis', 'saida', [
    ['Mercado'], ['Combustível'], ['Restaurantes e delivery'], ['Farmácia e saúde'], ['Transporte e aplicativos'], ['Manutenção do carro'],
    ['Lazer e viagens'], ['Roupas e cuidados pessoais'], ['Casa e manutenção'], ['Presentes'], ['Pets'], ['Assinaturas e streaming'], ['Outros gastos'],
  ]],
  ['dividas', 'saida', [['Financiamento do veículo'], ['Financiamento imobiliário'], ['Empréstimos'], ['Consórcio'], ['Juros, IOF e anuidade do cartão'], ['Juros e multas por atraso']]],
  ['investimentos', 'saida', [['Ações'], ['Fundos imobiliários (FIIs)'], ['ETFs'], ['Criptomoedas'], ['Investimentos no exterior'], ['Renda fixa e poupança'], ['Previdência privada']]],
  ['outras', 'entrada', [['Reembolsos'], ['Venda de bens usados'], ['Resgate de investimentos'], ['Dividendos e rendimentos'], ['Empréstimo recebido']]],
  ['outras', 'saida', [['Compra de bens (carro, imóvel)'], ['Ajuda a familiares'], ['Outras saídas']]],
];

/** Categorias prontas do perfil pessoal. */
export function planoPessoal(): Categoria[] {
  let ordem = 0;
  return PESSOAL.flatMap(([bloco, sentido, itens]) =>
    itens.map(([nome, grupo]) => ({ id: novoId(), nome, bloco, sentido, grupo, oculta: false, ordem: ordem++ })),
  );
}

export function planoDoRamo(ramo: Ramo): Categoria[] {
  if (ramo === 'pessoal') return planoPessoal();
  const lista: Categoria[] = [];
  let ordem = 0;
  const add = (nome: string, bloco: Bloco, sentido: Sentido, grupo?: string) =>
    lista.push({ id: novoId(), nome, bloco, sentido, grupo, oculta: false, ordem: ordem++ });

  ENTRADAS[ramo].forEach((n) => add(n, 'entradas', 'entrada'));
  CUSTOS[ramo].forEach((n) => add(n, 'custos_variaveis', 'saida'));
  [...FIXAS, ...(FIXAS_EXTRAS[ramo] ?? [])].forEach(([n, g]) => add(n, 'despesas_fixas', 'saida', g));
  INVESTIMENTOS.forEach((n) => add(n, 'investimentos', 'saida'));
  OUTRAS_ENTRADAS.forEach((n) => add(n, 'outras', 'entrada'));
  OUTRAS_SAIDAS.forEach((n) => add(n, 'outras', 'saida'));
  return lista;
}

export const sentidoDoBloco = (b: Bloco): Sentido | null =>
  b === 'entradas' ? 'entrada' : b === 'outras' ? null : 'saida';

export const VERSAO_PLANO = 3;

/** Categorias criadas depois da versão 1 do plano, para acrescentar em empresas já existentes. */
const NOVAS_POR_VERSAO: Record<number, [nome: string, bloco: Bloco, sentido: Sentido][]> = {
  2: [
    ['Recebimento de boleto antecipado', 'outras', 'entrada'],
    ['Pagamento de boleto antecipado', 'outras', 'saida'],
    ['Juros e taxas de antecipação', 'custos_variaveis', 'saida'],
  ],
};

/** Acrescenta categorias novas do plano padrão que a empresa ainda não tem (pelo nome, no mesmo bloco). */
export function atualizarPlano(categorias: Categoria[], versaoAtual: number): Categoria[] {
  let ordem = Math.max(0, ...categorias.map((c) => c.ordem)) + 1;
  const out = categorias.slice();
  for (let v = versaoAtual + 1; v <= VERSAO_PLANO; v++) {
    for (const [nome, bloco, sentido] of NOVAS_POR_VERSAO[v] ?? []) {
      if (out.some((c) => c.bloco === bloco && c.nome.toLowerCase() === nome.toLowerCase())) continue;
      out.push({ id: novoId(), nome, bloco, sentido, oculta: false, ordem: ordem++ });
    }
    // v3: juros e taxas de antecipação passam de Outras movimentações para Custos variáveis.
    if (v === 3) {
      const destino = out.find((c) => c.bloco === 'custos_variaveis' && /juros e taxas de antecipa/i.test(c.nome));
      for (let i = 0; i < out.length; i++) {
        const c = out[i];
        if (c.bloco === 'outras' && c.sentido === 'saida' && /juros e taxas de antecipa/i.test(c.nome) && !destino) {
          out[i] = { ...c, bloco: 'custos_variaveis' };
        }
      }
    }
  }
  return out;
}
