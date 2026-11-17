import { Fragment } from 'react';
import { createPortal } from 'react-dom';
import type { Bloco, Dados, Lancamento } from '../types';
import { blocosDe, ehPessoal, linhasDoRelatorio } from '../data/planos';
import { dataDeCaixa } from '../lib/cartao';
import { cascata, saldoConta, saldos, type LinhaCategoria } from '../lib/calc';
import { nomeCategoria, raiz, rotuloDocumento } from '../lib/categorias';
import { brl, dataBR, hoje, mesDe, nomeMes, somaDias, somaMesesMes } from '../lib/format';

/*
 * Relatório de fechamento do mês, só para impressão.
 * Fica escondido na tela; ao clicar em "Baixar PDF" o navegador abre a janela de impressão
 * e a pessoa escolhe "Salvar como PDF". Não precisa de biblioteca nem de internet.
 */

/** Abre a janela de impressão com um nome de arquivo sugerido (o título da página). */
export function imprimirFechamento(nomeArquivo: string) {
  const antes = document.title;
  document.title = nomeArquivo;
  const voltar = () => {
    document.title = antes;
    window.removeEventListener('afterprint', voltar);
  };
  window.addEventListener('afterprint', voltar);
  window.print();
}

export function FechamentoPDF({ dados, mes, comPrevistos }: { dados: Dados; mes: string; comPrevistos: boolean }) {
  const c = cascata(dados, mes);
  const blocos = blocosDe(dados.empresa);
  const nomeDo = (b: Bloco) => blocos.find((x) => x.id === b)!.nome;
  const cats = new Map(dados.categorias.map((x) => [x.id, x]));
  const contas = new Map(dados.contas.map((x) => [x.id, x]));
  const inicioMes = somaDias(`${mes}-01`, -1);
  const fimMes = somaDias(`${somaMesesMes(mes, 1)}-01`, -1);
  const saldoIni = saldos(dados, inicioMes).total;
  const saldoFim = saldos(dados, fimMes).total;
  const h = hoje();

  const doMes = dados.lancamentos
    .filter((l) => mesDe(dataDeCaixa(l, contas)) === mes && (comPrevistos || l.status === 'pago'))
    .sort((a, b) => a.data.localeCompare(b.data) || a.criadoEm.localeCompare(b.criadoEm));
  const porBloco = (b: Bloco) =>
    doMes.filter((l) => {
      if (l.tipo === 'transferencia' || !l.categoriaId) return false;
      const cat = cats.get(l.categoriaId);
      return !!cat && raiz(cat, cats).bloco === b;
    });
  const transferencias = doMes.filter((l) => l.tipo === 'transferencia');
  const semCategoria = doMes.filter((l) => l.tipo !== 'transferencia' && !cats.get(l.categoriaId ?? ''));

  const base = c.blocos.entradas.realizado + (comPrevistos ? c.blocos.entradas.previsto : 0);
  const pct = (v: number) => (base ? `${Math.round((v / base) * 100)}%` : '–');
  const cols = (real: number, prev: number) => {
    const total = real + (comPrevistos ? prev : 0);
    return (
      <>
        <td className="num">{brl(real)}</td>
        {comPrevistos && <td className="num">{prev ? brl(prev) : '–'}</td>}
        {comPrevistos && <td className="num">{brl(total)}</td>}
        <td className="num">{pct(total)}</td>
      </>
    );
  };
  const linhaCat = (l: LinhaCategoria, sub = false) => (
    <tr key={l.categoria.id + l.categoria.nome} className={sub ? 'p-sub' : 'p-cat'}>
      <th>{sub ? '↳ ' : ''}{l.categoria.nome}</th>
      {cols(l.realizado, l.previsto)}
    </tr>
  );
  const resultado = (rotulo: string, v: [number, number], forte = false) => (
    <tr className={forte ? 'p-res p-forte' : 'p-res'}>
      <th>{rotulo}</th>
      {cols(v[0], v[1])}
    </tr>
  );
  // Categoria sem valor no período escolhido não aparece no PDF.
  const temValor = (l: LinhaCategoria) => l.realizado !== 0 || (comPrevistos && l.previsto !== 0);
  const blocoResumo = (b: Bloco, op: string) => {
    const t = c.blocos[b];
    return (
      <Fragment key={b}>
        <tr className="p-bloco">
          <th>{op} {nomeDo(b)}</th>
          {cols(t.realizado, t.previsto)}
        </tr>
        {t.linhas.filter(temValor).map((l) => (
          <Fragment key={l.categoria.id}>
            {linhaCat(l)}
            {l.subs?.filter(temValor).map((x) => linhaCat(x, true))}
          </Fragment>
        ))}
      </Fragment>
    );
  };

  const valorComSinal = (l: Lancamento) => (l.tipo === 'saida' ? -l.valor : l.valor);
  const tabelaMov = (titulo: string, lista: Lancamento[], transf = false) => {
    if (!lista.length) return null;
    const total = lista.reduce((a, l) => a + (transf ? l.valor : valorComSinal(l)), 0);
    return (
      <section className="p-secao" key={titulo}>
        <h3>{titulo} <span>· {lista.length} {lista.length === 1 ? 'lançamento' : 'lançamentos'}</span></h3>
        <table className="p-tabela p-mov">
          <thead>
            <tr>
              <th>Data</th>
              <th>Descrição</th>
              <th>{transf ? 'De → Para' : 'Categoria'}</th>
              {!transf && <th>Conta</th>}
              <th>Situação</th>
              <th className="num">Valor</th>
            </tr>
          </thead>
          <tbody>
            {lista.map((l) => {
              const doc = rotuloDocumento(l);
              return (
                <tr key={l.id}>
                  <td className="p-data">{dataBR(l.data)}</td>
                  <td>
                    {l.descricao || (transf ? 'Transferência' : '—')}
                    {(doc || l.parcela) && <small>{[doc, l.parcela && `parcela ${l.parcela.n}/${l.parcela.total}`].filter(Boolean).join(' · ')}</small>}
                  </td>
                  <td>{transf ? `${contas.get(l.contaId)?.nome ?? '—'} → ${contas.get(l.contaDestinoId ?? '')?.nome ?? '—'}` : nomeCategoria(l.categoriaId, cats) || 'Sem categoria'}</td>
                  {!transf && <td>{contas.get(l.contaId)?.nome ?? '—'}</td>}
                  <td>{l.status === 'pago' ? (l.tipo === 'entrada' ? 'Recebido' : 'Pago') : l.data < h ? 'Atrasado' : 'Previsto'}</td>
                  <td className="num">{brl(transf ? l.valor : valorComSinal(l))}</td>
                </tr>
              );
            })}
          </tbody>
          {!transf && (
            <tfoot>
              <tr>
                <th colSpan={5}>Total</th>
                <td className="num">{brl(total)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      </section>
    );
  };

  const empresa = dados.empresa?.nome ?? '';
  const contasVisiveis = dados.contas.filter((x) => !x.arquivada || saldoConta(dados, x, fimMes) !== 0);

  return createPortal(
    <div className="impressao" aria-hidden="true">
      <header className="p-topo">
        <div>
          <p className="p-empresa">{empresa}</p>
          <h1>Fechamento de {nomeMes(mes)}</h1>
        </div>
        <p className="p-emissao">
          Emitido em {dataBR(h)}
          <br />
          {comPrevistos ? 'Inclui previstos (o que falta pagar e receber)' : 'Só o que já foi pago e recebido'}
        </p>
      </header>

      <section className="p-secao">
        <h2>Resumo do mês</h2>
        <table className="p-tabela p-resumo">
          <thead>
            <tr>
              <th />
              <th className="num">{comPrevistos ? 'Realizado' : 'Valor'}</th>
              {comPrevistos && <th className="num">Falta</th>}
              {comPrevistos && <th className="num">Esperado</th>}
              <th className="num">{ehPessoal(dados.empresa) ? '% da renda' : '% entradas'}</th>
            </tr>
          </thead>
          <tbody>
            {linhasDoRelatorio(dados.empresa).map((x) => ('bloco' in x ? blocoResumo(x.bloco, x.op) : <Fragment key={x.resultado}>{resultado(x.rotulo, c[x.resultado], x.forte)}</Fragment>))}
          </tbody>
        </table>
      </section>

      <section className="p-secao p-lado">
        <div>
          <h2>Conferência do caixa</h2>
          <table className="p-tabela">
            <tbody>
              <tr><th>Saldo no início do mês</th><td className="num">{brl(saldoIni)}</td></tr>
              <tr><th>Variação do caixa (realizado)</th><td className="num">{brl(c.variacao[0])}</td></tr>
              <tr className="p-forte"><th>Saldo no fim do mês</th><td className="num">{brl(saldoFim)}</td></tr>
            </tbody>
          </table>
        </div>
        <div>
          <h2>Saldo por conta em {dataBR(fimMes)}</h2>
          <table className="p-tabela">
            <tbody>
              {contasVisiveis.map((x) => (
                <tr key={x.id}><th>{x.nome}</th><td className="num">{brl(saldoConta(dados, x, fimMes))}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="p-quebra">
        <h2>Movimentações do mês</h2>
        {doMes.length === 0 && <p>Nenhum lançamento neste mês.</p>}
        {blocos.map((b) => tabelaMov(b.nome, porBloco(b.id)))}
        {tabelaMov('Sem categoria', semCategoria)}
        {tabelaMov('Transferências entre contas (não entram no resultado)', transferencias, true)}
      </section>
      <p className="p-rodape">MicroCaixa Fácil · regime de caixa · valores em reais</p>
    </div>,
    document.body,
  );
}
