import { nomeCategoria } from '../lib/categorias';
import { useState } from 'react';
import type { TipoLancamento } from '../types';
import { useDados } from '../data/store';
import { cascata, entradasSaidasPorDia, porMes, porSemana, pontoEquilibrio, previstosEntre, saldos, totaisPrevistos } from '../lib/calc';
import { ehPessoal } from '../data/planos';
import { limitesDoMes, rendaComprometida } from '../lib/futuro';
import { fechamentoDaFatura, resumoCartao, vencimentoDaFatura, type ResumoCartao } from '../lib/cartao';
import { brl, dataBR, dataEixo, hoje, mesCurto, mesDe, nomeMes, somaDias } from '../lib/format';
import { BarrasEntradaSaida } from '../components/graficos';
import { BarraComprometida, Icone, Segmentos, Valor } from '../components/ui';
import { AvisosPessoal } from '../components/Avisos';
import type { InicialForm } from '../components/FormLancamento';

export function Painel({ novo, ir, rapido, pendentes, lancar }: { novo: (t: TipoLancamento) => void; ir: (rota: string) => void; rapido: () => void; pendentes: () => void; lancar: (inicial: InicialForm) => void }) {
  const { dados } = useDados();
  const [verContas, setVerContas] = useState(false);
  const [periodo, setPeriodo] = useState<'dias' | 'semanas' | 'meses'>('dias');
  const h = hoje();
  const mes = mesDe(h);
  const s = saldos(dados, h);
  const pendentesExtrato = (dados.extrato ?? []).filter((t) => t.situacao === 'pendente').length;
  const ultimaImportacao = dados.importacoes?.at(-1)?.em;
  const atrasados = previstosEntre(dados, null, somaDias(h, -1));
  const deHoje = previstosEntre(dados, h, h);
  const tHoje = totaisPrevistos(deHoje);
  const tAtrasados = totaisPrevistos(atrasados);
  const c = cascata(dados, mes);
  const pe = pontoEquilibrio(dados, mes);
  const entradasMes = c.blocos.entradas.realizado;
  const pctMargem = entradasMes ? Math.round((c.margem[0] / entradasMes) * 100) : null;
  const pessoal = ehPessoal(dados.empresa);
  const rc = rendaComprometida(dados, mes);
  const pctSobrou = entradasMes ? Math.round((c.operacional[0] / entradasMes) * 100) : null;
  const nPendentes = dados.pendentes?.length ?? 0;
  const limites = limitesDoMes(dados, mes);
  const cartoes = dados.contas.filter((x) => !x.arquivada).map((x) => resumoCartao(dados, x, h)).filter((x): x is ResumoCartao => !!x);
  const serie = periodo === 'dias' ? entradasSaidasPorDia(dados, somaDias(h, -6), h) : periodo === 'semanas' ? porSemana(dados, h, 8) : porMes(dados, mes, 12);

  return (
    <div className="tela painel">
      <section className="saldo-cartao" aria-labelledby="t-saldo">
        <p className="sobrelinha" id="t-saldo">Dinheiro disponível agora</p>
        <p className={`saldo-grande ${s.disponivel < 0 ? 'neg' : ''}`}>{brl(s.disponivel)}</p>
        {s.aplicado !== 0 && <p className="saldo-sub">Com aplicações: <strong>{brl(s.total)}</strong></p>}
        <button type="button" className="btn-link-claro" aria-expanded={verContas} onClick={() => setVerContas(!verContas)}>
          {verContas ? 'Esconder contas' : `Ver por conta (${s.porConta.length})`}
        </button>
        {verContas && (
          <ul className="lista-contas">
            {s.porConta.map(({ conta, saldo }) => (
              <li key={conta.id}>
                <span>{conta.nome}{conta.tipo === 'aplicacao' && <em> · aplicação</em>}{conta.tipo === 'cartao' && <em> · cartão (compras ainda não pagas)</em>}</span>
                <span className="num">{brl(saldo)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="acoes-rapidas">
        <button type="button" className="btn-acao btn-entrada" onClick={() => novo('entrada')}><Icone nome="mais" /> Nova entrada</button>
        <button type="button" className="btn-acao btn-saida" onClick={() => novo('saida')}><Icone nome="menos" /> Nova saída</button>
        <button type="button" className="btn-acao btn-transferencia" onClick={() => novo('transferencia')} aria-label="Transferência entre contas"><Icone nome="troca" /><span className="so-largo">Transferir</span></button>
      </div>

      <button type="button" className="btn-rapido" onClick={rapido}>
        <Icone nome="raio" />
        <span><strong>Rápido</strong> · anote um gasto agora e complete depois</span>
      </button>

      {nPendentes > 0 && (
        <button type="button" className="faixa-extrato faixa-pendentes" onClick={pendentes}>
          <Icone nome="lista" />
          <span><strong>{nPendentes} {nPendentes === 1 ? 'gasto pendente' : 'gastos pendentes'}</strong> para completar (categoria e como pagou)</span>
          <Icone nome="seta" tamanho={16} />
        </button>
      )}

      {pessoal && <AvisosPessoal lancar={lancar} />}

      <button type="button" className="faixa-extrato" onClick={() => ir('extrato')}>
        <Icone nome="banco" />
        <span>
          {pendentesExtrato ? <><strong>{pendentesExtrato} {pendentesExtrato === 1 ? 'movimentação' : 'movimentações'} do extrato</strong> para revisar</>
            : ultimaImportacao ? <>Extrato importado em {dataBR(ultimaImportacao)}. <strong>Importar o mais recente</strong></>
            : <><strong>Importe o extrato do banco</strong> e pare de digitar tudo à mão</>}
        </span>
        <Icone nome="seta" tamanho={16} />
      </button>

      <div className="grade-painel">
        <section className="cartao" aria-labelledby="t-hoje">
          <header className="cartao-topo">
            <h2 id="t-hoje">Hoje</h2>
            <button type="button" className="btn-link" onClick={() => ir('agenda')}>A pagar e a receber <Icone nome="seta" tamanho={16} /></button>
          </header>
          <dl className="pares">
            <div><dt>A receber hoje</dt><dd className="pos">{brl(tHoje.receber)}</dd></div>
            <div><dt>A pagar hoje</dt><dd className="neg">{brl(tHoje.pagar)}</dd></div>
          </dl>
          {atrasados.length > 0 ? (
            <button type="button" className="aviso-atraso" onClick={() => ir('agenda')}>
              <Icone nome="alerta" />
              <span>
                <strong>{atrasados.length} {atrasados.length === 1 ? 'conta atrasada' : 'contas atrasadas'}</strong>
                {tAtrasados.pagar > 0 && <> · pagar {brl(tAtrasados.pagar)}</>}
                {tAtrasados.receber > 0 && <> · receber {brl(tAtrasados.receber)}</>}
              </span>
              <Icone nome="seta" tamanho={16} />
            </button>
          ) : (
            <p className="ok"><Icone nome="check" tamanho={16} /> Nada atrasado.</p>
          )}
          {deHoje.length > 0 && (
            <ul className="mini-lista">
              {deHoje.slice(0, 4).map((l) => (
                <li key={l.id}>
                  <span>{l.descricao || nomeCategoria(l.categoriaId, dados.categorias) || 'Transferência'}</span>
                  <Valor v={l.tipo === 'entrada' ? l.valor : -l.valor} sinal />
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="cartao" aria-labelledby="t-mes">
          <header className="cartao-topo">
            <h2 id="t-mes">{nomeMes(mes).replace(/^./, (x) => x.toUpperCase())}</h2>
            <button type="button" className="btn-link" onClick={() => ir('relatorio')}>Relatório <Icone nome="seta" tamanho={16} /></button>
          </header>
          {pessoal ? (
            <>
              <dl className="pares">
                <div><dt>Renda recebida</dt><dd className="pos">{brl(entradasMes)}</dd></div>
                <div>
                  <dt>Quanto sobrou</dt>
                  <dd className={c.operacional[0] < 0 ? 'neg' : ''}>{brl(c.operacional[0])}{pctSobrou !== null && <small> ({pctSobrou}% da renda)</small>}</dd>
                </div>
              </dl>
              <div className="equilibrio">
                <p className="rotulo">Renda comprometida</p>
                {rc.pct === null ? (
                  <p className="ajuda">Lance a renda do mês (pode ser prevista) para ver quanto dela já está preso em gastos essenciais e dívidas.</p>
                ) : (
                  <>
                    <BarraComprometida pct={rc.pct} faixa={rc.faixa!} />
                    <p className="equilibrio-texto">
                      <strong>{rc.pct}%</strong> da renda do mês vai para gastos essenciais, dívidas e parcelas ({brl(rc.comprometido)} de {brl(rc.renda)}).
                      {rc.faixa === 'ok' ? ' Tranquilo.' : rc.faixa === 'atencao' ? ' Atenção: acima de 50%.' : ' Apertado: acima de 70%.'}
                    </p>
                    <button type="button" className="btn-link" onClick={() => ir('futuro')}>Ver os próximos meses <Icone nome="seta" tamanho={16} /></button>
                  </>
                )}
              </div>
            </>
          ) : (
            <>
          <dl className="pares">
              <div><dt>Entrou</dt><dd className="pos">{brl(entradasMes)}</dd></div>
              <div>
                <dt>Margem de contribuição</dt>
                <dd>{brl(c.margem[0])}{pctMargem !== null && <small> ({pctMargem}% das entradas)</small>}</dd>
              </div>
            </dl>
            <div className="equilibrio">
              <p className="rotulo">Ponto de equilíbrio</p>
              {pe.fixas === 0 ? (
                <p className="ajuda">Lance as despesas fixas do mês para ver em que dia elas ficam cobertas.</p>
              ) : (
                <>
                  <div className="barra-progresso" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, Math.round((Math.max(0, pe.margemAcumulada) / pe.fixas) * 100))}>
                    <span style={{ width: `${Math.min(100, (Math.max(0, pe.margemAcumulada) / pe.fixas) * 100)}%` }} className={pe.dia ? 'cheia' : ''} />
                  </div>
                  <p className="equilibrio-texto">
                    {pe.dia ? (
                      <>Atingido em <strong>{dataBR(pe.dia)}</strong>. As despesas fixas de {brl(pe.fixas)} já estão cobertas.</>
                    ) : (
                      <>Faltam <strong>{brl(pe.falta)}</strong> de margem para cobrir as despesas fixas de {brl(pe.fixas)}.</>
                    )}
                  </p>
                </>
              )}
            </div>
            </>
          )}
        </section>
      </div>

      {limites.length > 0 && (
        <section className="cartao" aria-labelledby="t-limites">
          <header className="cartao-topo">
            <h2 id="t-limites">Limites do mês</h2>
            <button type="button" className="btn-link" onClick={() => ir('opcoes')}>Mudar limites <Icone nome="seta" tamanho={16} /></button>
          </header>
          <ul className="limites">
            {limites.map((x) => (
              <li key={x.categoria.id}>
                <div className="limite-topo">
                  <span>{x.categoria.nome}</span>
                  <span className={`num ${x.pct > 100 ? 'neg' : ''}`}>{brl(x.gasto)} de {brl(x.limite)}</span>
                </div>
                <div className={`barra-progresso faixa-${x.pct < 80 ? 'ok' : x.pct <= 100 ? 'atencao' : 'alto'}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(100, x.pct)} aria-label={`Limite de ${x.categoria.nome}`}>
                  <span style={{ width: `${Math.min(100, x.pct)}%` }} />
                </div>
                <p className="ajuda">{x.falta >= 0 ? `Ainda pode gastar ${brl(x.falta)} (${x.pct}% usado).` : `Passou ${brl(-x.falta)} do limite.`}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {cartoes.length > 0 && (
        <section className="cartao" aria-labelledby="t-cartoes">
          <header className="cartao-topo">
            <h2 id="t-cartoes">{cartoes.length === 1 ? 'Cartão de crédito' : 'Cartões de crédito'}</h2>
            <button type="button" className="btn-link" onClick={() => ir('agenda')}>Faturas a pagar <Icone nome="seta" tamanho={16} /></button>
          </header>
          <div className="cartoes">
            {cartoes.map((r) => <ResumoDoCartao key={r.conta.id} r={r} hoje={h} />)}
          </div>
        </section>
      )}

      <section className="cartao" aria-labelledby="t-grafico">
        <header className="cartao-topo">
          <h2 id="t-grafico">Entrou x saiu</h2>
          <Segmentos rotulo="Período do gráfico" valor={periodo} aoMudar={setPeriodo} opcoes={[{ v: 'dias', r: '7 dias' }, { v: 'semanas', r: '8 semanas' }, { v: 'meses', r: '12 meses' }]} />
        </header>
        <BarrasEntradaSaida dados={serie} rotuloEixo={periodo === 'meses' ? mesCurto : periodo === 'semanas' ? (d) => dataEixo(d) : undefined} />
      </section>
    </div>
  );
}

function ResumoDoCartao({ r, hoje: h }: { r: ResumoCartao; hoje: string }) {
  const limite = r.conta.cartao.limite;
  const pct = limite ? Math.min(100, Math.round((r.usado / limite) * 100)) : null;
  const proximas = r.aPagar.filter((f) => f.mes !== r.mesAberta).slice(0, 4);
  return (
    <div className="cartao-credito">
      <div className="cartao-credito-topo">
        <strong>{r.conta.nome}</strong>
        <span className="num">{brl(r.aberta?.total ?? 0)}</span>
      </div>
      <p className="ajuda">Fatura de {mesCurto(`${r.mesAberta}-01`)}, aberta: fecha em {dataBR(fechamentoDaFatura(r.mesAberta, r.conta.cartao))} e vence em {dataBR(vencimentoDaFatura(r.mesAberta, r.conta.cartao))}.</p>
      {proximas.length > 0 && (
        <ul className="faturas">
          {proximas.map((f) => (
            <li key={f.mes}>
              <span>{f.vencimento < h ? 'Atrasada: ' : ''}Fatura de {mesCurto(`${f.mes}-01`)} · vence {dataBR(f.vencimento)}</span>
              <span className={`num ${f.vencimento < h ? 'neg' : ''}`}>{brl(f.falta)}</span>
            </li>
          ))}
        </ul>
      )}
      {r.futuro > 0 && <p className="ajuda">Já comprometido em parcelas nas próximas faturas: <strong>{brl(r.futuro)}</strong>.</p>}
      {pct !== null && (
        <>
          <div className={`barra-progresso faixa-${pct <= 50 ? 'ok' : pct <= 80 ? 'atencao' : 'alto'}`} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Limite usado">
            <span style={{ width: `${pct}%` }} />
          </div>
          <p className="ajuda">Limite usado: {brl(r.usado)} de {brl(limite!)} · disponível {brl(Math.max(0, limite! - r.usado))}.</p>
        </>
      )}
    </div>
  );
}
