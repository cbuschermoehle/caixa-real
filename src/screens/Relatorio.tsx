import { Fragment, useState, type ReactNode } from 'react';
import type { Bloco } from '../types';
import { useDados } from '../data/store';
import { blocosDe, ehPessoal, linhasDoRelatorio } from '../data/planos';
import { cascata, pontoEquilibrio, saldos } from '../lib/calc';
import { rendaComprometida } from '../lib/futuro';
import { brl, dataBR, hoje, mesDe, nomeMes, somaDias, somaMesesMes } from '../lib/format';
import { BarraComprometida, Chave, Icone } from '../components/ui';
import { FechamentoPDF, imprimirFechamento } from '../components/FechamentoPDF';

export function Relatorio() {
  const { dados } = useDados();
  const [mes, setMes] = useState(mesDe(hoje()));
  const [comPrevistos, setComPrevistos] = useState(false);
  const [abertos, setAbertos] = useState<Set<Bloco>>(new Set());
  const c = cascata(dados, mes);
  const pe = pontoEquilibrio(dados, mes);
  const pessoal = ehPessoal(dados.empresa);
  const blocos = blocosDe(dados.empresa);
  const rc = rendaComprometida(dados, mes);
  const base = c.blocos.entradas.realizado + (comPrevistos ? c.blocos.entradas.previsto : 0);
  const pct = (v: number) => (base ? `${Math.round((v / base) * 100)}%` : '–');
  const inicioMes = somaDias(`${mes}-01`, -1);
  const fimMes = somaDias(`${somaMesesMes(mes, 1)}-01`, -1);
  const saldoIni = saldos(dados, inicioMes).total;
  const saldoFim = saldos(dados, fimMes).total;

  const alternar = (b: Bloco) =>
    setAbertos((s) => {
      const n = new Set(s);
      if (n.has(b)) n.delete(b);
      else n.add(b);
      return n;
    });

  const colunas = (real: number, prev: number) => {
    const total = real + (comPrevistos ? prev : 0);
    return (
      <>
        <td className="num">{brl(real)}</td>
        {comPrevistos && <td className="num apagado">{prev ? brl(prev) : '–'}</td>}
        {comPrevistos && <td className="num">{brl(total)}</td>}
        <td className="num pct">{pct(total)}</td>
      </>
    );
  };

  const linhaBloco = (b: Bloco, operador: '+' | '−' | '±') => {
    const t = c.blocos[b];
    const info = blocos.find((x) => x.id === b)!;
    const aberto = abertos.has(b);
    return (
      <>
        <tr className="linha-bloco">
          <th scope="row">
            <button type="button" onClick={() => alternar(b)} aria-expanded={aberto}>
              <span className="operador" aria-hidden="true">{operador}</span>
              {info.nome}
              <span className={`seta ${aberto ? 'aberta' : ''}`} aria-hidden="true"><Icone nome="seta" tamanho={14} /></span>
            </button>
          </th>
          {colunas(t.realizado, t.previsto)}
        </tr>
        {aberto &&
          (t.linhas.length ? (
            t.linhas.map((l) => (
              <Fragment key={l.categoria.id}>
                <tr className="linha-cat">
                  <th scope="row">{l.categoria.nome}</th>
                  {colunas(l.realizado, l.previsto)}
                </tr>
                {l.subs?.map((x) => (
                  <tr key={x.categoria.id + x.categoria.nome} className="linha-cat linha-sub">
                    <th scope="row">↳ {x.categoria.nome}</th>
                    {colunas(x.realizado, x.previsto)}
                  </tr>
                ))}
              </Fragment>
            ))
          ) : (
            <tr className="linha-cat"><th scope="row" colSpan={comPrevistos ? 5 : 3} className="apagado">Nada lançado neste bloco.</th></tr>
          ))}
      </>
    );
  };

  const resultado = (rotulo: ReactNode, v: [number, number], forte = false) => (
    <tr className={`linha-resultado ${forte ? 'forte' : ''}`}>
      <th scope="row">{rotulo}</th>
      {colunas(v[0], v[1])}
    </tr>
  );

  return (
    <div className="tela">
      <header className="tela-topo">
        <h1>Relatório do mês</h1>
        <button type="button" className="btn" onClick={() => imprimirFechamento(`Fechamento ${nomeMes(mes)} - ${dados.empresa?.nome ?? ''}`)}>
          <Icone nome="relatorio" tamanho={18} /> Baixar PDF
        </button>
        <div className="seletor-mes">
          <button type="button" className="btn-icone" onClick={() => setMes(somaMesesMes(mes, -1))} aria-label="Mês anterior"><Icone nome="voltar" /></button>
          <strong>{nomeMes(mes)}</strong>
          <button type="button" className="btn-icone" onClick={() => setMes(somaMesesMes(mes, 1))} aria-label="Próximo mês"><Icone nome="seta" /></button>
        </div>
      </header>
      <Chave id="r-prev" ligada={comPrevistos} aoMudar={setComPrevistos}>
        Incluir previstos
        <small>{comPrevistos ? 'Mostra o que já aconteceu, o que falta e o total esperado do mês.' : 'Mostra só o que já foi pago e recebido.'}</small>
      </Chave>

      <div className="tabela-rolagem">
        <table className="cascata">
          <thead>
            <tr>
              <th scope="col"><span className="sr">Linha</span></th>
              <th scope="col" className="num">{comPrevistos ? 'Realizado' : 'Valor'}</th>
              {comPrevistos && <th scope="col" className="num">Falta</th>}
              {comPrevistos && <th scope="col" className="num">Esperado</th>}
              <th scope="col" className="num pct">{pessoal ? '% da renda' : '% entradas'}</th>
            </tr>
          </thead>
          <tbody>
            {linhasDoRelatorio(dados.empresa).map((x) => (
              <Fragment key={'bloco' in x ? x.bloco : x.resultado}>
                {'bloco' in x ? linhaBloco(x.bloco, x.op) : resultado(x.rotulo, c[x.resultado], x.forte)}
              </Fragment>
            ))}
          </tbody>
        </table>
      </div>

      <p className="ajuda">O PDF traz este resumo com todas as categorias abertas e a lista de todas as movimentações do mês{comPrevistos ? ', incluindo os previstos' : ''}. Na janela que abrir, escolha "Salvar como PDF".</p>
      <FechamentoPDF dados={dados} mes={mes} comPrevistos={comPrevistos} />

      <div className="grade-painel">
        <section className="cartao">
          <h2>Conferência do caixa</h2>
          <dl className="pares coluna">
            <div><dt>Saldo no início do mês</dt><dd>{brl(saldoIni)}</dd></div>
            <div><dt>Variação do caixa (realizado)</dt><dd>{brl(c.variacao[0])}</dd></div>
            <div><dt>Saldo no fim do mês</dt><dd><strong>{brl(saldoFim)}</strong></dd></div>
          </dl>
          <p className="ajuda">Soma de todas as contas, com aplicações e sem cartões de crédito. Transferências entre contas não alteram esse total; compras no cartão contam no mês em que a fatura vence.</p>
        </section>
        {pessoal ? (
          <section className="cartao">
            <h2>Renda comprometida</h2>
            {rc.pct === null ? (
              <p className="ajuda">Lance a renda do mês (pode ser prevista) para ver quanto dela já está comprometido.</p>
            ) : (
              <>
                <BarraComprometida pct={rc.pct} faixa={rc.faixa!} />
                <p><strong>{rc.pct}%</strong> da renda de {brl(rc.renda)} vai para gastos essenciais ({brl(rc.essenciais)}), dívidas ({brl(rc.dividas)}){rc.parcelasCartao ? <> e parcelas no cartão ({brl(rc.parcelasCartao)})</> : null}, contando o que já foi pago e o que está previsto.</p>
                <p className="ajuda">Referência: até 50% é tranquilo, de 50% a 70% pede atenção, acima de 70% sobra pouco para o dia a dia e para investir.</p>
              </>
            )}
          </section>
        ) : (
        <section className="cartao">
          <h2>Ponto de equilíbrio</h2>
          {pe.fixas === 0 ? (
            <p className="ajuda">Sem despesas fixas lançadas neste mês.</p>
          ) : pe.dia ? (
            <p>As despesas fixas de <strong>{brl(pe.fixas)}</strong> ficaram cobertas em <strong>{dataBR(pe.dia)}</strong>. Daí em diante, a margem é sobra.</p>
          ) : (
            <p>As despesas fixas são de <strong>{brl(pe.fixas)}</strong>. A margem acumulada está em {brl(pe.margemAcumulada)}, faltam <strong>{brl(pe.falta)}</strong>.</p>
          )}
        </section>
        )}
      </div>
    </div>
  );
}
