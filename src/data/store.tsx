import { createContext, useContext, useEffect, useMemo, useReducer, useRef, type ReactNode } from 'react';
import { VERSAO_PLANO, atualizarPlano, blocosDe } from './planos';
import { sincronizarFaturas } from '../lib/cartao';
import type { Avaliacao, Bem, Categoria, Conta, Dados, Empresa, Importacao, Lancamento, ModeloColunas, Pendente, Regra, TransacaoExtrato } from '../types';

/*
 * Camada de dados. Sem nuvem configurada, tudo fica guardado no navegador (localStorage).
 * Com nuvem (Supabase), o ProvedorDados recebe os dados iniciais e uma função `salvar`
 * de fora (ver nuvem.tsx); as telas não percebem a diferença.
 */

const CHAVE = 'caixa-real:v1';
/** Perfil aberto neste aparelho (id da empresa). Fica só no navegador: trocar de perfil não mexe nos dados. */
const CHAVE_PERFIL = 'caixa-real:perfil';

export const vazio: Dados = { versao: 1, empresa: null, contas: [], categorias: [], lancamentos: [] };

export type Acao =
  | { t: 'iniciar'; empresa: Empresa; contas: Conta[]; categorias: Categoria[]; lancamentos?: Lancamento[]; pendentes?: Pendente[]; avaliacoes?: Avaliacao[]; bens?: Bem[] }
  | { t: 'empresa'; empresa: Empresa }
  | { t: 'conta'; conta: Conta }
  | { t: 'categoria'; categoria: Categoria }
  | { t: 'lancamentos'; lancamentos: Lancamento[] }
  | { t: 'lancamento'; lancamento: Lancamento }
  | { t: 'excluir'; ids: string[] }
  | { t: 'importar'; importacao: Importacao; transacoes: TransacaoExtrato[]; modelo?: ModeloColunas }
  | { t: 'conciliar'; itens: { transacao: TransacaoExtrato; lancamento?: Lancamento; extras?: Lancamento[] }[]; regras?: Regra[] }
  | { t: 'desfazerImportacao'; id: string }
  | { t: 'regra'; regra: Regra }
  | { t: 'excluirRegra'; id: string }
  | { t: 'restaurar'; dados: Dados }
  | { t: 'pendente'; pendente: Pendente }
  | { t: 'excluirPendente'; id: string }
  | { t: 'avaliar'; avaliacoes: Avaliacao[] }
  | { t: 'bem'; bem: Bem }
  | { t: 'excluirBem'; id: string }
  | { t: 'zerar' };

/** Ações sobre o conjunto de perfis (empresa e pessoal) da mesma conta. */
export type AcaoPerfil =
  | { t: 'trocarPerfil'; indice: number }
  | { t: 'novoPerfil' }
  | { t: 'cancelarNovoPerfil' };

function upsert<T extends { id: string }>(lista: T[], item: T): T[] {
  const i = lista.findIndex((x) => x.id === item.id);
  if (i < 0) return [...lista, item];
  const nova = lista.slice();
  nova[i] = item;
  return nova;
}

export function reducer(d: Dados, a: Acao): Dados {
  switch (a.t) {
    case 'iniciar':
      return { versao: 1, empresa: a.empresa, contas: a.contas, categorias: a.categorias, lancamentos: a.lancamentos ?? [], pendentes: a.pendentes, avaliacoes: a.avaliacoes, bens: a.bens, planoVersao: VERSAO_PLANO };
    case 'empresa':
      return { ...d, empresa: a.empresa };
    case 'conta':
      return { ...d, contas: upsert(d.contas, a.conta) };
    case 'categoria':
      return { ...d, categorias: upsert(d.categorias, a.categoria) };
    case 'lancamentos':
      return { ...d, lancamentos: [...d.lancamentos, ...a.lancamentos] };
    case 'lancamento':
      return { ...d, lancamentos: upsert(d.lancamentos, a.lancamento) };
    case 'excluir': {
      const ids = new Set(a.ids);
      const lancamentos = d.lancamentos.filter((l) => !ids.has(l.id));
      // Linha do extrato volta para revisão quando nenhum lançamento ligado a ela sobra (vale para linhas divididas).
      const ligadas = new Set(lancamentos.map((l) => l.extratoId).filter(Boolean));
      const extrato = d.extrato?.map((t) => (t.situacao === 'confirmada' && !ligadas.has(t.id) ? { ...t, situacao: 'pendente' as const, lancamentoId: undefined } : t));
      return { ...d, lancamentos, extrato };
    }
    case 'importar': {
      const modelos = (d.modelos ?? []).filter((m) => !(a.modelo && m.contaId === a.modelo.contaId && m.assinatura === a.modelo.assinatura));
      return {
        ...d,
        extrato: [...(d.extrato ?? []), ...a.transacoes],
        importacoes: [...(d.importacoes ?? []), a.importacao],
        modelos: a.modelo ? [...modelos, a.modelo] : d.modelos,
      };
    }
    case 'conciliar': {
      let extrato = d.extrato ?? [];
      let lancamentos = d.lancamentos;
      for (const it of a.itens) {
        extrato = upsert(extrato, it.transacao);
        if (it.lancamento) lancamentos = upsert(lancamentos, it.lancamento);
        for (const x of it.extras ?? []) lancamentos = upsert(lancamentos, x);
      }
      let regras = d.regras ?? [];
      for (const r of a.regras ?? []) regras = upsert(regras, r);
      return { ...d, extrato, lancamentos, regras };
    }
    case 'desfazerImportacao': {
      // Tira as linhas do arquivo e o que foi lançado a partir delas. Previstos que tinham sido baixados voltam a ser previstos.
      const linhas = new Set((d.extrato ?? []).filter((t) => t.importacaoId === a.id).map((t) => t.id));
      const lancamentos = d.lancamentos
        .filter((l) => !(l.extratoId && linhas.has(l.extratoId) && l.origem === 'extrato'))
        .map((l) => (l.extratoId && linhas.has(l.extratoId) ? { ...l, status: 'previsto' as const, extratoId: undefined } : l));
      return {
        ...d,
        lancamentos,
        extrato: (d.extrato ?? []).filter((t) => t.importacaoId !== a.id),
        importacoes: (d.importacoes ?? []).filter((i) => i.id !== a.id),
      };
    }
    case 'regra':
      return { ...d, regras: upsert(d.regras ?? [], a.regra) };
    case 'excluirRegra':
      return { ...d, regras: (d.regras ?? []).filter((r) => r.id !== a.id) };
    case 'restaurar':
      return migrar(semExtras(a.dados));
    case 'pendente':
      return { ...d, pendentes: upsert(d.pendentes ?? [], a.pendente) };
    case 'excluirPendente':
      return { ...d, pendentes: (d.pendentes ?? []).filter((p) => p.id !== a.id) };
    case 'avaliar': {
      // Uma avaliação por corretora, tipo e dia: a nova substitui a do mesmo dia.
      const chave = (x: Avaliacao) => `${x.contaId}|${x.tipo}|${x.data}`;
      const novas = new Set(a.avaliacoes.map(chave));
      return { ...d, avaliacoes: [...(d.avaliacoes ?? []).filter((x) => !novas.has(chave(x))), ...a.avaliacoes] };
    }
    case 'bem':
      return { ...d, bens: upsert(d.bens ?? [], a.bem) };
    case 'excluirBem':
      return { ...d, bens: (d.bens ?? []).filter((b) => b.id !== a.id) };
    case 'zerar':
      return vazio;
  }
}

/** Confere se um objeto tem cara de dados do Caixa Real (cópia de segurança, nuvem). */
export function ehDados(x: unknown): x is Dados {
  const d = x as Dados;
  return !!d && typeof d === 'object' && d.versao === 1 && Array.isArray(d.contas) && Array.isArray(d.categorias) && Array.isArray(d.lancamentos);
}

/** Inclui categorias novas do plano padrão em empresas criadas antes delas. */
export function migrar(d: Dados): Dados {
  if (d.empresa && d.empresa.tipo !== 'pessoal' && (d.planoVersao ?? 1) < VERSAO_PLANO) {
    return { ...d, categorias: atualizarPlano(d.categorias, d.planoVersao ?? 1), planoVersao: VERSAO_PLANO };
  }
  return d;
}

// ---------- Perfis ----------

/** Todos os perfis da conta e qual está aberto. */
export interface Cofre {
  perfis: Dados[];
  ativo: number;
}

const semExtras = (d: Dados): Dados => {
  if (!('outrosPerfis' in d)) return d;
  const { outrosPerfis: _, ...resto } = d;
  return resto;
};

/** Abre o formato guardado: o primeiro perfil na raiz e os demais em `outrosPerfis`. */
export function abrirCofre(guardado: Dados, idAtivo?: string | null): Cofre {
  const perfis = [semExtras(guardado), ...(guardado.outrosPerfis ?? []).filter(ehDados).map(semExtras)].map((p) => sincronizarFaturas(migrar(p)));
  const i = idAtivo ? perfis.findIndex((p) => p.empresa?.id === idAtivo) : -1;
  return { perfis, ativo: Math.max(0, i) };
}

/** Formato guardado. Perfis em branco (cadastro não terminado) não são gravados. */
export function guardarCofre(perfis: Dados[]): Dados {
  const cheios = perfis.filter((p) => p.empresa);
  if (!cheios.length) return vazio;
  const [primeiro, ...outros] = cheios.map(semExtras);
  return outros.length ? { ...primeiro, outrosPerfis: outros } : primeiro;
}

const lerPerfilAtivo = () => {
  try {
    return localStorage.getItem(CHAVE_PERFIL);
  } catch {
    return null;
  }
};
const gravarPerfilAtivo = (id?: string) => {
  try {
    if (id) localStorage.setItem(CHAVE_PERFIL, id);
  } catch {
    /* sem armazenamento */
  }
};

export function reducerCofre(c: Cofre, a: Acao | AcaoPerfil): Cofre {
  const trocar = (perfis: Dados[], ativo: number): Cofre => ({ perfis, ativo: Math.min(Math.max(0, ativo), perfis.length - 1) });
  switch (a.t) {
    case 'trocarPerfil': {
      // Some com perfis em branco que ficaram para trás (cadastro abandonado).
      const alvo = c.perfis[a.indice];
      if (!alvo) return c;
      const perfis = c.perfis.filter((p) => p.empresa || p === alvo);
      return trocar(perfis, perfis.indexOf(alvo));
    }
    case 'novoPerfil': {
      const perfis = c.perfis.filter((p) => p.empresa);
      return trocar([...perfis, vazio], perfis.length);
    }
    case 'cancelarNovoPerfil': {
      const perfis = c.perfis.filter((p) => p.empresa);
      return perfis.length ? trocar(perfis, 0) : c;
    }
    case 'zerar': {
      // Apaga só o perfil aberto; se for o único, volta ao cadastro.
      const perfis = c.perfis.filter((_, i) => i !== c.ativo);
      return perfis.length ? trocar(perfis, 0) : trocar([vazio], 0);
    }
    case 'restaurar':
      // Cópia com vários perfis substitui tudo; cópia de um perfil só substitui o perfil aberto.
      if (a.dados.outrosPerfis?.length) return abrirCofre(a.dados, c.perfis[c.ativo]?.empresa?.id);
      break;
  }
  const atual = c.perfis[c.ativo] ?? vazio;
  const novo = sincronizarFaturas(reducer(atual, a as Acao));
  if (novo === atual) return c;
  const perfis = c.perfis.slice();
  perfis[c.ativo] = novo;
  return { ...c, perfis };
}

export function carregarLocal(chave = CHAVE): Dados {
  try {
    const bruto = localStorage.getItem(chave);
    if (!bruto) return vazio;
    const d = JSON.parse(bruto);
    return ehDados(d) ? migrar(d) : vazio;
  } catch {
    return vazio;
  }
}

function salvarLocal(d: Dados) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(d));
  } catch {
    /* navegador sem armazenamento: segue funcionando só na memória */
  }
}

interface ValorCtx {
  /** Perfil aberto. */
  dados: Dados;
  despachar: (a: Acao | AcaoPerfil) => void;
  perfis: Dados[];
  ativo: number;
  /** Tudo, no formato da cópia de segurança (todos os perfis). */
  guardado: Dados;
}

const Ctx = createContext<ValorCtx | null>(null);

export function ProvedorDados({ children, inicial, salvar = salvarLocal }: { children: ReactNode; inicial?: Dados; salvar?: (d: Dados) => void }) {
  const [cofre, despachar] = useReducer(reducerCofre, inicial, (i) => abrirCofre(i ?? carregarLocal(), lerPerfilAtivo()));
  const guardado = useMemo(() => guardarCofre(cofre.perfis), [cofre.perfis]);
  const primeira = useRef(true);
  useEffect(() => {
    // Não regrava o que acabou de chegar, a não ser que a abertura (migração do plano, faturas) tenha mudado algo.
    if (primeira.current) {
      primeira.current = false;
      if (JSON.stringify(guardado) === JSON.stringify(inicial ?? carregarLocal())) return;
    }
    salvar(guardado);
  }, [guardado]); // eslint-disable-line react-hooks/exhaustive-deps
  const dados = cofre.perfis[cofre.ativo] ?? vazio;
  useEffect(() => gravarPerfilAtivo(dados.empresa?.id), [dados.empresa?.id]);
  const valor = useMemo(() => ({ dados, despachar, perfis: cofre.perfis, ativo: cofre.ativo, guardado }), [dados, cofre, guardado]);
  return <Ctx.Provider value={valor}>{children}</Ctx.Provider>;
}

export function useDados() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDados fora do ProvedorDados');
  return v;
}

/** Blocos do perfil aberto (nomes de empresa ou pessoais). */
export function useBlocos() {
  return blocosDe(useDados().dados.empresa);
}
