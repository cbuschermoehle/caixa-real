import { useState } from 'react';
import type { Documento, Lancamento, TipoLancamento } from '../types';
import { useDados } from '../data/store';
import { nomeCategoria, rotuloDocumento } from '../lib/categorias';
import { brl, dataBR, hoje, novoId, parseValor, somaMeses, valorParaCampo } from '../lib/format';
import { Campo, Chave, Confirmar, Folha, Segmentos, SeletorCategoria, SeletorConta } from './ui';

type Repeticao = 'nao' | 'mensal' | 'parcelado';

const TITULOS: Record<TipoLancamento, string> = { entrada: 'Nova entrada', saida: 'Nova saída', transferencia: 'Transferência entre contas' };

export function FormLancamento({ tipoInicial, editar, aoFechar }: { tipoInicial: TipoLancamento; editar?: Lancamento; aoFechar: () => void }) {
  const { dados, despachar } = useDados();
  const contasAtivas = dados.contas.filter((c) => !c.arquivada);
  const [tipo, setTipo] = useState<TipoLancamento>(editar?.tipo ?? tipoInicial);
  const [valor, setValor] = useState(editar ? valorParaCampo(editar.valor) : '');
  const [data, setData] = useState(editar?.data ?? hoje());
  const [categoriaId, setCategoriaId] = useState(editar?.categoriaId ?? '');
  const [contaId, setContaId] = useState(editar?.contaId ?? (contasAtivas.length === 1 ? contasAtivas[0].id : contasAtivas[0]?.id ?? ''));
  const [destinoId, setDestinoId] = useState(editar?.contaDestinoId ?? '');
  const [pago, setPago] = useState(editar ? editar.status === 'pago' : true);
  const [mexeuPago, setMexeuPago] = useState(!!editar);
  const [descricao, setDescricao] = useState(editar?.descricao ?? '');
  const [docTipo, setDocTipo] = useState<'' | Documento['tipo']>(editar?.documento?.tipo ?? '');
  const [docNum, setDocNum] = useState(editar?.documento?.numero ?? '');
  const [nf, setNf] = useState(editar?.nf ?? '');
  const [repeticao, setRepeticao] = useState<Repeticao>('nao');
  const [vezes, setVezes] = useState('12');
  // Parcelas com valor e vencimento próprios (nota parcelada em valores ou datas diferentes).
  const [ajustar, setAjustar] = useState(false);
  const [parcelas, setParcelas] = useState<{ data: string; valor: string }[]>([]);
  const [erros, setErros] = useState<Record<string, string>>({});
  const [confirmarExclusao, setConfirmarExclusao] = useState(false);

  /** Monta (ou estica/encurta) a lista de parcelas, mantendo o que já foi digitado. */
  const montarParcelas = (qtd: number, lista = parcelas) => {
    if (!Number.isInteger(qtd) || qtd < 2 || qtd > 240) return lista;
    return Array.from({ length: qtd }, (_, i) => lista[i] ?? { data: somaMeses(data, i), valor });
  };
  const ligarAjuste = (v: boolean) => {
    setAjustar(v);
    if (v) setParcelas(montarParcelas(Number(vezes), []));
  };
  const somaParcelas = parcelas.reduce((a, p) => a + (parseValor(p.valor) ?? 0), 0);
  const mudarParcela = (i: number, campo: 'data' | 'valor', v: string) =>
    setParcelas((ps) => ps.map((p, j) => (j === i ? { ...p, [campo]: v } : p)));

  const mudarData = (d: string) => {
    setData(d);
    if (!mexeuPago) setPago(d <= hoje());
  };

  const futurosDaSerie = editar?.serieId
    ? dados.lancamentos.filter((l) => l.serieId === editar.serieId && l.id !== editar.id && l.status === 'previsto' && l.data >= editar.data)
    : [];

  function salvar(e: React.FormEvent) {
    e.preventDefault();
    const v = parseValor(valor);
    const er: Record<string, string> = {};
    if (v === null || v <= 0) er.valor = 'Digite um valor maior que zero, por exemplo 150,00.';
    if (!data) er.data = 'Escolha a data.';
    if (!contaId) er.conta = 'Escolha a conta.';
    if (tipo === 'transferencia') {
      if (!destinoId) er.destino = 'Escolha a conta que recebe.';
      else if (destinoId === contaId) er.destino = 'A conta de destino precisa ser diferente da de origem.';
    } else if (!categoriaId) er.categoria = 'Escolha a categoria.';
    if (tipo === 'entrada' && docTipo && !docNum.trim()) er.doc = 'Digite o número da OS ou do pedido.';
    const n = Number(vezes);
    if (repeticao !== 'nao' && (!Number.isInteger(n) || n < 2 || n > 240)) er.vezes = 'Use de 2 a 240 vezes (20 anos).';
    const usarParcelas = repeticao === 'parcelado' && ajustar;
    const valoresParcelas = usarParcelas ? parcelas.map((p) => parseValor(p.valor)) : [];
    if (usarParcelas) {
      if (valoresParcelas.some((x) => x === null || x <= 0)) er.parcelas = 'Cada parcela precisa de um valor maior que zero.';
      else if (parcelas.some((p) => !p.data)) er.parcelas = 'Cada parcela precisa de uma data de vencimento.';
      if (er.valor && !valoresParcelas.some((x) => x === null || x <= 0)) delete er.valor;
    }
    setErros(er);
    if (Object.keys(er).length) return;

    const baseL: Omit<Lancamento, 'id' | 'data' | 'status'> = {
      tipo,
      valor: v!,
      contaId,
      contaDestinoId: tipo === 'transferencia' ? destinoId : undefined,
      categoriaId: tipo === 'transferencia' ? undefined : categoriaId,
      descricao: descricao.trim() || undefined,
      documento: tipo === 'entrada' && docTipo && docNum.trim() ? { tipo: docTipo, numero: docNum.trim() } : undefined,
      nf: tipo === 'entrada' && nf.trim() ? nf.trim() : undefined,
      origem: editar?.origem ?? 'manual',
      criadoEm: editar?.criadoEm ?? hoje(),
      serieId: editar?.serieId,
      parcela: editar?.parcela,
    };
    const status = pago ? 'pago' : 'previsto';
    if (editar) {
      despachar({ t: 'lancamento', lancamento: { ...baseL, id: editar.id, data, status } });
    } else if (repeticao === 'nao') {
      despachar({ t: 'lancamentos', lancamentos: [{ ...baseL, id: novoId(), data, status }] });
    } else {
      const serieId = novoId();
      const lista: Lancamento[] = Array.from({ length: n }, (_, i) => {
        const d = usarParcelas ? parcelas[i].data : somaMeses(data, i);
        return {
          ...baseL,
          ...(usarParcelas ? { valor: valoresParcelas[i]! } : {}),
          id: novoId(),
          data: d,
          status: i === 0 ? status : 'previsto',
          serieId,
          parcela: repeticao === 'parcelado' ? { n: i + 1, total: n } : undefined,
        };
      });
      despachar({ t: 'lancamentos', lancamentos: lista });
    }
    aoFechar();
  }

  function excluir(comFuturos: boolean) {
    if (!editar) return;
    despachar({ t: 'excluir', ids: [editar.id, ...(comFuturos ? futurosDaSerie.map((l) => l.id) : [])] });
    aoFechar();
  }

  const sentido = tipo === 'entrada' ? 'entrada' : 'saida';
  const ultimaData = repeticao !== 'nao' && Number(vezes) >= 2 ? somaMeses(data, Number(vezes) - 1) : null;

  return (
    <Folha titulo={editar ? 'Editar lançamento' : TITULOS[tipo]} aoFechar={aoFechar} tom={tipo}>
      <form onSubmit={salvar} noValidate className="form">
        {!editar && (
          <Segmentos
            rotulo="Tipo de lançamento"
            valor={tipo}
            aoMudar={(t) => { setTipo(t); setCategoriaId(''); }}
            opcoes={[{ v: 'entrada', r: '+ Entrada' }, { v: 'saida', r: '− Saída' }, { v: 'transferencia', r: '⇄ Transferência' }]}
          />
        )}
        {!(repeticao === 'parcelado' && ajustar) && (
          <Campo rotulo={repeticao === 'parcelado' ? 'Valor de cada parcela (R$)' : 'Valor (R$)'} id="f-valor" erro={erros.valor}>
            <input id="f-valor" className="input-valor" inputMode="decimal" autoComplete="off" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
          </Campo>
        )}
        <div className="grade-2">
          <Campo rotulo={tipo === 'entrada' ? 'Data do recebimento' : tipo === 'saida' ? 'Data do pagamento' : 'Data'} id="f-data" erro={erros.data}>
            <input id="f-data" type="date" value={data} onChange={(e) => mudarData(e.target.value)} />
          </Campo>
          {tipo === 'transferencia' ? (
            <Campo rotulo="Sai da conta" id="f-conta" erro={erros.conta}>
              <SeletorConta id="f-conta" valor={contaId} aoMudar={setContaId} contas={dados.contas} />
            </Campo>
          ) : (
            <Campo rotulo="Conta" id="f-conta" erro={erros.conta}>
              <SeletorConta id="f-conta" valor={contaId} aoMudar={setContaId} contas={dados.contas} />
            </Campo>
          )}
        </div>
        {tipo === 'transferencia' ? (
          <Campo rotulo="Entra na conta" id="f-destino" erro={erros.destino} ajuda="Transferências não contam como entrada nem saída nos relatórios.">
            <SeletorConta id="f-destino" valor={destinoId} aoMudar={setDestinoId} contas={dados.contas} excluir={contaId} />
          </Campo>
        ) : (
          <Campo rotulo="Categoria" id="f-categoria" erro={erros.categoria}>
            <SeletorCategoria id="f-categoria" valor={categoriaId} aoMudar={setCategoriaId} categorias={dados.categorias} sentido={sentido} />
          </Campo>
        )}
        <Chave id="f-pago" ligada={pago} aoMudar={(v) => { setPago(v); setMexeuPago(true); }}>
          {tipo === 'entrada' ? 'Já foi recebido' : 'Já foi pago'}
          <small>{pago ? 'Entra no saldo real agora.' : 'Fica como previsto: só aparece nos alertas e na projeção.'}</small>
        </Chave>
        {tipo === 'entrada' && (
          <div className="grade-2">
            <Campo rotulo="OS ou pedido (opcional)" id="f-doc" erro={erros.doc}>
              <div className="linha-doc">
                <select id="f-doc-tipo" value={docTipo} onChange={(e) => setDocTipo(e.target.value as typeof docTipo)} aria-label="Tipo de documento">
                  <option value="">Nenhum</option>
                  <option value="os">OS</option>
                  <option value="pedido">Pedido</option>
                </select>
                {docTipo && <input id="f-doc" inputMode="numeric" value={docNum} onChange={(e) => setDocNum(e.target.value)} placeholder="Número" aria-label="Número da OS ou pedido" />}
              </div>
            </Campo>
            <Campo rotulo="Nota fiscal nº (opcional)" id="f-nf" ajuda={docTipo && !nf ? 'Quando emitir a nota, use "Converter em NF" em A pagar e receber.' : undefined}>
              <input id="f-nf" inputMode="numeric" value={nf} onChange={(e) => setNf(e.target.value)} placeholder="Se já foi emitida" />
            </Campo>
          </div>
        )}
        <Campo rotulo="Descrição (opcional)" id="f-desc">
          <input id="f-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder={tipo === 'entrada' ? 'Ex.: Cliente X' : 'Ex.: Conta de energia'} />
        </Campo>
        {!editar && tipo !== 'transferencia' && (
          <div className="campo">
            <span className="rotulo">Repetir</span>
            <Segmentos
              rotulo="Repetir"
              valor={repeticao}
              aoMudar={(r) => { setRepeticao(r); setAjustar(false); setVezes(r === 'mensal' ? '12' : '3'); }}
              opcoes={[{ v: 'nao', r: 'Não repete' }, { v: 'mensal', r: 'Todo mês' }, { v: 'parcelado', r: 'Parcelado' }]}
            />
            {repeticao !== 'nao' && (
              <div className="linha-vezes">
                <label htmlFor="f-vezes">{repeticao === 'mensal' ? 'Criar para os próximos' : 'Número de parcelas'}</label>
                <input id="f-vezes" inputMode="numeric" value={vezes} onChange={(e) => { const v = e.target.value.replace(/\D/g, ''); setVezes(v); if (ajustar) setParcelas(montarParcelas(Number(v))); }} />
                <span>{repeticao === 'mensal' ? 'meses' : 'vezes'}</span>
              </div>
            )}
            {repeticao === 'parcelado' && (
              <Chave id="f-ajustar" ligada={ajustar} aoMudar={ligarAjuste}>
                Parcelas com valores ou datas diferentes
                <small>{ajustar ? 'Digite o vencimento e o valor de cada parcela.' : 'Ligue se a nota não foi dividida em partes iguais ou não vence de 30 em 30 dias.'}</small>
              </Chave>
            )}
            {repeticao === 'parcelado' && ajustar && (
              <div className="lista-parcelas">
                {parcelas.map((p, i) => (
                  <div key={i} className="linha-parcela">
                    <span className="num-parcela">{i + 1}ª</span>
                    <input id={`f-p-data-${i}`} type="date" value={p.data} onChange={(e) => mudarParcela(i, 'data', e.target.value)} aria-label={`Vencimento da parcela ${i + 1}`} />
                    <input id={`f-p-valor-${i}`} inputMode="decimal" placeholder="0,00" value={p.valor} onChange={(e) => mudarParcela(i, 'valor', e.target.value)} aria-label={`Valor da parcela ${i + 1}`} />
                  </div>
                ))}
                <p className="ajuda">Total das parcelas: <strong>{brl(somaParcelas)}</strong></p>
                {erros.parcelas && <p className="erro">{erros.parcelas}</p>}
              </div>
            )}
            {erros.vezes ? <p className="erro">{erros.vezes}</p> : !(repeticao === 'parcelado' && ajustar) && ultimaData && (
              <p className="ajuda">
                {repeticao === 'parcelado' ? 'Cada parcela com o valor acima. ' : ''}A última fica para {dataBR(ultimaData)}. As seguintes entram como previstas.
              </p>
            )}
          </div>
        )}
        {editar?.parcela && <p className="ajuda">Parcela {editar.parcela.n} de {editar.parcela.total}.</p>}

        {confirmarExclusao ? (
          <Confirmar
            perigo
            texto={futurosDaSerie.length ? `Este lançamento se repete. Excluir também os ${futurosDaSerie.length} próximos previstos?` : 'Excluir este lançamento? Não dá para desfazer.'}
            rotuloOk={futurosDaSerie.length ? 'Excluir todos' : 'Excluir'}
            aoConfirmar={() => excluir(true)}
            aoCancelar={() => setConfirmarExclusao(false)}
          />
        ) : null}
        {confirmarExclusao && futurosDaSerie.length > 0 && (
          <button type="button" className="btn btn-link" onClick={() => excluir(false)}>Excluir só este</button>
        )}

        <div className="acoes-form">
          {editar && !confirmarExclusao && (
            <button type="button" className="btn btn-perigo-texto" onClick={() => setConfirmarExclusao(true)}>Excluir</button>
          )}
          <button type="submit" className={`btn btn-grande btn-${tipo}`}>Salvar</button>
        </div>
      </form>
    </Folha>
  );
}

export function FormBaixa({ lancamento, aoFechar }: { lancamento: Lancamento; aoFechar: () => void }) {
  const { dados, despachar } = useDados();
  const [valor, setValor] = useState(valorParaCampo(lancamento.valor));
  const [data, setData] = useState(hoje());
  const [contaId, setContaId] = useState(lancamento.contaId);
  const [erro, setErro] = useState('');
  const recebimento = lancamento.tipo === 'entrada';
  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    const v = parseValor(valor);
    if (v === null || v <= 0) return setErro('Digite um valor maior que zero.');
    despachar({ t: 'lancamento', lancamento: { ...lancamento, valor: v, data, contaId, status: 'pago' } });
    aoFechar();
  }
  return (
    <Folha titulo={recebimento ? 'Confirmar recebimento' : 'Confirmar pagamento'} aoFechar={aoFechar} tom={lancamento.tipo}>
      <form onSubmit={confirmar} noValidate className="form">
        <p className="ajuda">
          {lancamento.descricao || nomeCategoria(lancamento.categoriaId, dados.categorias)}
          {' '}· previsto para {dataBR(lancamento.data)}. Ajuste o valor se teve juros ou desconto.
        </p>
        <Campo rotulo={recebimento ? 'Valor recebido (R$)' : 'Valor pago (R$)'} id="b-valor" erro={erro}>
          <input id="b-valor" className="input-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
        </Campo>
        <div className="grade-2">
          <Campo rotulo={recebimento ? 'Recebido em' : 'Pago em'} id="b-data">
            <input id="b-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
          <Campo rotulo="Conta" id="b-conta">
            <SeletorConta id="b-conta" valor={contaId} aoMudar={setContaId} contas={dados.contas} />
          </Campo>
        </div>
        <div className="acoes-form">
          <button type="submit" className={`btn btn-grande btn-${lancamento.tipo}`}>{recebimento ? 'Confirmar recebimento' : 'Confirmar pagamento'}</button>
        </div>
      </form>
    </Folha>
  );
}

/** Converte uma OS/pedido a receber em nota fiscal: grava o número da NF e permite ajustar valor e vencimento. */
export function FormConverterNF({ lancamento, aoFechar }: { lancamento: Lancamento; aoFechar: () => void }) {
  const { dados, despachar } = useDados();
  const [nf, setNf] = useState('');
  const [valor, setValor] = useState(valorParaCampo(lancamento.valor));
  const [data, setData] = useState(lancamento.data);
  const [erros, setErros] = useState<Record<string, string>>({});
  // Outras parcelas ainda previstas da mesma OS (mesma série e mesmo documento) recebem o mesmo número de nota.
  const irmas = lancamento.serieId
    ? dados.lancamentos.filter((l) => l.serieId === lancamento.serieId && l.id !== lancamento.id && l.status === 'previsto' && !l.nf)
    : [];
  const [todas, setTodas] = useState(true);
  const doc = rotuloDocumento(lancamento);
  function confirmar(e: React.FormEvent) {
    e.preventDefault();
    const v = parseValor(valor);
    const er: Record<string, string> = {};
    if (!nf.trim()) er.nf = 'Digite o número da nota fiscal.';
    if (v === null || v <= 0) er.valor = 'Digite um valor maior que zero.';
    if (!data) er.data = 'Escolha o vencimento.';
    setErros(er);
    if (Object.keys(er).length) return;
    const numero = nf.trim();
    despachar({ t: 'lancamento', lancamento: { ...lancamento, nf: numero, valor: v!, data } });
    if (todas) irmas.forEach((l) => despachar({ t: 'lancamento', lancamento: { ...l, nf: numero } }));
    aoFechar();
  }
  return (
    <Folha titulo="Converter em nota fiscal" aoFechar={aoFechar} tom="entrada">
      <form onSubmit={confirmar} noValidate className="form">
        <p className="ajuda">
          {doc}{lancamento.descricao ? ` · ${lancamento.descricao}` : ''} · {nomeCategoria(lancamento.categoriaId, dados.categorias)}.
          {' '}A OS/pedido continua guardada junto com a nota, e dá para buscar por qualquer um dos dois números.
        </p>
        <Campo rotulo="Número da nota fiscal" id="nf-num" erro={erros.nf}>
          <input id="nf-num" inputMode="numeric" value={nf} onChange={(e) => setNf(e.target.value)} autoFocus />
        </Campo>
        <div className="grade-2">
          <Campo rotulo="Valor da nota (R$)" id="nf-valor" erro={erros.valor}>
            <input id="nf-valor" inputMode="decimal" value={valor} onChange={(e) => setValor(e.target.value)} />
          </Campo>
          <Campo rotulo="Vencimento" id="nf-data" erro={erros.data}>
            <input id="nf-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
        </div>
        {irmas.length > 0 && (
          <Chave id="nf-todas" ligada={todas} aoMudar={setTodas}>
            Mesma nota nas outras {irmas.length} parcelas
            <small>{todas ? 'O número da nota vai para todas as parcelas em aberto. Valor e vencimento mudam só nesta.' : 'Só esta parcela recebe o número da nota.'}</small>
          </Chave>
        )}
        <div className="acoes-form">
          <button type="submit" className="btn btn-grande btn-entrada">Converter</button>
        </div>
      </form>
    </Folha>
  );
}
