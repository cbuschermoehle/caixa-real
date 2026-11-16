import { createContext, useContext } from 'react';

/** Informações da conta na nuvem. Fica `null` na versão de teste (dados só no navegador). */
export interface Sessao {
  email: string;
  estado: EstadoNuvem;
  sair: () => void;
}

export type EstadoNuvem = 'salvo' | 'salvando' | 'offline' | 'erro';

export const SessaoCtx = createContext<Sessao | null>(null);

export const useSessao = () => useContext(SessaoCtx);
