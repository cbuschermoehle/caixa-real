import { useState } from 'react';
import type { Conta, Ramo, TipoConta, TipoPerfil } from '../types';
import { useDados } from '../data/store';
import { RAMOS, planoDoRamo } from '../data/planos';
import { dadosDeExemplo, dadosPessoaisDeExemplo } from '../data/exemplo';
import { hoje, novoId, parseValor } from '../lib/format';
import { Campo } from '../components/ui';
import { RestaurarCopia } from '../components/Copia';

interface ContaRascunho { id: string; nome: string; tipo: TipoConta; saldo: string; usar: boolean; fechamento?: string; vencimento?: string }

const CONTAS_SUGERIDAS: ContaRascunho[] = [
  { id: 'a', nome: 'Conta PJ', tipo: 'corrente', saldo: '', usar: true },
  { id: 'b', nome: 'Caixa (dinheiro)', tipo: 'caixa', saldo: '', usar: true },
  { id: 'c', nome: 'Maquininha', tipo: 'maquininha', saldo: '', usar: false },
  { id: 'd', nome: 'Aplicação', tipo: 'aplicacao', saldo: '', usar: false },
];

const CONTAS_PESSOAIS: ContaRascunho[] = [
  { id: 'a', nome: 'Conta corrente', tipo: 'corrente', saldo: '', usar: true },
  { id: 'b', nome: 'Carteira (dinheiro)', tipo: 'caixa', saldo: '', usar: true },
  { id: 'c', nome: 'Cartão de crédito', tipo: 'cartao', saldo: '', usar: true, fechamento: '', vencimento: '' },
  { id: 'd', nome: 'Poupança e investimentos', tipo: 'aplicacao', saldo: '', usar: false },
];

/** Lê um dia do mês digitado (1 a 31). */
const lerDia = (t?: string) => {
  const n = Number((t ?? '').trim());
  return Number.isInteger(n) && n >= 1 && n <= 31 ? n : null;
};

export const TIPOS_CONTA: { v: TipoConta; r: string }[] = [
  { v: 'corrente', r: 'Conta corrente' },
  { v: 'caixa', r: 'Dinheiro em caixa' },
  { v: 'maquininha', r: 'Maquininha' },
  { v: 'aplicacao', r: 'Aplicação / investimento' },
  { v: 'cartao', r: 'Cartão de crédito' },
];

export function Onboarding() {
  const { despachar, perfis } = useDados();
  const outros = perfis.filter((p) => p.empresa).length;
  const [tipoPerfil, setTipoPerfil] = useState<TipoPerfil | null>(null);
  const [passo, setPasso] = useState(1);
  const [nome, setNome] = useState('');
  const [ramo, setRamo] = useState<Ramo | null>(null);
  const [contas, setContas] = useState(CONTAS_SUGERIDAS);
  const [erro, setErro] = useState('');
  const pessoal = tipoPerfil === 'pessoal';

  const escolherTipo = (t: TipoPerfil) => {
    setTipoPerfil(t);
    setContas(t === 'pessoal' ? CONTAS_PESSOAIS : CONTAS_SUGERIDAS);
    setRamo(t === 'pessoal' ? 'pessoal' : null);
    setPasso(1);
    setErro('');
  };

  const verExemplo = () => {
    const ex = pessoal ? dadosPessoaisDeExemplo() : dadosDeExemplo();
    despachar({ t: 'iniciar', empresa: ex.empresa, contas: ex.contas, categorias: ex.categorias, lancamentos: ex.lancamentos });
  };

  function avancar() {
    if (!nome.trim()) return setErro(pessoal ? 'Dê um nome para este perfil.' : 'Digite o nome da empresa.');
    if (!ramo) return setErro('Escolha o ramo da empresa.');
    setErro('');
    setPasso(2);
  }

  function concluir() {
    const escolhidas = contas.filter((c) => c.usar && c.nome.trim());
    if (!escolhidas.length) return setErro('Marque pelo menos uma conta.');
    for (const c of escolhidas) {
      if (c.tipo === 'cartao') {
        if (!lerDia(c.fechamento) || !lerDia(c.vencimento)) return setErro(`Digite o dia em que a fatura de "${c.nome}" fecha e o dia em que vence (de 1 a 31).`);
      } else if (c.saldo.trim() && parseValor(c.saldo) === null) return setErro(`O saldo de "${c.nome}" não é um valor válido.`);
    }
    const data = hoje();
    const lista: Conta[] = escolhidas.map((c) => ({
      id: novoId(), nome: c.nome.trim(), tipo: c.tipo, saldoInicial: c.tipo === 'cartao' ? 0 : parseValor(c.saldo) ?? 0, dataSaldoInicial: data, arquivada: false,
    }));
    const pagadora = lista.find((c) => c.tipo === 'corrente');
    lista.forEach((c, i) => {
      if (c.tipo === 'cartao') c.cartao = { fechamento: lerDia(escolhidas[i].fechamento)!, vencimento: lerDia(escolhidas[i].vencimento)!, contaPagamentoId: pagadora?.id };
    });
    despachar({
      t: 'iniciar',
      empresa: { id: novoId(), nome: nome.trim(), ramo: ramo!, criadaEm: data, tipo: tipoPerfil ?? 'empresa' },
      contas: lista,
      categorias: planoDoRamo(ramo!),
    });
  }

  const mudar = (id: string, campo: Partial<ContaRascunho>) => setContas((cs) => cs.map((c) => (c.id === id ? { ...c, ...campo } : c)));
  const cancelar = outros > 0 && (
    <button type="button" className="btn btn-link" onClick={() => despachar({ t: 'cancelarNovoPerfil' })}>Cancelar e voltar</button>
  );

  return (
    <main className="onboarding">
      <div className="onb-marca">
        <span className="logo" aria-hidden="true">R$</span>
        <span>MicroCaixa Fácil</span>
      </div>
      {!tipoPerfil ? (
        <section className="onb-passo">
          <h1>{outros ? 'Criar outro perfil' : 'Para que você vai usar o MicroCaixa?'}</h1>
          <p className="lead">Cada perfil tem as próprias contas e lançamentos. Você troca entre eles tocando no nome, no alto da tela.</p>
          <div className="escolha-perfil">
            <button type="button" onClick={() => escolherTipo('empresa')}>
              <strong>Empresa</strong>
              <span>Caixa do negócio: vendas, custos, despesas fixas, margem e ponto de equilíbrio.</span>
            </button>
            <button type="button" onClick={() => escolherTipo('pessoal')}>
              <strong>Pessoal</strong>
              <span>Finanças da casa: renda, gastos, cartão de crédito, financiamentos e quanto sobra no mês.</span>
            </button>
          </div>
          {cancelar}
          {!outros && (
            <div className="onb-exemplo">
              <p>Já usa o MicroCaixa Fácil em outro lugar?</p>
              <RestaurarCopia rotulo="Abrir uma cópia de segurança" confirmar={false} />
            </div>
          )}
        </section>
      ) : passo === 1 && pessoal ? (
        <section className="onb-passo">
          <p className="sobrelinha">Passo 1 de 2 · Pessoal</p>
          <h1>Vamos montar as suas finanças</h1>
          <p className="lead">O app já traz categorias de casa (moradia, mercado, escola, financiamentos, investimentos). Você pode mudar tudo depois.</p>
          <Campo rotulo="Nome deste perfil" id="o-nome">
            <input id="o-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Finanças da família" />
          </Campo>
          {erro && <p className="erro">{erro}</p>}
          <div className="linha-botoes">
            <button type="button" className="btn" onClick={() => setTipoPerfil(null)}>Voltar</button>
            <button type="button" className="btn btn-primario btn-grande" onClick={avancar}>Continuar</button>
          </div>
          <div className="onb-exemplo">
            <p>Só quer ver como fica?</p>
            <button type="button" className="btn" onClick={verExemplo}>Abrir um exemplo pessoal</button>
          </div>
          {cancelar}
        </section>
      ) : passo === 1 ? (
        <section className="onb-passo">
          <p className="sobrelinha">Passo 1 de 2 · Empresa</p>
          <h1>Vamos montar o caixa da sua empresa</h1>
          <p className="lead">Escolha o ramo e o sistema já traz as categorias com os nomes do seu dia a dia. Você pode mudar tudo depois.</p>
          <Campo rotulo="Nome da empresa" id="o-nome">
            <input id="o-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: RV Máquinas" />
          </Campo>
          <fieldset className="ramos">
            <legend>Ramo de atuação</legend>
            {RAMOS.map((r) => (
              <label key={r.id} className={`ramo ${ramo === r.id ? 'ativo' : ''}`}>
                <input type="radio" name="ramo" value={r.id} checked={ramo === r.id} onChange={() => setRamo(r.id)} />
                <strong>{r.nome}</strong>
                <span>{r.exemplo}</span>
              </label>
            ))}
          </fieldset>
          {erro && <p className="erro">{erro}</p>}
          <div className="linha-botoes">
            <button type="button" className="btn" onClick={() => setTipoPerfil(null)}>Voltar</button>
            <button type="button" className="btn btn-primario btn-grande" onClick={avancar}>Continuar</button>
          </div>
          <div className="onb-exemplo">
            <p>Só quer conhecer o sistema?</p>
            <button type="button" className="btn" onClick={verExemplo}>Abrir uma empresa de exemplo</button>
          </div>
          {cancelar}
        </section>
      ) : (
        <section className="onb-passo">
          <p className="sobrelinha">Passo 2 de 2</p>
          <h1>{pessoal ? 'Onde fica o seu dinheiro?' : 'Onde fica o dinheiro da empresa?'}</h1>
          <p className="lead">Marque as contas que você usa e digite quanto tem em cada uma hoje. Esse é o ponto de partida do saldo.{contas.some((c) => c.usar && c.tipo === 'cartao') && ' No cartão de crédito, informe o dia em que a fatura fecha e o dia em que vence.'}</p>
          <div className="onb-contas">
            {contas.map((c) => (
              <div key={c.id} className={`onb-conta ${c.usar ? '' : 'desligada'}`}>
                <input type="checkbox" id={`oc-${c.id}`} checked={c.usar} onChange={(e) => mudar(c.id, { usar: e.target.checked })} aria-label={`Usar ${c.nome}`} />
                <input className="onb-conta-nome" id={`ocn-${c.id}`} value={c.nome} onChange={(e) => mudar(c.id, { nome: e.target.value })} aria-label="Nome da conta" />
                <select id={`oct-${c.id}`} value={c.tipo} onChange={(e) => mudar(c.id, { tipo: e.target.value as TipoConta })} aria-label="Tipo da conta">
                  {TIPOS_CONTA.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}
                </select>
                {c.tipo === 'cartao' ? (
                  <span className="onb-conta-cartao">
                    <label htmlFor={`ocf-${c.id}`}>Fecha dia</label>
                    <input id={`ocf-${c.id}`} inputMode="numeric" placeholder="1 a 31" value={c.fechamento ?? ''} onChange={(e) => mudar(c.id, { fechamento: e.target.value.replace(/\D/g, '') })} disabled={!c.usar} />
                    <label htmlFor={`ocv-${c.id}`}>vence dia</label>
                    <input id={`ocv-${c.id}`} inputMode="numeric" placeholder="1 a 31" value={c.vencimento ?? ''} onChange={(e) => mudar(c.id, { vencimento: e.target.value.replace(/\D/g, '') })} disabled={!c.usar} />
                  </span>
                ) : (
                  <input className="onb-conta-saldo" id={`ocs-${c.id}`} inputMode="decimal" placeholder="Saldo hoje (R$)" value={c.saldo} onChange={(e) => mudar(c.id, { saldo: e.target.value })} aria-label={`Saldo de ${c.nome} hoje`} disabled={!c.usar} />
                )}
              </div>
            ))}
          </div>
          <button type="button" className="btn btn-link" onClick={() => setContas((cs) => [...cs, { id: novoId(), nome: 'Outra conta', tipo: 'corrente', saldo: '', usar: true }])}>+ Adicionar outra conta</button>
          {erro && <p className="erro">{erro}</p>}
          <div className="linha-botoes">
            <button type="button" className="btn" onClick={() => setPasso(1)}>Voltar</button>
            <button type="button" className="btn btn-primario btn-grande" onClick={concluir}>Começar a usar</button>
          </div>
        </section>
      )}
    </main>
  );
}
