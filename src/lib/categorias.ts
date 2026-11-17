import type { Categoria, Lancamento } from '../types';

/** Categoria "mãe" de uma subcategoria (ou ela mesma, se não for sub). */
export function raiz(c: Categoria, cats: Map<string, Categoria>): Categoria {
  return (c.paiId && cats.get(c.paiId)) || c;
}

/** Nome para mostrar: "Salários › Fulano" quando é subcategoria. */
export function nomeCategoria(id: string | undefined, cats: Map<string, Categoria> | Categoria[]): string {
  const m = cats instanceof Map ? cats : new Map(cats.map((c) => [c.id, c]));
  const c = m.get(id ?? '');
  if (!c) return '';
  const pai = c.paiId ? m.get(c.paiId) : undefined;
  return pai ? `${pai.nome} › ${c.nome}` : c.nome;
}

/**
 * Lista em ordem para seletores: cada categoria seguida das suas subcategorias.
 * `nivel` 1 = subcategoria. Escondidas saem, menos a que está selecionada.
 */
export function emArvore(lista: Categoria[], todas: Categoria[] = lista, manter?: string): { c: Categoria; nivel: 0 | 1 }[] {
  const porOrdem = (a: Categoria, z: Categoria) => a.ordem - z.ordem;
  const ids = new Set(lista.map((c) => c.id));
  const visivel = (c: Categoria) => !c.oculta || c.id === manter;
  const out: { c: Categoria; nivel: 0 | 1 }[] = [];
  const raizes = lista.filter((c) => !c.paiId || !todas.some((p) => p.id === c.paiId)).sort(porOrdem);
  for (const r of raizes) {
    const filhas = lista.filter((c) => c.paiId === r.id && ids.has(c.id)).sort(porOrdem);
    const filhasVisiveis = filhas.filter((c) => (visivel(c) && !r.oculta) || c.id === manter);
    if (!visivel(r) && !filhasVisiveis.length) continue;
    out.push({ c: r, nivel: 0 });
    filhasVisiveis.forEach((c) => out.push({ c, nivel: 1 }));
  }
  return out;
}

/** Ids da categoria e de todas as suas subcategorias (para filtros). */
export function comSubs(id: string, todas: Categoria[]): Set<string> {
  return new Set([id, ...todas.filter((c) => c.paiId === id).map((c) => c.id)]);
}

const NOME_DOC = { os: 'OS', pedido: 'Pedido' } as const;

/** "NF 1234 (OS 567)", "OS 567" ou "" — para listas e relatório. */
export function rotuloDocumento(l: Pick<Lancamento, 'documento' | 'nf'>): string {
  const doc = l.documento?.numero ? `${NOME_DOC[l.documento.tipo]} ${l.documento.numero}` : '';
  if (l.nf) return doc ? `NF ${l.nf} (${doc})` : `NF ${l.nf}`;
  return doc;
}
