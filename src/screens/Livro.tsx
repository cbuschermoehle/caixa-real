import { useMemo, useState } from 'react';
import type { Lancamento } from '../types';
import { useDados } from '../data/store';
import { BLOCOS } from '../data/planos';
import { brl, dataAmigavel, hoje, mesDe, nomeMes, somaMesesMes } from '../lib/format';
import { Icone, Valor } from '../components/ui';

export function Livro({ editar, ir }: { editar: (l: Lancamento) => void; ir: (r: string) => void }) {
  const { dados } = useDados();
  const h = hoje();
  const [mes, setMes] = useState(mesDe(h));
  const [conta, setConta] = useState('');
  const [categoria, setCategoria] = useState('');
  const [status, setStatus] = useState<'' | 'pago' | 'previsto'>('');
  const [busca, setBusca] = useState('');

  const pendentesExtrato = (dados.extrato ?? []).filter((t) => t.situacao === 'pendente').length;
  const cats = useMemo(() => new Map(dados.categorias.map((c) => [c.id, c])), [dados.categorias]);
  const contas = useMemo(() => new Map(dados.contas.map((c) => [c.id, c])), [dados.contas]);

  const lista = dados.lancamentos
    .filter((l) => mesDe(l.data) === mes)
    .filter((l) => !conta || l.contaId === conta || l.contaDestinoId === conta)
    .filter((l) => !categoria || (categoria.startsWith('bloco:') ? cats.get(l.categoriaId ?? '')?.bloco === categoria.slice(6) : l.categoriaId === categoria))
    .filter((l) => !status || l.status === status)
    .filter((l) => {
      if (!busca.trim()) return true;
      const q = busca.toLowerCase();
      return (l.descricao ?? '').toLowerCase().includes(q) || (cats.get(l.categoriaId ?? '')?.nome ?? '').toLowerCase().includes(q);
    })
    .sort((a, b) => b.data.localeCompare(a.data) || b.criadoEm.localeCompare(a.criadoEm));

  let entrou = 0;
  let saiu = 0;
  lista.forEach((l) => {
    if (l.status !== 'pago') return;
    if (l.tipo === 'entrada') entrou += l.valor;
    if (l.tipo === 'saida') saiu += l.valor;
  });

  const grupos = new Map<string, Lancamento[]>();
  lista.forEach((l) => grupos.set(l.data, [...(grupos.get(l.data) ?? []), l]));
  const titulo = (l: Lancamento) =>
    l.tipo === 'transferencia'
      ? `${contas.get(l.contaId)?.nome ?? '—'} → ${contas.get(l.contaDestinoId ?? '')?.nome ?? '—'}`
      : cats.get(l.categoriaId ?? '')?.nome ?? 'Sem categoria';
  const filtrando = conta || categoria || status || busca;

  return (
    <div className="tela">
      <header className="tela-topo">
        <h1>Lançamentos</h1>
        <button type="button" className="btn" onClick={() => ir('extrato')}>
          <Icone nome="importar" tamanho={18} /> Extrato bancário{pendentesExtrato ? ` (${pendentesExtrato})` : ''}
        </button>
        <div className="seletor-mes">
          <button type="button" className="btn-icone" onClick={() => setMes(somaMesesMes(mes, -1))} aria-label="Mês anterior"><Icone nome="voltar" /></button>
          <strong>{nomeMes(mes)}</strong>
          <button type="button" className="btn-icone" onClick={() => setMes(somaMesesMes(mes, 1))} aria-label="Próximo mês"><Icone nome="seta" /></button>
        </div>
      </header>

      <div className="filtros">
        <label className="busca">
          <Icone nome="busca" tamanho={18} />
          <input id="l-busca" type="search" placeholder="Buscar descrição ou categoria" value={busca} onChange={(e) => setBusca(e.target.value)} aria-label="Buscar" />
        </label>
        <select id="l-conta" value={conta} onChange={(e) => setConta(e.target.value)} aria-label="Filtrar por conta">
          <option value="">Todas as contas</option>
          {dados.contas.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
        </select>
        <select id="l-cat" value={categoria} onChange={(e) => setCategoria(e.target.value)} aria-label="Filtrar por categoria">
          <option value="">Todas as categorias</option>
          {BLOCOS.map((b) => (
            <optgroup key={b.id} label={b.nome}>
              <option value={`bloco:${b.id}`}>Todo o bloco {b.nome}</option>
              {dados.categorias.filter((c) => c.bloco === b.id).sort((a, z) => a.ordem - z.ordem).map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
            </optgroup>
          ))}
        </select>
        <select id="l-status" value={status} onChange={(e) => setStatus(e.target.value as typeof status)} aria-label="Filtrar por situação">
          <option value="">Pagos e previstos</option>
          <option value="pago">Só pagos</option>
          <option value="previsto">Só previstos</option>
        </select>
        {filtrando && <button type="button" className="btn btn-link" onClick={() => { setConta(''); setCategoria(''); setStatus(''); setBusca(''); }}>Limpar filtros</button>}
      </div>

      <dl className="totais-3">
        <div><dt>Entrou</dt><dd className="pos">{brl(entrou)}</dd></div>
        <div><dt>Saiu</dt><dd className="neg">{brl(saiu)}</dd></div>
        <div><dt>Resultado</dt><dd className={entrou - saiu < 0 ? 'neg' : ''}>{brl(entrou - saiu)}</dd></div>
      </dl>
      <p className="ajuda">Totais só com o que já foi pago ou recebido{filtrando ? ', dentro dos filtros' : ''}. Transferências não entram.</p>

      {lista.length === 0 ? (
        <p className="vazio">Nenhum lançamento {filtrando ? 'com esses filtros' : 'neste mês'}.</p>
      ) : (
        [...grupos.entries()].map(([data, itens]) => (
          <section key={data} className="grupo-dia">
            <h3>{dataAmigavel(data, h)}</h3>
            <ul className="lista-lanc">
              {itens.map((l) => (
                <li key={l.id}>
                  <button type="button" className="lanc-info" onClick={() => editar(l)}>
                    <span className="lanc-titulo">{l.descricao || titulo(l)}</span>
                    <span className="lanc-meta">
                      {l.descricao ? `${titulo(l)} · ` : ''}
                      {l.tipo !== 'transferencia' && (contas.get(l.contaId)?.nome ?? '—')}
                      {l.parcela && ` · ${l.parcela.n}/${l.parcela.total}`}
                    </span>
                  </button>
                  {l.status === 'previsto' && <span className={`selo ${data < h ? 'selo-atraso' : 'selo-previsto'}`}>{data < h ? 'Atrasado' : 'Previsto'}</span>}
                  {l.tipo === 'transferencia' ? (
                    <span className="valor neutro lanc-valor">{brl(l.valor)}</span>
                  ) : (
                    <Valor v={l.tipo === 'entrada' ? l.valor : -l.valor} sinal classe={`lanc-valor ${l.status === 'previsto' ? 'apagado' : ''}`} />
                  )}
                </li>
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  );
}
