import { useState } from 'react';
import { useDados } from '../data/store';
import { compromissos, futuroMensal, type MesFuturo } from '../lib/futuro';
import { brl, hoje, mesCurto, mesDe, somaMesesMes } from '../lib/format';
import { BarrasFuturo } from '../components/graficos';
import { BarraComprometida, Icone, Segmentos } from '../components/ui';

const curto = (mes: string) => mesCurto(`${mes}-01`);

/** Perfil pessoal: quanto da renda já está comprometido nos próximos meses e quando cada compromisso termina. */
export function Futuro({ ir }: { ir: (r: string) => void }) {
  const { dados } = useDados();
  const [n, setN] = useState<'12' | '24'>('12');
  const h = hoje();
  const mes = mesDe(h);
  const meses = futuroMensal(dados, mes, Number(n));
  const lista = compromissos(dados, h);
  const proximo = meses[0];
  const comRenda = meses.filter((m) => m.pct !== null);
  const media = comRenda.length ? Math.round(comRenda.reduce((a, m) => a + m.pct!, 0) / comRenda.length) : null;
  const pior = comRenda.reduce<MesFuturo | null>((a, m) => (!a || m.pct! > a.pct! ? m : a), null);
  const semRendaFutura = meses.slice(1).every((m) => m.renda === 0);
  // Primeiro compromisso que termina e quanto sobra por mês depois dele.
  const alivio = lista.find((c) => c.ultimoMes >= mes);

  return (
    <div className="tela">
      <header className="tela-topo">
        <h1>Futuro</h1>
        <p className="lead">Quanto da sua renda já está comprometido nos próximos meses: gastos essenciais, financiamentos e parcelas do cartão.</p>
      </header>

      <dl className="futuro-resumo">
        <div>
          <dt>Este mês ({curto(mes)})</dt>
          <dd className={proximo.faixa ? `pct-faixa-${proximo.faixa}` : ''}>{proximo.pct === null ? '–' : `${proximo.pct}%`}</dd>
          <span className="ajuda">{proximo.pct === null ? 'Sem renda lançada' : `${brl(proximo.comprometido)} de ${brl(proximo.renda)}`}</span>
        </div>
        <div>
          <dt>Média dos próximos {n} meses</dt>
          <dd className={media !== null ? `pct-faixa-${media <= 50 ? 'ok' : media <= 70 ? 'atencao' : 'alto'}` : ''}>{media === null ? '–' : `${media}%`}</dd>
          <span className="ajuda">da renda prevista</span>
        </div>
        <div>
          <dt>Mês mais apertado</dt>
          <dd className={pior?.faixa ? `pct-faixa-${pior.faixa}` : ''}>{pior ? curto(pior.mes) : '–'}</dd>
          <span className="ajuda">{pior ? `${pior.pct}% da renda comprometida` : 'Lance a renda prevista'}</span>
        </div>
      </dl>

      {proximo.pct !== null && <BarraComprometida pct={proximo.pct} faixa={proximo.faixa!} />}
      <p className="ajuda">Referência: até 50% da renda comprometida é tranquilo, de 50% a 70% pede atenção, acima de 70% sobra pouco para o dia a dia e para investir.</p>

      {semRendaFutura && (
        <p className="alerta-forte">
          <Icone nome="alerta" /> Para a linha da renda aparecer nos próximos meses, lance o salário (ou pró-labore) com <strong>Repetir: Todo mês</strong>. Faça o mesmo com contas fixas como escola e plano de saúde.
        </p>
      )}

      <section className="cartao" aria-labelledby="t-fut">
        <header className="cartao-topo">
          <h2 id="t-fut">Mês a mês</h2>
          <Segmentos rotulo="Meses" valor={n} aoMudar={setN} opcoes={[{ v: '12', r: '12 meses' }, { v: '24', r: '24 meses' }]} />
        </header>
        <BarrasFuturo meses={meses} rotulo={curto} />
        <div className="tabela-rolagem">
          <table className="cascata tabela-futuro">
            <thead>
              <tr>
                <th scope="col">Mês</th>
                <th scope="col" className="num">Renda prevista</th>
                <th scope="col" className="num">Comprometido</th>
                <th scope="col" className="num pct">%</th>
                <th scope="col" className="num">Livre</th>
              </tr>
            </thead>
            <tbody>
              {meses.map((m) => (
                <tr key={m.mes} className="linha-cat">
                  <th scope="row">{curto(m.mes)}</th>
                  <td className="num">{brl(m.renda)}</td>
                  <td className="num">{brl(m.comprometido)}</td>
                  <td className={`num pct ${m.faixa ? `pct-faixa-${m.faixa}` : ''}`}>{m.pct === null ? '–' : `${m.pct}%`}</td>
                  <td className={`num ${m.renda - m.comprometido < 0 ? 'neg' : ''}`}>{m.renda ? brl(m.renda - m.comprometido) : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="ajuda">Comprometido = gastos essenciais + dívidas e financiamentos + parcelas no cartão, pagos e previstos. Livre = renda prevista menos o comprometido (ainda sem o dia a dia).</p>
      </section>

      <section className="cartao" aria-labelledby="t-comp">
        <header className="cartao-topo">
          <h2 id="t-comp">Quando cada compromisso termina</h2>
          <button type="button" className="btn-link" onClick={() => ir('agenda')}>A pagar <Icone nome="seta" tamanho={16} /></button>
        </header>
        {lista.length === 0 ? (
          <p className="ajuda">Nenhum parcelamento em aberto. Financiamentos, empréstimos e compras parceladas no cartão aparecem aqui com a data da última parcela.</p>
        ) : (
          <>
            {alivio && (
              <p className="alivio">
                Em <strong>{curto(alivio.ultimoMes)}</strong> termina <strong>{alivio.nome}</strong>: a partir de {curto(somaMesesMes(alivio.ultimoMes, 1))} sobram <strong>{brl(alivio.parcela)}</strong> a mais por mês.
              </p>
            )}
            <ul className="compromissos">
              {lista.map((c) => (
                <li key={c.serieId}>
                  <span>
                    <strong>{c.nome}</strong>
                    <span className="lanc-meta">
                      {c.noCartao ? 'Cartão · ' : ''}{c.restantes} {c.restantes === 1 ? 'parcela restante' : 'parcelas restantes'}{c.total ? ` de ${c.total}` : ''} · termina em {curto(c.ultimoMes)}
                    </span>
                  </span>
                  <span className="num">
                    {brl(c.parcela)}/mês
                    <span className="lanc-meta">faltam {brl(c.valorRestante)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>
    </div>
  );
}
