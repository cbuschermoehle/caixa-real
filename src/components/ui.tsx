import { emArvore } from '../lib/categorias';
import { useEffect, useRef, type ReactNode } from 'react';
import type { Categoria, Conta, Sentido } from '../types';
import { useBlocos } from '../data/store';
import { brl } from '../lib/format';

export function Folha({ titulo, aoFechar, children, tom }: { titulo: string; aoFechar: () => void; children: ReactNode; tom?: 'entrada' | 'saida' | 'transferencia' }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && aoFechar();
    window.addEventListener('keydown', esc);
    ref.current?.querySelector<HTMLElement>('input, select, button')?.focus();
    return () => window.removeEventListener('keydown', esc);
  }, [aoFechar]);
  return (
    <div className="folha-fundo" onMouseDown={(e) => e.target === e.currentTarget && aoFechar()}>
      <div className={`folha ${tom ? `folha-${tom}` : ''}`} role="dialog" aria-modal="true" aria-label={titulo} ref={ref}>
        <header className="folha-topo">
          <h2>{titulo}</h2>
          <button type="button" className="btn-icone" onClick={aoFechar} aria-label="Fechar">
            <Icone nome="x" />
          </button>
        </header>
        <div className="folha-corpo">{children}</div>
      </div>
    </div>
  );
}

export function Segmentos<T extends string>({ valor, opcoes, aoMudar, rotulo }: { valor: T; opcoes: { v: T; r: string }[]; aoMudar: (v: T) => void; rotulo: string }) {
  return (
    <div className="segmentos" role="radiogroup" aria-label={rotulo}>
      {opcoes.map((o) => (
        <button key={o.v} type="button" role="radio" aria-checked={valor === o.v} className={valor === o.v ? 'ativo' : ''} onClick={() => aoMudar(o.v)}>
          {o.r}
        </button>
      ))}
    </div>
  );
}

export function Chave({ id, ligada, aoMudar, children }: { id: string; ligada: boolean; aoMudar: (v: boolean) => void; children: ReactNode }) {
  return (
    <label className="chave" htmlFor={id}>
      <input id={id} type="checkbox" role="switch" checked={ligada} onChange={(e) => aoMudar(e.target.checked)} />
      <span className="chave-trilho" aria-hidden="true" />
      <span>{children}</span>
    </label>
  );
}

export function Campo({ rotulo, id, erro, ajuda, children }: { rotulo: string; id: string; erro?: string; ajuda?: ReactNode; children: ReactNode }) {
  return (
    <div className={`campo ${erro ? 'com-erro' : ''}`}>
      <label htmlFor={id}>{rotulo}</label>
      {children}
      {erro ? <p className="erro">{erro}</p> : ajuda ? <p className="ajuda">{ajuda}</p> : null}
    </div>
  );
}

export function SeletorCategoria({ id, valor, aoMudar, categorias, sentido }: { id: string; valor: string; aoMudar: (v: string) => void; categorias: Categoria[]; sentido: Sentido }) {
  const blocos = useBlocos();
  return (
    <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)}>
      <option value="">Escolha a categoria</option>
      {blocos.map((b) => {
        const lista = emArvore(categorias.filter((c) => c.bloco === b.id && c.sentido === sentido), categorias, valor);
        if (!lista.length) return null;
        return (
          <optgroup key={b.id} label={b.nome}>
            {lista.map(({ c, nivel }) => (
              <option key={c.id} value={c.id}>{nivel ? `\u00a0\u00a0\u00a0↳ ${c.nome}` : c.nome}</option>
            ))}
          </optgroup>
        );
      })}
    </select>
  );
}

export function SeletorConta({ id, valor, aoMudar, contas, excluir }: { id: string; valor: string; aoMudar: (v: string) => void; contas: Conta[]; excluir?: string }) {
  return (
    <select id={id} value={valor} onChange={(e) => aoMudar(e.target.value)}>
      <option value="">Escolha a conta</option>
      {contas
        .filter((c) => (!c.arquivada || c.id === valor) && c.id !== excluir)
        .map((c) => (
          <option key={c.id} value={c.id}>{c.nome}</option>
        ))}
    </select>
  );
}

export function Valor({ v, sinal, classe }: { v: number; sinal?: boolean; classe?: string }) {
  const tom = v > 0 ? 'pos' : v < 0 ? 'neg' : '';
  return <span className={`valor ${sinal ? tom : ''} ${classe ?? ''}`}>{sinal && v > 0 ? '+' : ''}{brl(v)}</span>;
}

const CAMINHOS: Record<string, string> = {
  x: 'M6 6l12 12M18 6L6 18',
  mais: 'M12 5v14M5 12h14',
  menos: 'M5 12h14',
  troca: 'M7 7h12l-3-3M17 17H5l3 3',
  painel: 'M4 13h6V4H4zM14 20h6v-9h-6zM4 20h6v-3H4zM14 7h6V4h-6z',
  lista: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  agenda: 'M7 3v3M17 3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zM9 14l2 2 4-4',
  relatorio: 'M5 20V10M12 20V4M19 20v-7',
  ajustes: 'M4 7h10M18 7h2M4 17h4M12 17h8M16 5v4M10 15v4',
  seta: 'M9 6l6 6-6 6',
  voltar: 'M15 6l-6 6 6 6',
  check: 'M5 12l5 5 9-10',
  dividir: 'M12 3v6M12 9l-6 6v6M12 9l6 6v6',
  banco: 'M3 10h18L12 4 3 10zM5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18',
  importar: 'M12 4v11M7 10l5 5 5-5M5 20h14',
  alerta: 'M12 8v5M12 16.5v.01M10.3 4l-7.6 13.2A2 2 0 0 0 4.4 20h15.2a2 2 0 0 0 1.7-2.8L13.7 4a2 2 0 0 0-3.4 0z',
  busca: 'M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14zM20 20l-4-4',
  lapis: 'M4 20h4L19 9l-4-4L4 16v4z',
  olho: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  olhoFechado: 'M3 3l18 18M10.6 6.1A10 10 0 0 1 12 6c6 0 10 6 10 6a17 17 0 0 1-3 3.5M6.6 6.6A17 17 0 0 0 2 12s4 7 10 7a9.6 9.6 0 0 0 4.4-1.1',
};

export function Icone({ nome, tamanho = 20 }: { nome: keyof typeof CAMINHOS | string; tamanho?: number }) {
  return (
    <svg width={tamanho} height={tamanho} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={CAMINHOS[nome] ?? ''} />
    </svg>
  );
}

/** Confirmação dentro da página (o navegador do artefato não mostra confirm()). */
export function Confirmar({ texto, rotuloOk, aoConfirmar, aoCancelar, perigo }: { texto: ReactNode; rotuloOk: string; aoConfirmar: () => void; aoCancelar: () => void; perigo?: boolean }) {
  return (
    <div className="confirmar" role="alertdialog">
      <p>{texto}</p>
      <div className="linha-botoes">
        <button type="button" className="btn" onClick={aoCancelar}>Cancelar</button>
        <button type="button" className={`btn ${perigo ? 'btn-perigo' : 'btn-primario'}`} onClick={aoConfirmar}>{rotuloOk}</button>
      </div>
    </div>
  );
}

/** Barra de % da renda comprometida, com cor por faixa (verde, amarelo, vermelho). */
export function BarraComprometida({ pct, faixa }: { pct: number; faixa: 'ok' | 'atencao' | 'alto' }) {
  return (
    <div className={`barra-progresso faixa-${faixa}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, pct)} aria-label="Renda comprometida">
      <span style={{ width: `${Math.min(100, pct)}%` }} />
      <i className="marca-50" aria-hidden="true" />
      <i className="marca-70" aria-hidden="true" />
    </div>
  );
}
