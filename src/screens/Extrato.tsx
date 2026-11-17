import { emArvore, nomeCategoria, rotuloDocumento } from '../lib/categorias';
import { useMemo, useState } from 'react';
import type { Dados, Importacao, Lancamento, Regra, TransacaoExtrato } from '../types';
import { useBlocos, useDados } from '../data/store';
import { aprender, confirmarDividida, confirmarLinha, diferencaDaBaixa, previstosParaBaixa, regraPara, sentidoDe, vinculoPara, type Escolha } from '../lib/conciliar';
import {
  adivinharMapeamento, aplicarMapeamento, assinatura, decodificar, marcarRepetidas, formatoDoArquivo, lerCSV, lerOFX, lerXLSX,
  type LinhaExtrato, type Mapeamento,
} from '../lib/importar';
import { brl, dataBR, dataCurta, hoje, novoId, parseValor, valorParaCampo } from '../lib/format';
import { Campo, Confirmar, Folha, Icone, SeletorCategoria, SeletorConta } from '../components/ui';

// ---------- Inbox ----------

const codificar = (e: Escolha | null) =>
  !e ? '' : e.tipo === 'categoria' ? `c:${e.categoriaId}` : e.tipo === 'vinculo' ? `v:${e.lancamentoId}` : `t:${e.outraContaId}`;
const decodificarEscolha = (v: string): Escolha | null =>
  v.startsWith('c:') ? { tipo: 'categoria', categoriaId: v.slice(2) }
  : v.startsWith('v:') ? { tipo: 'vinculo', lancamentoId: v.slice(2) }
  : v.startsWith('t:') ? { tipo: 'transferencia', outraContaId: v.slice(2) }
  : null;

interface Sugestao { escolha: Escolha | null; motivo: string; vinculo?: Lancamento }

/** Sugestões de todas as linhas pendentes, sem usar o mesmo previsto duas vezes. */
function sugerir(dados: Dados, pendentes: TransacaoExtrato[]): Map<string, Sugestao> {
  const usados = new Set<string>();
  const out = new Map<string, Sugestao>();
  for (const t of pendentes) {
    const v = vinculoPara(dados, t, usados);
    if (v) {
      usados.add(v.id);
      out.set(t.id, { escolha: { tipo: 'vinculo', lancamentoId: v.id }, motivo: v.status === 'previsto' ? `Combina com o previsto de ${dataCurta(v.data)}` : `Já lançado à mão em ${dataCurta(v.data)}`, vinculo: v });
      continue;
    }
    const r = regraPara(dados, t);
    out.set(t.id, r ? { escolha: { tipo: 'categoria', categoriaId: r.categoriaId }, motivo: 'Pela regra que você criou' } : { escolha: null, motivo: '' });
  }
  return out;
}

export function Extrato() {
  const { dados, despachar } = useDados();
  const blocos = useBlocos();
  const [importando, setImportando] = useState(false);
  const [conta, setConta] = useState('');
  const [escolhas, setEscolhas] = useState<Record<string, string>>({});
  const [verIgnoradas, setVerIgnoradas] = useState(false);
  const [dividir, setDividir] = useState<TransacaoExtrato | null>(null);
  const extrato = dados.extrato ?? [];
  const pendentes = extrato
    .filter((t) => t.situacao === 'pendente' && (!conta || t.contaId === conta))
    .sort((a, b) => a.data.localeCompare(b.data));
  const ignoradas = extrato.filter((t) => t.situacao === 'ignorada' && (!conta || t.contaId === conta));
  const sugestoes = useMemo(() => sugerir(dados, pendentes), [dados, conta]); // eslint-disable-line
  const contas = new Map(dados.contas.map((c) => [c.id, c]));

  const escolhaDe = (t: TransacaoExtrato) => (t.id in escolhas ? decodificarEscolha(escolhas[t.id]) : sugestoes.get(t.id)?.escolha ?? null);
  const prontas = pendentes.filter((t) => escolhaDe(t));

  function confirmar(lista: TransacaoExtrato[]) {
    const itens: { transacao: TransacaoExtrato; lancamento?: Lancamento; extras?: Lancamento[] }[] = [];
    const regras: Regra[] = [];
    const usados = new Set<string>();
    for (const t of lista) {
      const e = escolhaDe(t);
      if (!e) continue;
      // O mesmo previsto não pode dar baixa em duas linhas do extrato.
      if (e.tipo === 'vinculo') {
        if (usados.has(e.lancamentoId)) continue;
        usados.add(e.lancamentoId);
      }
      const r = confirmarLinha(dados, t, e);
      if (!r) continue;
      itens.push(r);
      if (e.tipo === 'categoria') {
        const nova = aprender(dados, t, e.categoriaId, regras);
        if (nova) {
          const i = regras.findIndex((x) => x.id === nova.id);
          if (i >= 0) regras[i] = nova;
          else regras.push(nova);
        }
      }
    }
    if (itens.length) despachar({ t: 'conciliar', itens, regras });
  }

  const ignorar = (t: TransacaoExtrato, volta = false) =>
    despachar({ t: 'conciliar', itens: [{ transacao: { ...t, situacao: volta ? 'pendente' : 'ignorada' } }] });

  return (
    <div className="tela">
      <header className="tela-topo">
        <h1>Extrato bancário</h1>
        <button type="button" className="btn btn-primario" onClick={() => setImportando(true)}>Importar arquivo</button>
        <p className="lead">Importe o extrato do internet banking (OFX, CSV ou Excel), confira a categoria de cada linha e confirme. Só depois de confirmar ela entra no saldo.</p>
      </header>

      {extrato.length === 0 ? (
        <section className="cartao vazio-extrato">
          <Icone nome="lista" tamanho={28} />
          <h2>Nenhum extrato importado ainda</h2>
          <p className="ajuda">No internet banking, procure por "exportar extrato" ou "salvar como OFX". Uma vez por semana já mantém o saldo em dia.</p>
          <button type="button" className="btn btn-primario btn-grande" onClick={() => setImportando(true)}>Importar meu primeiro extrato</button>
        </section>
      ) : (
        <>
          <div className="barra-inbox">
            <select id="x-conta" value={conta} onChange={(e) => setConta(e.target.value)} aria-label="Filtrar por conta">
              <option value="">Todas as contas</option>
              {dados.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </select>
            <button type="button" className="btn btn-entrada" disabled={!prontas.length} onClick={() => confirmar(prontas)}>
              <Icone nome="check" tamanho={18} /> Confirmar tudo pronto ({prontas.length})
            </button>
          </div>
          {pendentes.length === 0 ? (
            <p className="ok centro"><Icone nome="check" tamanho={16} /> Tudo revisado. O saldo está em dia com o extrato.</p>
          ) : (
            <>
              <p className="ajuda">{pendentes.length} para revisar. {prontas.length < pendentes.length && `${pendentes.length - prontas.length} ainda sem categoria.`}</p>
              <ul className="inbox">
                {pendentes.map((t) => {
                  const sug = sugestoes.get(t.id);
                  const escolha = escolhaDe(t);
                  const valorSel = codificar(escolha);
                  const mudou = t.id in escolhas;
                  const sentido = sentidoDe(t);
                  const antes = (contas.get(t.contaId)?.dataSaldoInicial ?? '') > t.data;
                  return (
                    <li key={t.id} className={escolha ? 'pronta' : ''}>
                      <div className="inbox-topo">
                        <span className="inbox-data">{dataCurta(t.data)}</span>
                        <span className="inbox-desc">{t.descricao}</span>
                        <span className={`valor ${t.valor > 0 ? 'pos' : 'neg'}`}>{t.valor > 0 ? '+' : ''}{brl(t.valor)}</span>
                      </div>
                      <div className="inbox-acao">
                        <select id={`x-${t.id}`} value={valorSel} onChange={(e) => setEscolhas({ ...escolhas, [t.id]: e.target.value })} aria-label="Categoria" className={escolha ? '' : 'sem-escolha'}>
                          <option value="">Escolha a categoria</option>
                          {sug?.vinculo && (
                            <optgroup label="Já está lançado">
                              <option value={`v:${sug.vinculo.id}`}>
                                {sug.vinculo.status === 'previsto' ? 'Dar baixa no previsto' : 'É o lançamento'}: {sug.vinculo.descricao || nomeCategoria(sug.vinculo.categoriaId, dados.categorias) || 'transferência'} ({dataCurta(sug.vinculo.data)})
                              </option>
                            </optgroup>
                          )}
                          {blocos.map((b) => {
                            const cs = emArvore(dados.categorias.filter((c) => c.bloco === b.id && c.sentido === sentido), dados.categorias);
                            return cs.length ? (
                              <optgroup key={b.id} label={b.nome}>
                                {cs.map(({ c, nivel }) => <option key={c.id} value={`c:${c.id}`}>{nivel ? `\u00a0\u00a0\u00a0↳ ${c.nome}` : c.nome}</option>)}
                              </optgroup>
                            ) : null;
                          })}
                          {(() => {
                            const outros = previstosParaBaixa(dados, t, new Set(sug?.vinculo ? [sug.vinculo.id] : []));
                            return outros.length ? (
                              <optgroup label={sentido === 'saida' ? 'Dar baixa em conta a pagar' : 'Dar baixa em conta a receber'}>
                                {outros.map((l) => (
                                  <option key={l.id} value={`v:${l.id}`}>
                                    {dataCurta(l.data)} · {[l.descricao || nomeCategoria(l.categoriaId, dados.categorias), rotuloDocumento(l)].filter(Boolean).join(' · ')} · {brl(l.valor)}
                                  </option>
                                ))}
                              </optgroup>
                            ) : null;
                          })()}
                          <optgroup label="Entre minhas contas">
                            {dados.contas.filter((c) => c.id !== t.contaId && !c.arquivada).map((c) => (
                              <option key={c.id} value={`t:${c.id}`}>⇄ Transferência {sentido === 'saida' ? 'para' : 'de'} {c.nome}</option>
                            ))}
                          </optgroup>
                        </select>
                        <button type="button" className="btn btn-icone-borda" disabled={!escolha} onClick={() => confirmar([t])} aria-label="Confirmar esta linha"><Icone nome="check" tamanho={18} /></button>
                        <button type="button" className="btn btn-icone-borda" onClick={() => setDividir(t)} aria-label="Dividir em várias categorias" title="Dividir em várias categorias"><Icone nome="dividir" tamanho={18} /></button>
                        <button type="button" className="btn btn-icone-borda" onClick={() => ignorar(t)} aria-label="Ignorar esta linha"><Icone nome="x" tamanho={18} /></button>
                      </div>
                      {(() => {
                        if (escolha?.tipo !== 'vinculo') return null;
                        const l = dados.lancamentos.find((x) => x.id === escolha.lancamentoId);
                        const d = l && diferencaDaBaixa(dados, l, Math.abs(t.valor));
                        if (!l || !d) return null;
                        return (
                          <p className="inbox-nota">
                            <span className="selo selo-previsto">
                              {d.tipo === 'juros'
                                ? `Previsto de ${brl(l.valor)}. A diferença de ${brl(d.valor)} vai para "${d.nomeCategoria}".`
                                : Math.abs(t.valor) < l.valor
                                  ? `Previsto de ${brl(l.valor)}. Fica com o valor do banco (desconto de ${brl(d.valor)}).`
                                  : `Previsto de ${brl(l.valor)}. Fica com o valor do banco.`}
                            </span>
                          </p>
                        );
                      })()}
                      {(!mudou && sug?.motivo) || antes || !conta ? (
                        <p className="inbox-nota">
                          {!conta && <span>{contas.get(t.contaId)?.nome}</span>}
                          {!mudou && sug?.motivo && <span className="selo selo-sugestao">{sug.motivo}</span>}
                          {antes && <span className="selo selo-previsto">Antes do saldo inicial: não mexe no saldo</span>}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          {ignoradas.length > 0 && (
            <section className="cartao">
              <button type="button" className="bloco-cat-topo" aria-expanded={verIgnoradas} onClick={() => setVerIgnoradas(!verIgnoradas)}>
                <span><strong>Ignoradas</strong> <span className="ajuda">{ignoradas.length}</span></span>
                <span className={`seta ${verIgnoradas ? 'aberta' : ''}`}><Icone nome="seta" tamanho={16} /></span>
              </button>
              {verIgnoradas && (
                <ul className="mini-lista">
                  {ignoradas.map((t) => (
                    <li key={t.id}>
                      <span>{dataCurta(t.data)} · {t.descricao} · {brl(t.valor)}</span>
                      <button type="button" className="btn btn-link" onClick={() => ignorar(t, true)}>Revisar de novo</button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
          <Historico />
        </>
      )}
      {importando && <Importar aoFechar={() => setImportando(false)} />}
      {dividir && <Dividir t={dividir} aoFechar={() => setDividir(null)} />}
    </div>
  );
}

function Historico() {
  const { dados, despachar } = useDados();
  const [desfazer, setDesfazer] = useState<Importacao | null>(null);
  const lista = [...(dados.importacoes ?? [])].reverse().slice(0, 8);
  if (!lista.length) return null;
  return (
    <section className="cartao">
      <h2>Arquivos importados</h2>
      <ul className="mini-lista">
        {lista.map((i) => (
          <li key={i.id}>
            <span>{dataBR(i.em)} · {dados.contas.find((c) => c.id === i.contaId)?.nome} · {i.arquivo}</span>
            <span className="ajuda">{i.novas} novas{i.bloqueadas ? ` · ${i.bloqueadas} repetidas` : ''}</span>
            <button type="button" className="btn btn-link" onClick={() => setDesfazer(i)}>Desfazer</button>
          </li>
        ))}
      </ul>
      {desfazer && (
        <Confirmar
          perigo
          texto={<>Desfazer a importação de <strong>{desfazer.arquivo}</strong> em {dados.contas.find((c) => c.id === desfazer.contaId)?.nome}? As linhas deste arquivo e os lançamentos criados a partir delas serão apagados. Contas previstas que tinham sido baixadas por ele voltam a ficar previstas. Depois você pode importar o arquivo de novo, na conta certa.</>}
          rotuloOk="Desfazer importação"
          aoConfirmar={() => { despachar({ t: 'desfazerImportacao', id: desfazer.id }); setDesfazer(null); }}
          aoCancelar={() => setDesfazer(null)}
        />
      )}
    </section>
  );
}

// ---------- Importar ----------

interface Lido { nome: string; formato: 'ofx' | 'csv' | 'xlsx'; linhasOfx?: LinhaExtrato[]; tabela?: string[][] }

function Importar({ aoFechar }: { aoFechar: () => void }) {
  const { dados, despachar } = useDados();
  const ativas = dados.contas.filter((c) => !c.arquivada && c.tipo !== 'aplicacao');
  // Com mais de uma conta, a pessoa escolhe sempre: evita importar o extrato de um banco na conta de outro.
  const [contaId, setContaId] = useState(ativas.length === 1 ? ativas[0].id : '');
  const [lido, setLido] = useState<Lido | null>(null);
  const [map, setMap] = useState<Mapeamento | null>(null);
  const [lembrado, setLembrado] = useState(false);
  const [erro, setErro] = useState('');
  const [arrastando, setArrastando] = useState(false);
  const [resultado, setResultado] = useState<{ novas: number; bloqueadas: number; puladas: number; antes: number } | null>(null);

  async function abrir(arquivo: File) {
    setErro('');
    try {
      const buf = await arquivo.arrayBuffer();
      const formato = formatoDoArquivo(arquivo.name, buf);
      if (!formato) return setErro('Arquivos .xls antigos não são lidos. No Excel, salve como .xlsx ou CSV e tente de novo.');
      if (formato === 'ofx') {
        const linhasOfx = lerOFX(decodificar(buf));
        if (!linhasOfx.length) return setErro('Não achei movimentações neste OFX. Confira se é o extrato da conta (e não da fatura do cartão).');
        setLido({ nome: arquivo.name, formato, linhasOfx });
        return;
      }
      const tabela = formato === 'xlsx' ? await lerXLSX(buf) : lerCSV(decodificar(buf));
      if (tabela.length < 2) return setErro('O arquivo está vazio ou tem só uma linha.');
      const palpite = adivinharMapeamento(tabela);
      const modelo = (dados.modelos ?? []).find((m) => m.contaId === contaId && m.assinatura === assinatura(tabela, palpite));
      setMap(modelo ? modelo.mapeamento : palpite);
      setLembrado(!!modelo);
      setLido({ nome: arquivo.name, formato, tabela });
    } catch {
      setErro('Não consegui ler este arquivo. Tente exportar de novo em OFX ou CSV.');
    }
  }

  const previa = lido?.tabela && map ? aplicarMapeamento(lido.tabela, map) : null;

  function importar() {
    if (!lido || !contaId) return;
    const linhas = lido.linhasOfx ?? previa?.linhas ?? [];
    if (!linhas.length) return setErro('Nenhuma linha válida com essas colunas. Confira qual coluna é a data e qual é o valor.');
    const marcas = marcarRepetidas(contaId, linhas, dados.extrato ?? []);
    const conta = dados.contas.find((c) => c.id === contaId)!;
    const imp: Importacao = { id: novoId(), contaId, arquivo: lido.nome, em: hoje(), novas: 0, bloqueadas: 0 };
    const transacoes: TransacaoExtrato[] = [];
    let antes = 0;
    linhas.forEach((l, i) => {
      if (marcas[i].repetida) return imp.bloqueadas++;
      if (l.data < conta.dataSaldoInicial) antes++;
      transacoes.push({ id: novoId(), contaId, importacaoId: imp.id, chave: marcas[i].chave, data: l.data, descricao: l.descricao, valor: l.valor, situacao: 'pendente' });
    });
    imp.novas = transacoes.length;
    despachar({
      t: 'importar', importacao: imp, transacoes,
      modelo: lido.tabela && map ? { contaId, assinatura: assinatura(lido.tabela, map), mapeamento: map } : undefined,
    });
    setResultado({ novas: imp.novas, bloqueadas: imp.bloqueadas, puladas: previa?.puladas ?? 0, antes });
  }

  if (resultado) {
    return (
      <Folha titulo="Extrato importado" aoFechar={aoFechar}>
        <div className="form">
          <dl className="totais-3">
            <div><dt>Novas</dt><dd className="pos">{resultado.novas}</dd></div>
            <div><dt>Repetidas, bloqueadas</dt><dd>{resultado.bloqueadas}</dd></div>
            <div><dt>Linhas puladas</dt><dd>{resultado.puladas}</dd></div>
          </dl>
          {resultado.bloqueadas > 0 && <p className="ajuda">{resultado.bloqueadas} {resultado.bloqueadas === 1 ? 'linha já tinha' : 'linhas já tinham'} sido importada(s) antes e não entraram de novo. O saldo não fica duplicado.</p>}
          {resultado.puladas > 0 && <p className="ajuda">Linhas puladas são saldos, totais ou linhas sem data ou valor.</p>}
          {resultado.antes > 0 && <p className="ajuda">{resultado.antes} {resultado.antes === 1 ? 'linha é' : 'linhas são'} de antes da data do saldo inicial da conta. Elas vão para o relatório, mas não mexem no saldo.</p>}
          <button type="button" className="btn btn-primario btn-grande" onClick={aoFechar}>{resultado.novas ? 'Revisar agora' : 'Fechar'}</button>
        </div>
      </Folha>
    );
  }

  const tab = lido?.tabela;
  const nCols = tab ? Math.max(...tab.slice(0, 30).map((r) => r.length)) : 0;
  const nomeCol = (i: number) => {
    const t = tab && map && map.linhaCabecalho >= 0 ? tab[map.linhaCabecalho][i] : '';
    return `${String.fromCharCode(65 + i)}${t ? ` · ${t}` : ''}`;
  };
  const selCol = (id: string, rotulo: string, valor: number, mudar: (v: number) => void) => (
    <Campo rotulo={rotulo} id={id}>
      <select id={id} value={valor} onChange={(e) => { mudar(Number(e.target.value)); setLembrado(false); }}>
        {Array.from({ length: nCols }, (_, i) => <option key={i} value={i}>{nomeCol(i)}</option>)}
      </select>
    </Campo>
  );

  return (
    <Folha titulo="Importar extrato" aoFechar={aoFechar}>
      <div className="form">
        <Campo rotulo="De qual banco é este extrato?" id="i-conta">
          <SeletorConta id="i-conta" valor={contaId} aoMudar={(v) => { setContaId(v); setLido(null); }} contas={ativas} />
        </Campo>
        {contaId && ativas.find((c) => c.id === contaId)?.tipo === 'cartao' && (
          <p className="ajuda">Fatura de cartão: as compras precisam aparecer como saída (−). Se vierem como entrada, ligue "Inverter sinal". O pagamento da fatura que aparece neste arquivo pode ser ignorado no Inbox, porque ele já sai da conta corrente.</p>
        )}
        {!contaId ? (
          <p className="ajuda">Escolha primeiro a conta do banco deste extrato (por exemplo, o arquivo do Nubank vai na conta do Nubank).</p>
        ) : !lido ? (
          <label
            className={`soltar ${arrastando ? 'ativo' : ''}`}
            onDragOver={(e) => { e.preventDefault(); setArrastando(true); }}
            onDragLeave={() => setArrastando(false)}
            onDrop={(e) => { e.preventDefault(); setArrastando(false); const f = e.dataTransfer.files[0]; if (f) abrir(f); }}
          >
            <input type="file" id="i-arquivo" accept=".ofx,.qfx,.csv,.txt,.xlsx" onChange={(e) => { const f = e.target.files?.[0]; if (f) abrir(f); }} />
            <strong>Arraste o arquivo aqui</strong>
            <span>ou toque para escolher · OFX, CSV ou Excel (.xlsx)</span>
          </label>
        ) : lido.formato === 'ofx' ? (
          <div className="previa-ok">
            <p><strong>{lido.nome}</strong> · {lido.linhasOfx!.length} movimentações de {dataBR(lido.linhasOfx![0].data)} a {dataBR(lido.linhasOfx![lido.linhasOfx!.length - 1].data)}</p>
            <p className="ajuda">OFX já vem com as colunas certas e com o código de cada transação, então não tem nada para configurar.</p>
          </div>
        ) : (
          <>
            <p><strong>{lido.nome}</strong></p>
            {lembrado ? (
              <p className="selo selo-sugestao bloco">Usando as mesmas colunas da última importação desta conta.</p>
            ) : (
              <p className="ajuda">Cada banco organiza a planilha de um jeito. Diga qual coluna é a data, a descrição e o valor. Eu já tentei adivinhar.</p>
            )}
            <div className="grade-2">
              <Campo rotulo="Linha dos títulos" id="i-cab">
                <select id="i-cab" value={map!.linhaCabecalho} onChange={(e) => { setMap({ ...map!, linhaCabecalho: Number(e.target.value) }); setLembrado(false); }}>
                  <option value={-1}>Não tem títulos</option>
                  {tab!.slice(0, 15).map((r, i) => <option key={i} value={i}>Linha {i + 1}: {r.filter(Boolean).slice(0, 3).join(' · ').slice(0, 40)}</option>)}
                </select>
              </Campo>
              {selCol('i-data', 'Data', map!.data, (v) => setMap({ ...map!, data: v }))}
              {selCol('i-desc', 'Descrição', map!.descricao, (v) => setMap({ ...map!, descricao: v }))}
              <Campo rotulo="Como vem o valor" id="i-modo">
                <select id="i-modo" value={map!.modoValor} onChange={(e) => setMap({ ...map!, modoValor: e.target.value as Mapeamento['modoValor'] })}>
                  <option value="unico">Uma coluna (saídas negativas)</option>
                  <option value="separado">Entrada e saída em colunas separadas</option>
                </select>
              </Campo>
              {map!.modoValor === 'unico'
                ? selCol('i-valor', 'Valor', map!.valor, (v) => setMap({ ...map!, valor: v }))
                : <>
                    {selCol('i-ent', 'Coluna de entradas (crédito)', map!.entrada, (v) => setMap({ ...map!, entrada: v }))}
                    {selCol('i-sai', 'Coluna de saídas (débito)', map!.saida, (v) => setMap({ ...map!, saida: v }))}
                  </>}
            </div>
            <div className="tabela-rolagem">
              <table className="previa">
                <caption>Como vai ficar (primeiras 3 linhas)</caption>
                <thead><tr><th>Data</th><th>Descrição</th><th className="num">Valor</th></tr></thead>
                <tbody>
                  {previa!.linhas.slice(0, 3).map((l, i) => (
                    <tr key={i}><td>{dataBR(l.data)}</td><td>{l.descricao}</td><td className={`num ${l.valor > 0 ? 'pos' : 'neg'}`}>{brl(l.valor)}</td></tr>
                  ))}
                  {!previa!.linhas.length && <tr><td colSpan={3} className="erro">Nenhuma linha válida. Ajuste as colunas acima.</td></tr>}
                </tbody>
              </table>
            </div>
            {previa!.linhas.length > 0 && (
              <label className="chave-simples">
                <input type="checkbox" id="i-inv" checked={map!.inverterSinal} onChange={(e) => setMap({ ...map!, inverterSinal: e.target.checked })} />
                As entradas apareceram como saídas (inverter sinal)
              </label>
            )}
            <p className="ajuda">{previa!.linhas.length} movimentações encontradas{previa!.puladas ? `, ${previa!.puladas} linhas puladas (saldos, totais ou vazias)` : ''}.</p>
          </>
        )}
        {erro && <p className="erro">{erro}</p>}
        {lido && (
          <div className="acoes-form">
            <button type="button" className="btn" onClick={() => { setLido(null); setErro(''); }}>Outro arquivo</button>
            <button type="button" className="btn btn-primario btn-grande" onClick={importar}>Importar</button>
          </div>
        )}
      </div>
    </Folha>
  );
}

// ---------- Dividir uma linha ----------

interface Parte { id: string; categoriaId: string; valor: string; descricao: string }

function Dividir({ t, aoFechar }: { t: TransacaoExtrato; aoFechar: () => void }) {
  const { dados, despachar } = useDados();
  const total = Math.abs(t.valor);
  const nova = (valor = ''): Parte => ({ id: novoId(), categoriaId: '', valor, descricao: '' });
  const [partes, setPartes] = useState<Parte[]>([nova(), nova()]);
  const [erro, setErro] = useState('');
  const somado = partes.reduce((a, p) => a + (parseValor(p.valor) ?? 0), 0);
  const falta = total - somado;
  const mudar = (id: string, c: Partial<Parte>) => setPartes((ps) => ps.map((p) => (p.id === id ? { ...p, ...c } : p)));

  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    const lista = partes.filter((p) => p.categoriaId || p.valor.trim());
    if (lista.some((p) => !p.categoriaId)) return setErro('Escolha a categoria de cada parte.');
    if (lista.some((p) => (parseValor(p.valor) ?? 0) <= 0)) return setErro('Cada parte precisa de um valor maior que zero.');
    if (falta !== 0) return setErro(falta > 0 ? `Ainda faltam ${brl(falta)} para fechar o valor do extrato.` : `As partes passam ${brl(-falta)} do valor do extrato.`);
    const r = confirmarDividida(t, lista.map((p) => ({ categoriaId: p.categoriaId, valor: parseValor(p.valor)!, descricao: p.descricao })));
    if (!r) return setErro('Confira as categorias e os valores.');
    despachar({ t: 'conciliar', itens: [r] });
    aoFechar();
  }

  return (
    <Folha titulo="Dividir em categorias" aoFechar={aoFechar} tom={sentidoDe(t)}>
      <form className="form" onSubmit={confirmar} noValidate>
        <div className="previa-ok">
          <p><strong>{t.descricao}</strong></p>
          <p className="ajuda">{dataBR(t.data)} · {brl(t.valor)}. Ex.: a fatura do cartão separada em combustível, material e software.</p>
        </div>
        <ul className="partes">
          {partes.map((p, i) => (
            <li key={p.id}>
              <div className="partes-linha">
                <SeletorCategoria id={`d-cat-${p.id}`} valor={p.categoriaId} aoMudar={(v) => mudar(p.id, { categoriaId: v })} categorias={dados.categorias} sentido={sentidoDe(t)} />
                <input id={`d-val-${p.id}`} inputMode="decimal" placeholder="0,00" value={p.valor} onChange={(e) => mudar(p.id, { valor: e.target.value })} aria-label={`Valor da parte ${i + 1}`} className="partes-valor" />
                {partes.length > 1 && (
                  <button type="button" className="btn-icone" aria-label={`Remover parte ${i + 1}`} onClick={() => setPartes((ps) => ps.filter((x) => x.id !== p.id))}><Icone nome="x" tamanho={16} /></button>
                )}
              </div>
              <input id={`d-desc-${p.id}`} placeholder="Descrição (opcional)" value={p.descricao} onChange={(e) => mudar(p.id, { descricao: e.target.value })} aria-label={`Descrição da parte ${i + 1}`} className="partes-desc" />
            </li>
          ))}
        </ul>
        <div className="linha-botoes partes-rodape">
          <button type="button" className="btn btn-link" onClick={() => setPartes((ps) => [...ps, nova()])}>+ Outra parte</button>
          {falta > 0 && <button type="button" className="btn btn-link" onClick={() => {
            const vazia = partes.find((p) => !p.valor.trim());
            if (vazia) mudar(vazia.id, { valor: valorParaCampo(falta) });
            else setPartes((ps) => [...ps, nova(valorParaCampo(falta))]);
          }}>Usar o que falta ({brl(falta)})</button>}
        </div>
        <p className={`soma-partes ${falta === 0 ? 'pos' : 'neg'}`}>
          {falta === 0 ? <>Fechou: {brl(total)}</> : falta > 0 ? <>Faltam {brl(falta)} de {brl(total)}</> : <>Passou {brl(-falta)} de {brl(total)}</>}
        </p>
        {erro && <p className="erro">{erro}</p>}
        <div className="acoes-form">
          <button type="submit" className={`btn btn-grande btn-${sentidoDe(t)}`} disabled={falta !== 0}>Confirmar divisão</button>
        </div>
      </form>
    </Folha>
  );
}
