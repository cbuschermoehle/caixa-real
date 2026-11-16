import type { Dados } from '../types';
import { ehDados } from '../data/store';
import { hoje } from './format';

/** Gera o arquivo da cópia de segurança (JSON) e devolve o nome sugerido. */
export function arquivoDaCopia(dados: Dados): { nome: string; conteudo: string } {
  const empresa = (dados.empresa?.nome ?? 'caixa-real').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return { nome: `copia-${empresa || 'caixa-real'}-${hoje()}.json`, conteudo: JSON.stringify({ app: 'caixa-real', geradaEm: new Date().toISOString(), dados }) };
}

type Salvador = { save: (a: { filename: string; data: Blob }) => Promise<unknown> } | null;
type ClaudeJanela = { use: (n: string) => Promise<unknown> };

/** Baixa a cópia. Dentro do claude.ai (versão de teste) usa o salvamento da própria página. */
export async function baixarCopia(dados: Dados): Promise<string | null> {
  const { nome, conteudo } = arquivoDaCopia(dados);
  const claude = (window as unknown as { claude?: ClaudeJanela }).claude;
  if (claude?.use && window.self !== window.top) {
    const d = (await claude.use('downloads').catch(() => null)) as Salvador;
    if (d) {
      try {
        await d.save({ filename: nome, data: new Blob([conteudo], { type: 'application/json' }) });
        return null;
      } catch (e) {
        const c = (e as { code?: string }).code;
        return c === 'declined' ? null : 'Não foi possível salvar o arquivo aqui.';
      }
    }
  }
  const url = URL.createObjectURL(new Blob([conteudo], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
  return null;
}

/** Lê uma cópia de segurança. Aceita o arquivo gerado acima ou os dados puros. */
export function lerCopia(texto: string): Dados | null {
  try {
    const j = JSON.parse(texto);
    const d = j && j.app === 'caixa-real' ? j.dados : j;
    return ehDados(d) ? d : null;
  } catch {
    return null;
  }
}
