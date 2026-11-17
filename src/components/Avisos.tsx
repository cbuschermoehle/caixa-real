import { useState } from 'react';
import { useDados } from '../data/store';
import { entradaDoRepasse, renovacoesChegando, repassesPendentes, type Renovacao } from '../lib/avisos';
import { brl, dataBR, hoje } from '../lib/format';
import { Icone } from './ui';
import type { InicialForm } from './FormLancamento';

const MAX = 5;

/** Painel do pessoal: o que veio da empresa e as renovações anuais chegando. */
export function AvisosPessoal({ lancar }: { lancar: (inicial: InicialForm) => void }) {
  return (
    <>
      <RepassesEmpresa />
      <Renovacoes lancar={lancar} />
    </>
  );
}

function RepassesEmpresa() {
  const { dados, perfis, despachar } = useDados();
  const [todos, setTodos] = useState(false);
  const lista = repassesPendentes(dados, perfis, hoje());
  if (!lista.length) return null;
  const trazer = (rs: typeof lista) => {
    const novos = rs.map((r) => entradaDoRepasse(dados, r)).filter((l) => !!l);
    for (const l of novos) despachar({ t: 'lancamento', lancamento: l });
  };
  const visiveis = todos ? lista : lista.slice(0, MAX);
  return (
    <section className="cartao aviso-cartao" aria-labelledby="t-repasses">
      <header className="cartao-topo">
        <h2 id="t-repasses"><Icone nome="predio" tamanho={18} /> Vindo da empresa</h2>
        {lista.length > 1 && <button type="button" className="btn-link" onClick={() => trazer(lista)}>Trazer todos</button>}
      </header>
      <p className="ajuda">Distribuição de lucros e pró-labore lançados no perfil da empresa. Traga para cá com um toque: vira uma entrada na sua renda, no mesmo valor e data.</p>
      <ul className="compromissos">
        {visiveis.map((r) => (
          <li key={r.origem.id}>
            <span>
              <strong>{r.origem.descricao || (r.tipo === 'prolabore' ? 'Pró-labore' : 'Distribuição de lucros')}</strong>
              <span className="lanc-meta">
                {r.empresa} · {dataBR(r.origem.data)} · {r.origem.status === 'pago' ? 'já pago pela empresa' : 'previsto'}
                {r.mudou && r.vinculado && ` · mudou na empresa (aqui está ${brl(r.vinculado.valor)} em ${dataBR(r.vinculado.data)}${r.vinculado.status === 'previsto' && r.origem.status === 'pago' ? ', previsto' : ''})`}
              </span>
            </span>
            <span className="num">
              {brl(r.origem.valor)}
              <span className="botoes-aviso">
                <button type="button" className="btn btn-primario btn-pequeno" onClick={() => trazer([r])}>{r.mudou ? 'Atualizar' : 'Trazer'}</button>
                {!r.mudou && <button type="button" className="btn-link" onClick={() => despachar({ t: 'ignorarRepasse', id: r.origem.id })}>Ignorar</button>}
              </span>
            </span>
          </li>
        ))}
      </ul>
      {lista.length > MAX && !todos && <button type="button" className="btn-link" onClick={() => setTodos(true)}>Ver todos ({lista.length})</button>}
    </section>
  );
}

function Renovacoes({ lancar }: { lancar: (inicial: InicialForm) => void }) {
  const { dados, despachar } = useDados();
  const lista = renovacoesChegando(dados, hoje());
  if (!lista.length) return null;
  const quando = (r: Renovacao) => (r.dias > 1 ? `em ${r.dias} dias` : r.dias === 1 ? 'amanhã' : r.dias === 0 ? 'hoje' : `há ${-r.dias} ${r.dias === -1 ? 'dia' : 'dias'}`);
  return (
    <section className="cartao aviso-cartao" aria-labelledby="t-renov">
      <header className="cartao-topo">
        <h2 id="t-renov"><Icone nome="sino" tamanho={18} /> Renovação chegando</h2>
      </header>
      <ul className="compromissos">
        {lista.map((r) => (
          <li key={r.chave}>
            <span>
              <strong>{r.categoria.nome}</strong>
              <span className="lanc-meta">
                Faz um ano {quando(r)} ({dataBR(r.proxima)}). Da última vez: {brl(r.valor)}{r.parcelas > 1 ? ` em ${r.parcelas}x` : ''}, em {dataBR(r.ultima)}.
              </span>
            </span>
            <span className="num">
              <span className="botoes-aviso">
                <button
                  type="button"
                  className="btn btn-primario btn-pequeno"
                  onClick={() => lancar({ data: r.proxima < hoje() ? hoje() : r.proxima, categoriaId: r.categoria.id, descricao: r.categoria.nome, valor: Math.round(r.valor / r.parcelas), repeticao: r.parcelas > 1 ? 'parcelado' : undefined, vezes: r.parcelas > 1 ? r.parcelas : undefined })}
                >
                  Lançar
                </button>
                <button type="button" className="btn-link" onClick={() => despachar({ t: 'lembreteVisto', chave: r.chave })}>Já resolvi</button>
              </span>
            </span>
          </li>
        ))}
      </ul>
      <p className="ajuda">Seguros, IPVA e IPTU costumam vencer uma vez por ano. Ao lançar a renovação (ou tocar em Já resolvi), o aviso some até o ano que vem.</p>
    </section>
  );
}
