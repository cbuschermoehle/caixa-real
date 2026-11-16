/*
 * Leitura de extratos bancários: OFX, CSV e XLSX.
 * Tudo roda no navegador; nenhum arquivo sai do aparelho.
 */

export interface LinhaExtrato {
  data: string; // AAAA-MM-DD
  descricao: string;
  valor: number; // centavos, com sinal (+ entrou, − saiu)
  fitid?: string;
}

// ---------- Texto ----------

/** Decodifica o arquivo tentando UTF-8 e caindo para Windows-1252 (comum em bancos brasileiros). */
export function decodificar(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  const cabeca = new TextDecoder('latin1').decode(bytes.slice(0, 400));
  if (/CHARSET:\s*1252|ENCODING:\s*USASCII|encoding="(windows-1252|iso-8859-1)"/i.test(cabeca)) {
    return new TextDecoder('windows-1252').decode(bytes);
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes).replace(/^﻿/, '');
  } catch {
    return new TextDecoder('windows-1252').decode(bytes);
  }
}

/** Normaliza descrições para comparar: maiúsculas, sem acento, espaços simples. */
export function normalizar(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

// ---------- Datas e valores ----------

const pad = (n: number) => String(n).padStart(2, '0');

/** Lê datas em dd/mm/aaaa, dd/mm/aa, dd-mm-aaaa, aaaa-mm-dd, aaaammdd ou número serial do Excel. */
export function lerData(bruto: string | number): string | null {
  if (typeof bruto === 'number' || /^\d{5}(\.\d+)?$/.test(String(bruto).trim())) {
    const n = Math.floor(Number(bruto));
    if (n < 20000 || n > 80000) return null;
    const d = new Date(Date.UTC(1899, 11, 30) + n * 86_400_000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  const s = String(bruto).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{4})(\d{2})(\d{2})/);
  if (m) return valida(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (m) {
    let a = +m[3];
    if (a < 100) a += 2000;
    return valida(a, +m[2], +m[1]);
  }
  return null;
}

function valida(a: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || a < 1990 || a > 2100) return null;
  const dt = new Date(a, m - 1, d);
  if (dt.getMonth() !== m - 1) return null;
  return `${a}-${pad(m)}-${pad(d)}`;
}

/**
 * Lê valores com sinal: "-1.234,56", "1.234,56-", "(123,45)", "123,45 D", "R$ -50", "1234.56".
 * "D" (débito) vira negativo; "C" (crédito) positivo.
 */
export function lerValor(bruto: string | number): number | null {
  if (typeof bruto === 'number') return Number.isFinite(bruto) ? Math.round(bruto * 100) : null;
  let s = bruto.trim().toUpperCase().replace(/R\$|\s/g, '');
  if (!s) return null;
  let neg = false;
  if (/^\(.*\)$/.test(s)) { neg = true; s = s.slice(1, -1); }
  if (/D$/.test(s)) { neg = true; s = s.slice(0, -1); }
  else if (/C$/.test(s)) s = s.slice(0, -1);
  if (s.endsWith('-')) { neg = true; s = s.slice(0, -1); }
  if (s.startsWith('-')) { neg = !neg; s = s.slice(1); }
  if (s.startsWith('+')) s = s.slice(1);
  const ultVirg = s.lastIndexOf(',');
  const ultPonto = s.lastIndexOf('.');
  if (ultVirg > ultPonto) s = s.replace(/\./g, '').replace(',', '.');
  else if (ultPonto > ultVirg && ultVirg >= 0) s = s.replace(/,/g, '');
  else if (ultPonto >= 0 && s.split('.').length > 2) s = s.replace(/\./g, '');
  else if (ultPonto >= 0 && /^\d{1,3}\.\d{3}$/.test(s)) s = s.replace('.', '');
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const v = Math.round(parseFloat(s) * 100);
  return neg ? -v : v;
}

// ---------- OFX ----------

function tag(bloco: string, nome: string): string | undefined {
  const m = bloco.match(new RegExp(`<${nome}>([^<\\r\\n]*)`, 'i'));
  return m ? m[1].trim() : undefined;
}

export function lerOFX(texto: string): LinhaExtrato[] {
  const blocos = texto.split(/<STMTTRN>/i).slice(1).map((b) => b.split(/<\/STMTTRN>/i)[0]);
  const out: LinhaExtrato[] = [];
  for (const b of blocos) {
    const data = lerData(tag(b, 'DTPOSTED') ?? '');
    const valor = lerValor(tag(b, 'TRNAMT') ?? '');
    if (!data || valor === null || valor === 0) continue;
    const memo = tag(b, 'MEMO') ?? '';
    const nome = tag(b, 'NAME') ?? '';
    const descricao = [nome, memo].filter((x, i, a) => x && a.indexOf(x) === i).join(' - ') || 'Sem descrição';
    out.push({ data, valor, descricao: descricao.replace(/&amp;/g, '&'), fitid: tag(b, 'FITID') || undefined });
  }
  return out;
}

// ---------- CSV ----------

export function lerCSV(texto: string): string[][] {
  const linhasBrutas = texto.split(/\r?\n/).filter((l) => l.trim());
  const amostra = linhasBrutas.slice(0, 10).join('\n');
  const contar = (c: string) => (amostra.match(new RegExp(c === '\t' ? '\t' : `\\${c}`, 'g')) ?? []).length;
  const sep = [';', ',', '\t', '|'].sort((a, b) => contar(b) - contar(a))[0];
  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;
  for (let i = 0; i < texto.length; i++) {
    const c = texto[i];
    if (aspas) {
      if (c === '"' && texto[i + 1] === '"') { campo += '"'; i++; }
      else if (c === '"') aspas = false;
      else campo += c;
    } else if (c === '"') aspas = true;
    else if (c === sep) { linha.push(campo.trim()); campo = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && texto[i + 1] === '\n') i++;
      linha.push(campo.trim());
      if (linha.some((x) => x)) linhas.push(linha);
      linha = [];
      campo = '';
    } else campo += c;
  }
  linha.push(campo.trim());
  if (linha.some((x) => x)) linhas.push(linha);
  return linhas;
}

// ---------- XLSX (zip + XML, sem biblioteca) ----------

async function descompactar(buf: ArrayBuffer): Promise<Map<string, Uint8Array>> {
  const v = new DataView(buf);
  const bytes = new Uint8Array(buf);
  // Acha o diretório central pelo registro "fim do diretório".
  let fim = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 66000); i--) {
    if (v.getUint32(i, true) === 0x06054b50) { fim = i; break; }
  }
  if (fim < 0) throw new Error('Arquivo Excel inválido.');
  const total = v.getUint16(fim + 10, true);
  let p = v.getUint32(fim + 16, true);
  const arquivos = new Map<string, Uint8Array>();
  const dec = new TextDecoder();
  for (let k = 0; k < total; k++) {
    if (v.getUint32(p, true) !== 0x02014b50) break;
    const metodo = v.getUint16(p + 10, true);
    const tamComp = v.getUint32(p + 20, true);
    const tamNome = v.getUint16(p + 28, true);
    const tamExtra = v.getUint16(p + 30, true);
    const tamCom = v.getUint16(p + 32, true);
    const local = v.getUint32(p + 42, true);
    const nome = dec.decode(bytes.subarray(p + 46, p + 46 + tamNome));
    p += 46 + tamNome + tamExtra + tamCom;
    if (!/^xl\/(sharedStrings\.xml|worksheets\/sheet\d+\.xml|workbook\.xml)$/.test(nome)) continue;
    const ini = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true);
    const dados = bytes.subarray(ini, ini + tamComp);
    if (metodo === 0) arquivos.set(nome, dados);
    else if (metodo === 8) {
      const stream = new Blob([dados]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
      arquivos.set(nome, new Uint8Array(await new Response(stream).arrayBuffer()));
    }
  }
  return arquivos;
}

const desescapar = (s: string) =>
  s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).replace(/&amp;/g, '&');

function colunaIndice(ref: string): number {
  const letras = ref.replace(/\d+/g, '');
  let n = 0;
  for (const ch of letras) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Lê a primeira planilha de um .xlsx como tabela de textos. Datas do Excel chegam como número serial. */
export async function lerXLSX(buf: ArrayBuffer): Promise<string[][]> {
  const arq = await descompactar(buf);
  const dec = new TextDecoder();
  const compart: string[] = [];
  const ss = arq.get('xl/sharedStrings.xml');
  if (ss) {
    for (const si of dec.decode(ss).split(/<si>/).slice(1)) {
      const textos = [...si.split('</si>')[0].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((m) => m[1]);
      compart.push(desescapar(textos.join('')));
    }
  }
  const nomePlanilha = [...arq.keys()].filter((k) => k.includes('worksheets/')).sort()[0];
  if (!nomePlanilha) throw new Error('Não achei nenhuma planilha no arquivo.');
  const xml = dec.decode(arq.get(nomePlanilha)!);
  const linhas: string[][] = [];
  for (const row of xml.split(/<row[ >]/).slice(1)) {
    const corpo = row.split('</row>')[0];
    const linha: string[] = [];
    for (const m of corpo.matchAll(/<c ([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = m[1];
      const ref = attrs.match(/r="([A-Z]+\d+)"/)?.[1];
      const t = attrs.match(/t="(\w+)"/)?.[1];
      const conteudo = m[3] ?? '';
      let valor = conteudo.match(/<v>([\s\S]*?)<\/v>/)?.[1] ?? '';
      if (t === 's') valor = compart[+valor] ?? '';
      else if (t === 'inlineStr') valor = desescapar([...conteudo.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)].map((x) => x[1]).join(''));
      else valor = desescapar(valor);
      const i = ref ? colunaIndice(ref) : linha.length;
      while (linha.length < i) linha.push('');
      linha[i] = valor.trim();
    }
    if (linha.some((x) => x)) linhas.push(linha);
  }
  return linhas;
}

// ---------- Mapeamento de colunas (CSV/XLSX) ----------

export interface Mapeamento {
  linhaCabecalho: number; // índice da linha de títulos (−1 = sem títulos)
  data: number;
  descricao: number;
  modoValor: 'unico' | 'separado';
  valor: number; // modo único
  entrada: number; // modo separado
  saida: number;
  inverterSinal: boolean;
}

const achar = (cab: string[], ...padroes: RegExp[]) => {
  for (const p of padroes) {
    const i = cab.findIndex((c) => p.test(normalizar(c)));
    if (i >= 0) return i;
  }
  return -1;
};

/** Tenta adivinhar a linha de títulos e as colunas pelos nomes mais comuns dos bancos. */
export function adivinharMapeamento(tabela: string[][]): Mapeamento {
  let linhaCabecalho = -1;
  for (let i = 0; i < Math.min(15, tabela.length); i++) {
    const n = tabela[i].map(normalizar);
    if (n.some((c) => /^DATA/.test(c)) && n.some((c) => /VALOR|CREDITO|DEBITO|ENTRADA|SAIDA|QUANTIA|MONTANTE/.test(c))) {
      linhaCabecalho = i;
      break;
    }
  }
  const cab = linhaCabecalho >= 0 ? tabela[linhaCabecalho] : [];
  const m: Mapeamento = {
    linhaCabecalho,
    data: Math.max(0, achar(cab, /^DATA( DO)? (LANC|MOV)/, /^DATA$/, /^DATA/)),
    descricao: achar(cab, /^(HISTORICO|DESCRICAO|LANCAMENTO|DETALHE|MEMO)/, /HISTORICO|DESCRICAO/),
    modoValor: 'unico',
    valor: achar(cab, /^VALOR( \(R\$\))?$/, /^VALOR/, /QUANTIA|MONTANTE/),
    entrada: achar(cab, /CREDITO|ENTRADA/),
    saida: achar(cab, /DEBITO|SAIDA/),
    inverterSinal: false,
  };
  if (m.valor < 0 && m.entrada >= 0 && m.saida >= 0) m.modoValor = 'separado';
  // Sem títulos: procura pela forma do conteúdo na primeira linha útil.
  const amostra = tabela[linhaCabecalho + 1] ?? [];
  if (m.descricao < 0) m.descricao = amostra.findIndex((c, i) => i !== m.data && lerData(c) === null && lerValor(c) === null && c.length > 2);
  if (m.valor < 0 && m.modoValor === 'unico') m.valor = amostra.findIndex((c, i) => i !== m.data && lerValor(c) !== null && lerData(c) === null);
  m.descricao = Math.max(0, m.descricao);
  m.valor = Math.max(0, m.valor);
  m.entrada = Math.max(0, m.entrada);
  m.saida = Math.max(0, m.saida);
  return m;
}

/** Aplica o mapeamento. Linhas sem data ou valor válidos (saldos, totais) são puladas e contadas. */
export function aplicarMapeamento(tabela: string[][], m: Mapeamento) {
  const linhas: LinhaExtrato[] = [];
  let puladas = 0;
  for (const r of tabela.slice(m.linhaCabecalho + 1)) {
    const data = lerData(r[m.data] ?? '');
    let valor: number | null;
    if (m.modoValor === 'unico') valor = lerValor(r[m.valor] ?? '');
    else {
      const e = lerValor(r[m.entrada] ?? '') ?? 0;
      const s = lerValor(r[m.saida] ?? '') ?? 0;
      valor = Math.abs(e) - Math.abs(s);
    }
    const descricao = (r[m.descricao] ?? '').trim();
    if (!data || valor === null || valor === 0 || /^SALDO/.test(normalizar(descricao))) {
      puladas++;
      continue;
    }
    linhas.push({ data, descricao: descricao || 'Sem descrição', valor: m.inverterSinal ? -valor : valor });
  }
  return { linhas, puladas };
}

/** Assinatura das colunas para lembrar o mapeamento do mesmo banco na próxima vez. */
export const assinatura = (tabela: string[][], m: Mapeamento) =>
  m.linhaCabecalho >= 0 ? tabela[m.linhaCabecalho].map(normalizar).join('|') : `sem-cabecalho:${tabela[0]?.length ?? 0}`;

// ---------- Anti-duplicidade ----------

/**
 * Chave de cada linha. Com código do banco (FITID) usa ele; sem código usa data + valor + descrição.
 * Linhas iguais no mesmo arquivo (duas compras iguais no dia) ganham #2, #3…, então reimportar
 * o mesmo arquivo gera as mesmas chaves e tudo é bloqueado.
 */
export function chaves(contaId: string, linhas: LinhaExtrato[]): string[] {
  const vistas = new Map<string, number>();
  return linhas.map((l) => {
    const base = l.fitid ? `f|${contaId}|${l.fitid}` : `d|${contaId}|${l.data}|${l.valor}|${normalizar(l.descricao)}`;
    const n = (vistas.get(base) ?? 0) + 1;
    vistas.set(base, n);
    return n > 1 ? `${base}#${n}` : base;
  });
}

export type Formato = 'ofx' | 'csv' | 'xlsx';

export function formatoDoArquivo(nome: string, buf: ArrayBuffer): Formato | null {
  const ext = nome.toLowerCase().split('.').pop();
  const b = new Uint8Array(buf.slice(0, 4));
  if (b[0] === 0x50 && b[1] === 0x4b) return 'xlsx';
  if (ext === 'ofx' || ext === 'qfx') return 'ofx';
  const ini = new TextDecoder('latin1').decode(buf.slice(0, 300));
  if (/OFXHEADER|<OFX>/i.test(ini)) return 'ofx';
  if (ext === 'csv' || ext === 'txt' || ext === 'tsv') return 'csv';
  if (ext === 'xls') return null;
  return 'csv';
}

/** Chave "solta" para achar a mesma movimentação vinda de outro formato (OFX x CSV): conta, dia, valor e texto sem números. */
export function chaveSolta(contaId: string, l: { data: string; valor: number; descricao: string }): string {
  const texto = normalizar(l.descricao).split(/[\s\-/*:]+/).filter((p) => p.length > 1 && !/\d/.test(p)).join(' ');
  return `${contaId}|${l.data}|${l.valor}|${texto}`;
}

/**
 * Decide quais linhas novas são repetidas. Bloqueia quando a chave exata já existe
 * ou quando a mesma movimentação (dia, valor e texto) já foi importada de outro arquivo.
 */
export function marcarRepetidas(
  contaId: string,
  linhas: LinhaExtrato[],
  existentes: { chave: string; contaId: string; data: string; valor: number; descricao: string }[],
): { chave: string; repetida: boolean }[] {
  const ks = chaves(contaId, linhas);
  const exatas = new Set(existentes.map((t) => t.chave));
  const soltasAntes = new Map<string, number>();
  for (const t of existentes) {
    if (t.contaId !== contaId) continue;
    const k = chaveSolta(contaId, t);
    soltasAntes.set(k, (soltasAntes.get(k) ?? 0) + 1);
  }
  const vistas = new Map<string, number>();
  return linhas.map((l, i) => {
    const k = chaveSolta(contaId, l);
    const n = (vistas.get(k) ?? 0) + 1;
    vistas.set(k, n);
    return { chave: ks[i], repetida: exatas.has(ks[i]) || n <= (soltasAntes.get(k) ?? 0) };
  });
}
