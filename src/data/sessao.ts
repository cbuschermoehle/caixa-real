import { createContext, useContext } from 'react';

/** Informações da conta na nuvem. Fica `null` na versão de teste (dados só no navegador). */
export interface Sessao {
  email: string;
  estado: EstadoNuvem;
  sair: () => void;
  /** Fotos de cupom guardadas no Supabase Storage. */
  fotos?: ServicoFotos;
}

/** Onde as fotos dos cupons ficam guardadas. `ref` é o que vai nos dados (Pendente.foto, Lancamento.anexo). */
export interface ServicoFotos {
  /** Guarda a imagem e devolve a referência. Lança erro com mensagem em português. */
  enviar: (nome: string, imagem: Blob) => Promise<string>;
  /** Endereço para mostrar a imagem (temporário). */
  endereco: (ref: string) => Promise<string>;
  apagar: (ref: string) => Promise<void>;
}

export type EstadoNuvem = 'salvo' | 'salvando' | 'offline' | 'erro';

export const SessaoCtx = createContext<Sessao | null>(null);

export const useSessao = () => useContext(SessaoCtx);
