import { createContext, useContext, useEffect, useReducer, useRef, type ReactNode } from 'react';
import { VERSAO_PLANO, atualizarPlano } from './planos';
import type { Categoria, Conta, Dados, Empresa, Importacao, Lancamento, ModeloColunas, Regra, TransacaoExtrato } from '../types';

/*
 * Camada de dados. Sem nuvem configurada, tudo fica guardado no navegador (localStorage).
 * Com nuvem (Supabase), o ProvedorDados recebe os dados iniciais e uma função `salvar`
 * de fora (ver nuvem.tsx); as telas não percebem a diferença.
 */

const CHAVE = 'caixa-real:v1';

export const vazio: Dados = { versao: 1, empresa: null, contas: [], categorias: [], lancamentos: [] };

export type Acao =
  | { t: 'iniciar'; empresa: Empresa; contas: Conta[]; categorias: Categoria[]; lancamentos?: Lancamento[] }
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
  | { t: 'zerar' };

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
      return { versao: 1, empresa: a.empresa, contas: a.contas, categorias: a.categorias, lancamentos: a.lancamentos ?? [], planoVersao: VERSAO_PLANO };
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
      return migrar(a.dados);
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
  if (d.empresa && (d.planoVersao ?? 1) < VERSAO_PLANO) {
    return { ...d, categorias: atualizarPlano(d.categorias, d.planoVersao ?? 1), planoVersao: VERSAO_PLANO };
  }
  return d;
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

const Ctx = createContext<{ dados: Dados; despachar: (a: Acao) => void } | null>(null);

export function ProvedorDados({ children, inicial, salvar = salvarLocal }: { children: ReactNode; inicial?: Dados; salvar?: (d: Dados) => void }) {
  const [dados, despachar] = useReducer(reducer, inicial, (i) => (i ? migrar(i) : carregarLocal()));
  const primeira = useRef(true);
  useEffect(() => {
    // Não regrava o que acabou de chegar, a não ser que a migração do plano tenha mudado algo.
    if (primeira.current) {
      primeira.current = false;
      if (inicial && dados === inicial) return;
    }
    salvar(dados);
  }, [dados]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={{ dados, despachar }}>{children}</Ctx.Provider>;
}

export function useDados() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useDados fora do ProvedorDados');
  return v;
}
