import { useState } from 'react';
import type { Conta, Ramo, TipoConta } from '../types';
import { useDados } from '../data/store';
import { RAMOS, planoDoRamo } from '../data/planos';
import { dadosDeExemplo } from '../data/exemplo';
import { hoje, novoId, parseValor } from '../lib/format';
import { Campo } from '../components/ui';
import { RestaurarCopia } from '../components/Copia';

interface ContaRascunho { id: string; nome: string; tipo: TipoConta; saldo: string; usar: boolean }

const CONTAS_SUGERIDAS: ContaRascunho[] = [
  { id: 'a', nome: 'Conta PJ', tipo: 'corrente', saldo: '', usar: true },
  { id: 'b', nome: 'Caixa (dinheiro)', tipo: 'caixa', saldo: '', usar: true },
  { id: 'c', nome: 'Maquininha', tipo: 'maquininha', saldo: '', usar: false },
  { id: 'd', nome: 'Aplicação', tipo: 'aplicacao', saldo: '', usar: false },
];

export const TIPOS_CONTA: { v: TipoConta; r: string }[] = [
  { v: 'corrente', r: 'Conta corrente' },
  { v: 'caixa', r: 'Dinheiro em caixa' },
  { v: 'maquininha', r: 'Maquininha' },
  { v: 'aplicacao', r: 'Aplicação / investimento' },
];

export function Onboarding() {
  const { despachar } = useDados();
  const [passo, setPasso] = useState(1);
  const [nome, setNome] = useState('');
  const [ramo, setRamo] = useState<Ramo | null>(null);
  const [contas, setContas] = useState(CONTAS_SUGERIDAS);
  const [erro, setErro] = useState('');

  const verExemplo = () => {
    const ex = dadosDeExemplo();
    despachar({ t: 'iniciar', empresa: ex.empresa, contas: ex.contas, categorias: ex.categorias, lancamentos: ex.lancamentos });
  };

  function avancar() {
    if (!nome.trim()) return setErro('Digite o nome da empresa.');
    if (!ramo) return setErro('Escolha o ramo da empresa.');
    setErro('');
    setPasso(2);
  }

  function concluir() {
    const escolhidas = contas.filter((c) => c.usar && c.nome.trim());
    if (!escolhidas.length) return setErro('Marque pelo menos uma conta.');
    for (const c of escolhidas) {
      if (c.saldo.trim() && parseValor(c.saldo) === null) return setErro(`O saldo de "${c.nome}" não é um valor válido.`);
    }
    const data = hoje();
    const lista: Conta[] = escolhidas.map((c) => ({
      id: novoId(), nome: c.nome.trim(), tipo: c.tipo, saldoInicial: parseValor(c.saldo) ?? 0, dataSaldoInicial: data, arquivada: false,
    }));
    despachar({
      t: 'iniciar',
      empresa: { id: novoId(), nome: nome.trim(), ramo: ramo!, criadaEm: data },
      contas: lista,
      categorias: planoDoRamo(ramo!),
    });
  }

  const mudar = (id: string, campo: Partial<ContaRascunho>) => setContas((cs) => cs.map((c) => (c.id === id ? { ...c, ...campo } : c)));

  return (
    <main className="onboarding">
      <div className="onb-marca">
        <span className="logo" aria-hidden="true">R$</span>
        <span>MicroCaixa Fácil</span>
      </div>
      {passo === 1 ? (
        <section className="onb-passo">
          <p className="sobrelinha">Passo 1 de 2</p>
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
          <button type="button" className="btn btn-primario btn-grande" onClick={avancar}>Continuar</button>
          <div className="onb-exemplo">
            <p>Só quer conhecer o sistema?</p>
            <button type="button" className="btn" onClick={verExemplo}>Abrir uma empresa de exemplo</button>
          </div>
          <div className="onb-exemplo">
            <p>Já usa o MicroCaixa Fácil em outro lugar?</p>
            <RestaurarCopia rotulo="Abrir uma cópia de segurança" confirmar={false} />
          </div>
        </section>
      ) : (
        <section className="onb-passo">
          <p className="sobrelinha">Passo 2 de 2</p>
          <h1>Onde fica o dinheiro da empresa?</h1>
          <p className="lead">Marque as contas que você usa e digite quanto tem em cada uma hoje. Esse é o ponto de partida do saldo.</p>
          <div className="onb-contas">
            {contas.map((c) => (
              <div key={c.id} className={`onb-conta ${c.usar ? '' : 'desligada'}`}>
                <input type="checkbox" id={`oc-${c.id}`} checked={c.usar} onChange={(e) => mudar(c.id, { usar: e.target.checked })} aria-label={`Usar ${c.nome}`} />
                <input className="onb-conta-nome" id={`ocn-${c.id}`} value={c.nome} onChange={(e) => mudar(c.id, { nome: e.target.value })} aria-label="Nome da conta" />
                <select id={`oct-${c.id}`} value={c.tipo} onChange={(e) => mudar(c.id, { tipo: e.target.value as TipoConta })} aria-label="Tipo da conta">
                  {TIPOS_CONTA.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}
                </select>
                <input className="onb-conta-saldo" id={`ocs-${c.id}`} inputMode="decimal" placeholder="Saldo hoje (R$)" value={c.saldo} onChange={(e) => mudar(c.id, { saldo: e.target.value })} aria-label={`Saldo de ${c.nome} hoje`} disabled={!c.usar} />
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
