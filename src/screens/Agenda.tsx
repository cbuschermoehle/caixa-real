import { nomeCategoria, rotuloDocumento } from '../lib/categorias';
import { FormConverterNF } from '../components/FormLancamento';
import { useState } from 'react';
import type { Lancamento } from '../types';
import { useDados } from '../data/store';
import { diasDeAtraso, longoPrazo, previstosEntre, projecao, totaisPrevistos } from '../lib/calc';
import { brl, dataAmigavel, dataBR, hoje, mesCurto, mesDe, nomeMes, somaDias, somaMesesMes, ultimoDiaDoMes } from '../lib/format';
import { BarrasEntradaSaida, LinhaSaldo } from '../components/graficos';
import { Icone, Segmentos, Valor } from '../components/ui';

type Aba = 'atrasados' | 'hoje' | '7' | '30' | 'mes' | 'longo';

export function Agenda({ baixa, editar }: { baixa: (l: Lancamento) => void; editar: (l: Lancamento) => void }) {
  const { dados } = useDados();
  const h = hoje();
  const atrasados = previstosEntre(dados, null, somaDias(h, -1));
  const [aba, setAba] = useState<Aba>(atrasados.length ? 'atrasados' : '7');
  const [mes, setMes] = useState(mesDe(h));
  const [diasProj, setDiasProj] = useState<'30' | '60' | '90'>('30');
  const [converter, setConverter] = useState<Lancamento | null>(null);

  const lista =
    aba === 'atrasados' ? atrasados
    : aba === 'hoje' ? previstosEntre(dados, h, h)
    : aba === '7' ? previstosEntre(dados, h, somaDias(h, 7))
    : aba === '30' ? previstosEntre(dados, h, somaDias(h, 30))
    : aba === 'mes' ? previstosEntre(dados, `${mes}-01`, ultimoDiaDoMes(mes))
    : [];
  const t = totaisPrevistos(lista);
  const proj = projecao(dados, h, Number(diasProj));

  const grupos = new Map<string, Lancamento[]>();
  lista.forEach((l) => grupos.set(l.data, [...(grupos.get(l.data) ?? []), l]));
  const nomeCat = (l: Lancamento) =>
    l.tipo === 'transferencia'
      ? `Transferência para ${dados.contas.find((c) => c.id === l.contaDestinoId)?.nome ?? '—'}`
      : nomeCategoria(l.categoriaId, dados.categorias) || 'Sem categoria';
  const nomeConta = (id: string) => dados.contas.find((c) => c.id === id)?.nome ?? '—';

  return (
    <div className="tela">
      <header className="tela-topo">
        <h1>A pagar e a receber</h1>
        <p className="lead">Só os lançamentos previstos. Eles não mexem no saldo até você confirmar o pagamento.</p>
      </header>

      <section className="cartao" aria-labelledby="t-proj">
        <header className="cartao-topo">
          <h2 id="t-proj">Saldo projetado</h2>
          <Segmentos rotulo="Dias da projeção" valor={diasProj} aoMudar={setDiasProj} opcoes={[{ v: '30', r: '30 dias' }, { v: '60', r: '60' }, { v: '90', r: '90' }]} />
        </header>
        {proj.primeiroNegativo ? (
          <p className="alerta-forte"><Icone nome="alerta" /> Se nada mudar, o dinheiro disponível fica negativo em <strong>{dataBR(proj.primeiroNegativo)}</strong>.</p>
        ) : (
          <p className="ajuda">Menor saldo no período: <strong>{brl(proj.menor.saldo)}</strong> em {dataBR(proj.menor.data)}.</p>
        )}
        <LinhaSaldo pontos={proj.pontos} destaque={proj.primeiroNegativo} />
      </section>

      <div className="abas" role="tablist" aria-label="Período">
        {([
          ['atrasados', `Atrasados${atrasados.length ? ` (${atrasados.length})` : ''}`],
          ['hoje', 'Hoje'],
          ['7', '7 dias'],
          ['30', '30 dias'],
          ['mes', 'Mês'],
          ['longo', 'Longo prazo'],
        ] as [Aba, string][]).map(([v, r]) => (
          <button key={v} type="button" role="tab" aria-selected={aba === v} className={`${aba === v ? 'ativo' : ''} ${v === 'atrasados' && atrasados.length ? 'tem-alerta' : ''}`} onClick={() => setAba(v)}>{r}</button>
        ))}
      </div>

      {aba === 'longo' && <LongoPrazo />}

      {aba === 'mes' && (
        <div className="seletor-mes">
          <button type="button" className="btn-icone" onClick={() => setMes(somaMesesMes(mes, -1))} aria-label="Mês anterior"><Icone nome="voltar" /></button>
          <strong>{nomeMes(mes)}</strong>
          <button type="button" className="btn-icone" onClick={() => setMes(somaMesesMes(mes, 1))} aria-label="Próximo mês"><Icone nome="seta" /></button>
        </div>
      )}

      {aba !== 'longo' && <>
      <dl className="totais-3">
        <div><dt>A receber</dt><dd className="pos">{brl(t.receber)}</dd></div>
        <div><dt>A pagar</dt><dd className="neg">{brl(t.pagar)}</dd></div>
        <div><dt>Diferença</dt><dd className={t.diferenca < 0 ? 'neg' : ''}>{brl(t.diferenca)}</dd></div>
      </dl>

      {lista.length === 0 ? (
        <p className="vazio">Nada previsto neste período.</p>
      ) : (
        [...grupos.entries()].map(([data, itens]) => (
          <section key={data} className="grupo-dia">
            <h3>{aba === 'atrasados' ? `${dataBR(data)} · ${diasDeAtraso(itens[0], h)} ${diasDeAtraso(itens[0], h) === 1 ? 'dia' : 'dias'} de atraso` : dataAmigavel(data, h)}</h3>
            <ul className="lista-lanc">
              {itens.map((l) => (
                <li key={l.id} className={aba === 'atrasados' ? 'atrasado' : ''}>
                  <button type="button" className="lanc-info" onClick={() => editar(l)}>
                    <span className="lanc-titulo">{l.descricao || nomeCat(l)}</span>
                    <span className="lanc-meta">
                      {l.descricao ? `${nomeCat(l)} · ` : ''}{nomeConta(l.contaId)}
                      {l.parcela && ` · ${l.parcela.n}/${l.parcela.total}`}
                      {rotuloDocumento(l) && ` · ${rotuloDocumento(l)}`}
                    </span>
                  </button>
                  {l.tipo === 'entrada' && l.documento && !l.nf && (
                    <button type="button" className="btn btn-link btn-nf" onClick={() => setConverter(l)}>Converter em NF</button>
                  )}
                  <Valor v={l.tipo === 'entrada' ? l.valor : l.tipo === 'saida' ? -l.valor : 0} sinal classe="lanc-valor" />
                  <button type="button" className={`btn btn-baixa btn-baixa-${l.tipo}`} onClick={() => baixa(l)}>
                    {l.tipo === 'entrada' ? 'Recebi' : l.tipo === 'saida' ? 'Paguei' : 'Feito'}
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
      {aba !== 'mes' && aba !== 'atrasados' && lista.length > 0 && <p className="ajuda centro">Até {dataBR(aba === 'hoje' ? h : somaDias(h, Number(aba)))}</p>}
      </>}
      {converter && <FormConverterNF lancamento={converter} aoFechar={() => setConverter(null)} />}
    </div>
  );
}

function LongoPrazo() {
  const { dados } = useDados();
  const h = hoje();
  const { porAno, series } = longoPrazo(dados, h);
  if (!porAno.length) return <p className="vazio">Nenhum previsto lançado.</p>;
  const pagar = series.filter((s) => s.tipo === 'saida');
  const receber = series.filter((s) => s.tipo === 'entrada');
  const totalPagar = pagar.reduce((a, s) => a + s.valorRestante, 0);
  const tabela = (lista: typeof series, titulo: string, rotulo = 'Falta pagar') => (
    <section className="cartao">
      <h2>{titulo}</h2>
      <div className="tabela-rolagem sem-borda">
        <table className="tabela-series">
          <thead>
            <tr>
              <th scope="col">Compromisso</th>
              <th scope="col" className="num">{rotulo}</th>
              <th scope="col" className="num">Termina</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((s) => (
              <tr key={s.serieId}>
                <th scope="row">
                  {s.nome}
                  <span className="ajuda">{s.restantes}{s.total ? ` de ${s.total}` : ''} parcelas de {brl(s.parcela)}</span>
                </th>
                <td className="num"><strong>{brl(s.valorRestante)}</strong></td>
                <td className="num">{mesCurto(s.ultima)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
  return (
    <>
      <section className="cartao">
        <header className="cartao-topo">
          <h2>Previstos por ano</h2>
        </header>
        <p className="ajuda">Tudo o que está lançado como previsto, somado por ano. Atrasados entram no ano atual.</p>
        <BarrasEntradaSaida
          dados={porAno.map((a) => ({ data: `${a.ano}-01-01`, entradas: a.receber, saidas: a.pagar }))}
          rotuloEixo={(d) => d.slice(0, 4)}
          rotulos={{ entradas: 'A receber', saidas: 'A pagar', entrou: 'Receber', saiu: 'Pagar' }}
        />
      </section>
      {pagar.length > 0 && tabela(pagar, `Parcelamentos e contas que se repetem · ${brl(totalPagar)} a pagar`)}
      {receber.length > 0 && tabela(receber, 'Recebimentos parcelados', 'Falta receber')}
    </>
  );
}
