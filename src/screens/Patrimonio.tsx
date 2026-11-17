import { useState } from 'react';
import type { Bem, Conta, TipoBem } from '../types';
import { useDados } from '../data/store';
import {
  TIPOS_BEM, TIPOS_INVESTIMENTO, carteira, dividendosPorMes, evolucaoPatrimonio, movimentoInvestimentos,
  nomeTipoInvestimento, patrimonioEm, ultimoValor, valorDaConta,
} from '../lib/patrimonio';
import { brl, dataBR, hoje, mesCurto, mesDe, novoId, parseValor, valorParaCampo } from '../lib/format';
import { LinhaSaldo } from '../components/graficos';
import { Campo, Confirmar, Folha, Icone, Segmentos } from '../components/ui';

const curto = (mes: string) => mesCurto(`${mes}-01`);
const eixoMes = (data: string) => mesCurto(data);

/** Perfil pessoal: investimentos (modo simples) e patrimônio (tenho − devo). Fica fora do dia a dia. */
export function Patrimonio({ ir }: { ir: (r: string) => void }) {
  const [aba, setAba] = useState<'patrimonio' | 'investimentos'>('patrimonio');
  return (
    <div className="tela">
      <header className="tela-topo">
        <h1>{aba === 'patrimonio' ? 'Patrimônio' : 'Investimentos'}</h1>
        <Segmentos rotulo="Ver" valor={aba} aoMudar={setAba} opcoes={[{ v: 'patrimonio', r: 'Patrimônio' }, { v: 'investimentos', r: 'Investimentos' }]} />
        <p className="lead">
          {aba === 'patrimonio'
            ? 'Quanto você vale: o que tem menos o que deve. Bens não mexem no saldo; é só uma foto, atualizada de vez em quando.'
            : 'Quanto vale cada tipo de investimento, quanto você aportou e os dividendos recebidos. Os valores você digita olhando o app da corretora.'}
        </p>
      </header>
      {aba === 'patrimonio' ? <VerPatrimonio verInvestimentos={() => setAba('investimentos')} ir={ir} /> : <VerInvestimentos />}
    </div>
  );
}

// ---------- Investimentos ----------

function VerInvestimentos() {
  const { dados } = useDados();
  const [avaliar, setAvaliar] = useState<Conta | null>(null);
  const [nova, setNova] = useState(false);
  const h = hoje();
  const ano = h.slice(0, 4);
  const mes = mesDe(h);
  const cart = carteira(dados, h);
  const noAno = movimentoInvestimentos(dados, `${ano}-01-01`, h);
  const noMes = movimentoInvestimentos(dados, `${mes}-01`, h);
  const evolucao = evolucaoPatrimonio(dados, h, 12).map((p) => ({ data: p.data, saldo: p.investimentos }));
  const temEvolucao = evolucao.length >= 2 && evolucao.some((p) => p.saldo !== evolucao[0].saldo);
  // Últimos 6 meses, sem os meses vazios do começo (antes de existir dividendo lançado).
  const todos = dividendosPorMes(dados, mes, 6);
  const primeiro = todos.findIndex((m) => m.valor > 0);
  const divMeses = primeiro < 0 ? todos.slice(-1) : todos.slice(primeiro);

  return (
    <>
      <dl className="futuro-resumo">
        <div>
          <dt>Valor atual</dt>
          <dd>{brl(cart.total)}</dd>
          <span className="ajuda">{cart.porConta.length} {cart.porConta.length === 1 ? 'corretora ou carteira' : 'corretoras e carteiras'}</span>
        </div>
        <div>
          <dt>Aportes em {ano}</dt>
          <dd>{brl(noAno.aportes)}</dd>
          <span className="ajuda">{noAno.resgates ? `Resgates: ${brl(noAno.resgates)}` : `Este mês: ${brl(noMes.aportes)}`}</span>
        </div>
        <div>
          <dt>Dividendos em {ano}</dt>
          <dd className="pct-faixa-ok">{brl(noAno.dividendos)}</dd>
          <span className="ajuda">Este mês: {brl(noMes.dividendos)} · fora da renda</span>
        </div>
        <div>
          <dt>Fora do Brasil</dt>
          <dd>{cart.pctExterior === null ? '–' : `${cart.pctExterior}%`}</dd>
          <span className="ajuda">da carteira (tipo Exterior)</span>
        </div>
      </dl>

      <section className="cartao" aria-labelledby="t-corretoras">
        <header className="cartao-topo">
          <h2 id="t-corretoras">Corretoras e carteiras</h2>
          <button type="button" className="btn-link" onClick={() => setNova(true)}><Icone nome="mais" tamanho={16} /> Nova</button>
        </header>
        {cart.porConta.length === 0 ? (
          <p className="vazio">Cadastre cada corretora ou carteira (ex.: XP, Binance, Avenue) e depois informe quanto vale cada tipo de investimento nela.</p>
        ) : (
          <ul className="compromissos">
            {cart.porConta.map((v) => (
              <li key={v.conta.id}>
                <span>
                  <strong>{v.conta.nome}</strong>
                  <span className="lanc-meta">
                    {v.atualizadoEm
                      ? `Atualizado em ${dataBR(v.atualizadoEm)} · ${[...v.porTipo].filter(([, x]) => x > 0).map(([t]) => nomeTipoInvestimento(t)).join(', ') || 'sem valores'}`
                      : 'Ainda sem valores por tipo: mostrando o saldo da conta'}
                  </span>
                </span>
                <span className="num">
                  {brl(v.total)}
                  <button type="button" className="btn-link" onClick={() => setAvaliar(v.conta)}>Atualizar valores</button>
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {cart.porTipo.length > 0 && (
        <section className="cartao" aria-labelledby="t-tipos">
          <header className="cartao-topo">
            <h2 id="t-tipos">Divisão por tipo</h2>
          </header>
          <ul className="limites">
            {cart.porTipo.map((x) => (
              <li key={x.tipo}>
                <div className="limite-topo">
                  <span>{nomeTipoInvestimento(x.tipo)}</span>
                  <span className="num">{brl(x.valor)} · {x.pct}%</span>
                </div>
                <div className="barra-progresso faixa-tipo" role="presentation">
                  <span style={{ width: `${Math.max(1, x.pct)}%` }} />
                </div>
              </li>
            ))}
          </ul>
          {cart.semTipo > 0 && <p className="ajuda">{brl(cart.semTipo)} ainda sem divisão por tipo. Toque em Atualizar valores na corretora para separar.</p>}
        </section>
      )}

      {temEvolucao && (
        <section className="cartao" aria-labelledby="t-evol-inv">
          <header className="cartao-topo">
            <h2 id="t-evol-inv">Evolução</h2>
          </header>
          <LinhaSaldo pontos={evolucao} nome="Investido" eixo={eixoMes} dica="Valor no fim de cada mês, pelos valores que você informou" />
        </section>
      )}

      <section className="cartao" aria-labelledby="t-div">
        <header className="cartao-topo">
          <h2 id="t-div">Dividendos e rendimentos</h2>
        </header>
        <ul className="faturas">
          {divMeses.map((m) => (
            <li key={m.mes}>
              <span>{curto(m.mes)}</span>
              <span className="num">{brl(m.valor)}</span>
            </li>
          ))}
        </ul>
        <p className="ajuda">
          Lance cada provento como <strong>Entrada</strong> na conta da corretora, categoria <strong>Dividendos e rendimentos</strong>. Ele fica reinvestido e
          não entra na sua renda nem na renda comprometida. Se um dia usar para pagar contas, é só transferir para a conta corrente.
        </p>
        <p className="ajuda">
          Aportes: transfira da conta corrente para a corretora (ou lance uma saída numa categoria de Investimentos). Os dois jeitos contam aqui.
        </p>
      </section>

      {avaliar && <FormAvaliar conta={avaliar} aoFechar={() => setAvaliar(null)} />}
      {nova && <FormCorretora aoFechar={() => setNova(false)} />}
    </>
  );
}

function FormAvaliar({ conta, aoFechar }: { conta: Conta; aoFechar: () => void }) {
  const { dados, despachar } = useDados();
  const atual = valorDaConta(dados, conta, '9999-12-31');
  const [data, setData] = useState(hoje());
  const [valores, setValores] = useState<Record<string, string>>(() =>
    Object.fromEntries(TIPOS_INVESTIMENTO.map((t) => [t.id, atual.porTipo.get(t.id) ? valorParaCampo(atual.porTipo.get(t.id)!) : ''])),
  );
  const [erro, setErro] = useState('');
  const total = TIPOS_INVESTIMENTO.reduce((a, t) => a + (parseValor(valores[t.id]) ?? 0), 0);

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!data) return setErro('Escolha a data.');
    const avaliacoes = [];
    for (const t of TIPOS_INVESTIMENTO) {
      const texto = valores[t.id].trim();
      const v = texto ? parseValor(texto) : 0;
      if (v === null || v < 0) return setErro(`Confira o valor de ${t.nome}.`);
      // Guarda o que tem valor e zera o que tinha e saiu (ex.: vendeu tudo de cripto).
      if (v > 0 || atual.porTipo.has(t.id)) avaliacoes.push({ id: novoId(), contaId: conta.id, tipo: t.id, data, valor: v });
    }
    if (!avaliacoes.length) return setErro('Informe o valor de pelo menos um tipo.');
    despachar({ t: 'avaliar', avaliacoes });
    aoFechar();
  }

  return (
    <Folha titulo={`Valores em ${conta.nome}`} aoFechar={aoFechar}>
      <form onSubmit={guardar} noValidate className="form">
        <p className="ajuda">Abra o app da corretora e copie quanto vale hoje cada tipo. Deixe em branco o que você não tem. Não mexe no saldo.</p>
        <Campo rotulo="Valores de quando" id="a-data">
          <input id="a-data" type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} />
        </Campo>
        <div className="grade-2">
          {TIPOS_INVESTIMENTO.map((t) => (
            <Campo key={t.id} rotulo={`${t.nome} (R$)`} id={`a-${t.id}`} ajuda={t.ajuda}>
              <input id={`a-${t.id}`} inputMode="decimal" autoComplete="off" placeholder="0,00" value={valores[t.id]} onChange={(e) => setValores({ ...valores, [t.id]: e.target.value })} />
            </Campo>
          ))}
        </div>
        <p className="total-form">Total: <strong>{brl(total)}</strong></p>
        {erro && <p className="erro">{erro}</p>}
        <div className="acoes-form">
          <button type="submit" className="btn btn-grande btn-primario">Guardar valores</button>
        </div>
      </form>
    </Folha>
  );
}

function FormCorretora({ aoFechar }: { aoFechar: () => void }) {
  const { despachar } = useDados();
  const [nome, setNome] = useState('');
  const [erro, setErro] = useState('');
  function guardar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return setErro('Dê um nome, por exemplo XP ou Binance.');
    despachar({ t: 'conta', conta: { id: novoId(), nome: nome.trim(), tipo: 'aplicacao', saldoInicial: 0, dataSaldoInicial: hoje(), arquivada: false } });
    aoFechar();
  }
  return (
    <Folha titulo="Nova corretora ou carteira" aoFechar={aoFechar}>
      <form onSubmit={guardar} noValidate className="form">
        <Campo rotulo="Nome" id="n-nome" erro={erro} ajuda="Vira uma conta do tipo aplicação. Mandar dinheiro para ela é uma transferência, não um gasto.">
          <input id="n-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: XP, Binance, Avenue" autoComplete="off" />
        </Campo>
        <div className="acoes-form">
          <button type="submit" className="btn btn-grande btn-primario">Criar</button>
        </div>
      </form>
    </Folha>
  );
}

// ---------- Patrimônio ----------

function VerPatrimonio({ verInvestimentos, ir }: { verInvestimentos: () => void; ir: (r: string) => void }) {
  const { dados } = useDados();
  const [editar, setEditar] = useState<Bem | 'novo' | null>(null);
  const h = hoje();
  const p = patrimonioEm(dados, h);
  const evolucao = evolucaoPatrimonio(dados, h, 12).map((x) => ({ data: x.data, saldo: x.liquido }));
  const temEvolucao = evolucao.length >= 2;

  return (
    <>
      <dl className="futuro-resumo">
        <div>
          <dt>Tenho</dt>
          <dd>{brl(p.tenho)}</dd>
          <span className="ajuda">contas, investimentos e bens</span>
        </div>
        <div>
          <dt>Devo</dt>
          <dd className={p.devo ? 'pct-faixa-alto' : ''}>{brl(p.devo)}</dd>
          <span className="ajuda">financiamentos e cartões</span>
        </div>
        <div>
          <dt>Patrimônio líquido</dt>
          <dd className={p.liquido < 0 ? 'neg' : 'pct-faixa-ok'}>{brl(p.liquido)}</dd>
          <span className="ajuda">tenho − devo</span>
        </div>
      </dl>

      {temEvolucao && (
        <section className="cartao" aria-labelledby="t-evol">
          <header className="cartao-topo">
            <h2 id="t-evol">Evolução</h2>
          </header>
          <LinhaSaldo pontos={evolucao} nome="Patrimônio líquido" eixo={eixoMes} dica="Fim de cada mês. Passe o dedo para ver" />
        </section>
      )}

      <section className="cartao" aria-labelledby="t-tenho">
        <header className="cartao-topo">
          <h2 id="t-tenho">O que você tem</h2>
          <button type="button" className="btn-link" onClick={() => setEditar('novo')}><Icone nome="mais" tamanho={16} /> Bem</button>
        </header>
        <ul className="compromissos">
          <li>
            <span><strong>Dinheiro nas contas</strong><span className="lanc-meta">Saldo de hoje, sem cartões e investimentos</span></span>
            <span className="num">{brl(p.contas)}</span>
          </li>
          <li>
            <span>
              <strong>Investimentos</strong>
              <button type="button" className="btn-link" onClick={verInvestimentos}>Ver e atualizar <Icone nome="seta" tamanho={14} /></button>
            </span>
            <span className="num">{brl(p.investimentos)}</span>
          </li>
          {p.bens.map(({ bem, valor }) => (
            <li key={bem.id}>
              <span>
                <strong>{bem.nome}</strong>
                <span className="lanc-meta">{TIPOS_BEM.find((t) => t.id === bem.tipo)?.nome} · valor de {dataBR(ultimoValor(bem).data)}</span>
              </span>
              <span className="num">
                {brl(valor)}
                <button type="button" className="btn-link" onClick={() => setEditar(bem)}><Icone nome="lapis" tamanho={14} /> Atualizar</button>
              </span>
            </li>
          ))}
        </ul>
        {p.bens.length === 0 && <p className="ajuda">Cadastre a casa, o carro e outros bens com o valor de hoje (tabela FIPE, avaliação). Atualizar uma ou duas vezes por ano basta.</p>}
      </section>

      <section className="cartao" aria-labelledby="t-devo">
        <header className="cartao-topo">
          <h2 id="t-devo">O que você deve</h2>
          <button type="button" className="btn-link" onClick={() => ir('futuro')}>Futuro <Icone nome="seta" tamanho={16} /></button>
        </header>
        {p.dividas.length === 0 ? (
          <p className="ajuda">Nada em aberto. Financiamentos e empréstimos lançados com parcelas e compras no cartão ainda não pagas aparecem aqui sozinhos.</p>
        ) : (
          <ul className="compromissos">
            {p.dividas.map((d) => (
              <li key={d.id}>
                <span>
                  <strong>{d.nome}</strong>
                  <span className="lanc-meta">
                    {d.cartao ? 'Cartão: faturas e parcelas ainda não pagas' : `${d.parcelas} ${d.parcelas === 1 ? 'parcela' : 'parcelas'} até ${curto(d.ultimoMes!)}`}
                  </span>
                </span>
                <span className="num neg">{brl(d.valor)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="ajuda">Soma das parcelas que faltam, sem descontar juros futuros. Para quitar antes, o banco costuma cobrar menos.</p>
      </section>

      {editar && <FormBem bem={editar === 'novo' ? undefined : editar} aoFechar={() => setEditar(null)} />}
    </>
  );
}

function FormBem({ bem, aoFechar }: { bem?: Bem; aoFechar: () => void }) {
  const { despachar } = useDados();
  const ultimo = bem ? ultimoValor(bem) : undefined;
  const [nome, setNome] = useState(bem?.nome ?? '');
  const [tipo, setTipo] = useState<TipoBem>(bem?.tipo ?? 'imovel');
  const [valor, setValor] = useState(ultimo ? valorParaCampo(ultimo.valor) : '');
  const [data, setData] = useState(hoje());
  const [erro, setErro] = useState('');
  const [apagar, setApagar] = useState(false);
  const info = TIPOS_BEM.find((t) => t.id === tipo)!;

  function guardar(e: React.FormEvent) {
    e.preventDefault();
    const v = parseValor(valor);
    if (!nome.trim()) return setErro('Dê um nome, por exemplo Apartamento ou Carro.');
    if (v === null || v <= 0) return setErro('Digite o valor, por exemplo 85.000,00.');
    if (!data) return setErro('Escolha a data.');
    const valores = [...(bem?.valores ?? []).filter((x) => x.data !== data), { data, valor: v }].sort((a, b) => a.data.localeCompare(b.data));
    despachar({ t: 'bem', bem: { id: bem?.id ?? novoId(), nome: nome.trim(), tipo, valores } });
    aoFechar();
  }

  return (
    <Folha titulo={bem ? `Atualizar ${bem.nome}` : 'Novo bem'} aoFechar={aoFechar}>
      <form onSubmit={guardar} noValidate className="form">
        <Segmentos rotulo="Tipo de bem" valor={tipo} aoMudar={setTipo} opcoes={TIPOS_BEM.map((t) => ({ v: t.id, r: t.nome }))} />
        <Campo rotulo="Nome" id="b-nome">
          <input id="b-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder={tipo === 'veiculo' ? 'Ex.: Carro' : tipo === 'imovel' ? 'Ex.: Apartamento' : 'Ex.: Equipamento'} autoComplete="off" />
        </Campo>
        <div className="grade-2">
          <Campo rotulo="Quanto vale (R$)" id="b-valor" ajuda={info.ajuda}>
            <input id="b-valor" className="input-valor" inputMode="decimal" autoComplete="off" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
          </Campo>
          <Campo rotulo="Valor de quando" id="b-data" ajuda={bem && bem.valores.length > 1 ? `${bem.valores.length} valores guardados (histórico)` : undefined}>
            <input id="b-data" type="date" value={data} max={hoje()} onChange={(e) => setData(e.target.value)} />
          </Campo>
        </div>
        <p className="ajuda">Cadastrar ou atualizar um bem não mexe no saldo. Se comprou ou vendeu, lance o dinheiro normalmente (categoria Compra de bens ou Venda de bens usados).</p>
        {erro && <p className="erro">{erro}</p>}
        <div className="acoes-form">
          <button type="submit" className="btn btn-grande btn-primario">Guardar</button>
        </div>
        {bem && !apagar && <button type="button" className="btn-link texto-perigo" onClick={() => setApagar(true)}>Tirar este bem do patrimônio</button>}
        {bem && apagar && (
          <Confirmar
            perigo
            texto={`Tirar "${bem.nome}" do patrimônio? O histórico de valores dele também sai.`}
            rotuloOk="Tirar"
            aoCancelar={() => setApagar(false)}
            aoConfirmar={() => { despachar({ t: 'excluirBem', id: bem.id }); aoFechar(); }}
          />
        )}
      </form>
    </Folha>
  );
}
