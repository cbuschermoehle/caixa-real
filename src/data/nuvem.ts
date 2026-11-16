import { createClient, type Session } from '@supabase/supabase-js';
import type { Dados } from '../types';
import { ehDados } from './store';

/*
 * Conversa com o Supabase (banco de dados + login).
 * Cada usuário tem uma única linha na tabela `caixa`, com todos os dados da empresa em JSON.
 * A coluna `revisao` evita que um aparelho apague, sem perceber, o que outro acabou de salvar.
 */

const URL = import.meta.env.VITE_SUPABASE_URL as string;
const CHAVE = import.meta.env.VITE_SUPABASE_ANON_KEY as string;

export const supabase = createClient(URL, CHAVE, {
  auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, storageKey: 'caixa-real:sessao' },
});

export type { Session };

export async function entrar(email: string, senha: string) {
  const { error } = await supabase.auth.signInWithPassword({ email, password: senha });
  return error ? traduzir(error.message) : null;
}

export async function criarConta(email: string, senha: string) {
  const { data, error } = await supabase.auth.signUp({ email, password: senha, options: { emailRedirectTo: enderecoDoApp() } });
  if (error) return { erro: traduzir(error.message), confirmar: false };
  return { erro: null, confirmar: !data.session };
}

export async function recuperarSenha(email: string) {
  const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: enderecoDoApp() });
  return error ? traduzir(error.message) : null;
}

export async function trocarSenha(senha: string) {
  const { error } = await supabase.auth.updateUser({ password: senha });
  return error ? traduzir(error.message) : null;
}

export async function sair() {
  await supabase.auth.signOut();
}

function enderecoDoApp() {
  return location.origin + location.pathname;
}

export interface Remoto {
  dados: Dados | null;
  revisao: number;
}

export async function baixar(usuario: string): Promise<Remoto> {
  const { data, error } = await supabase.from('caixa').select('dados, revisao').eq('user_id', usuario).maybeSingle();
  if (error) throw new Error(traduzir(error.message));
  if (!data) return { dados: null, revisao: 0 };
  return { dados: ehDados(data.dados) ? data.dados : null, revisao: Number(data.revisao) };
}

/**
 * Grava os dados se ninguém mais gravou desde a `revisao` que este aparelho conhece.
 * Devolve a nova revisão, ou 'conflito' quando outro aparelho salvou antes.
 */
export async function enviar(usuario: string, dados: Dados, revisao: number): Promise<number | 'conflito'> {
  if (revisao === 0) {
    const { error } = await supabase.from('caixa').insert({ user_id: usuario, dados, revisao: 1 });
    if (error) {
      if (error.code === '23505') return 'conflito';
      throw new Error(traduzir(error.message));
    }
    return 1;
  }
  const { data, error } = await supabase
    .from('caixa')
    .update({ dados, revisao: revisao + 1, atualizado_em: new Date().toISOString() })
    .eq('user_id', usuario)
    .eq('revisao', revisao)
    .select('revisao');
  if (error) throw new Error(traduzir(error.message));
  if (!data || data.length === 0) return 'conflito';
  return revisao + 1;
}

function traduzir(m: string): string {
  const t = m.toLowerCase();
  if (t.includes('invalid login')) return 'E-mail ou senha incorretos.';
  if (t.includes('email not confirmed')) return 'Falta confirmar o e-mail: abra o link que enviamos para a sua caixa de entrada.';
  if (t.includes('already registered')) return 'Este e-mail já tem cadastro. Use "Entrar".';
  if (t.includes('password should be')) return 'A senha precisa ter pelo menos 8 caracteres.';
  if (t.includes('rate limit') || t.includes('security purposes')) return 'Muitas tentativas seguidas. Espere um minuto e tente de novo.';
  if (t.includes('failed to fetch') || t.includes('network')) return 'Sem conexão com a internet.';
  if (t.includes('valid email') || t.includes('invalid format')) return 'Confira o e-mail digitado.';
  return m;
}
