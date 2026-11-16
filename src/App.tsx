import { useCallback, useEffect, useState } from 'react';
import type { Lancamento, TipoLancamento } from './types';
import { useDados } from './data/store';
import { FormBaixa, FormLancamento } from './components/FormLancamento';
import { Icone } from './components/ui';
import { Onboarding } from './screens/Onboarding';
import { Painel } from './screens/Painel';
import { Agenda } from './screens/Agenda';
import { Livro } from './screens/Livro';
import { Relatorio } from './screens/Relatorio';
import { Ajustes } from './screens/Ajustes';
import { Extrato } from './screens/Extrato';

const ROTAS = [
  { id: 'painel', nome: 'Painel', icone: 'painel' },
  { id: 'lancamentos', nome: 'Lançamentos', icone: 'lista' },
  { id: 'agenda', nome: 'A pagar e receber', curto: 'Agenda', icone: 'agenda' },
  { id: 'extrato', nome: 'Extrato', icone: 'banco' },
  { id: 'relatorio', nome: 'Relatório', icone: 'relatorio' },
  { id: 'opcoes', nome: 'Ajustes', icone: 'ajustes' },
] as const;
type Rota = (typeof ROTAS)[number]['id'];

const rotaDoHash = (): Rota => {
  const h = location.hash.slice(1);
  return (ROTAS.find((r) => r.id === h)?.id ?? 'painel') as Rota;
};

export function App() {
  const { dados } = useDados();
  const [rota, setRota] = useState<Rota>(rotaDoHash);
  const [form, setForm] = useState<{ tipo: TipoLancamento; editar?: Lancamento } | null>(null);
  const [baixa, setBaixa] = useState<Lancamento | null>(null);

  useEffect(() => {
    const f = () => setRota(rotaDoHash());
    window.addEventListener('hashchange', f);
    return () => window.removeEventListener('hashchange', f);
  }, []);

  useEffect(() => {
    window.scrollTo({ top: 0 });
  }, [dados.empresa?.id]);

  const ir = useCallback((r: string) => {
    location.hash = r;
    setRota(r as Rota);
    window.scrollTo({ top: 0 });
  }, []);
  const fecharForm = useCallback(() => setForm(null), []);
  const fecharBaixa = useCallback(() => setBaixa(null), []);
  const novo = (tipo: TipoLancamento) => setForm({ tipo });
  const editar = (l: Lancamento) => setForm({ tipo: l.tipo, editar: l });

  if (!dados.empresa) return <Onboarding />;

  return (
    <div className="app">
      <header className="barra-topo">
        <div className="barra-topo-in">
          <div className="marca">
            <span className="logo" aria-hidden="true">R$</span>
            <span className="marca-nome">{dados.empresa.nome}</span>
            {dados.empresa.exemplo && <span className="selo selo-exemplo">Exemplo</span>}
          </div>
          <nav className="nav-larga" aria-label="Seções">
            {ROTAS.map((r) => (
              <a key={r.id} href={`#${r.id}`} aria-current={rota === r.id ? 'page' : undefined} onClick={(e) => { e.preventDefault(); ir(r.id); }}>{r.nome}</a>
            ))}
          </nav>
          <button type="button" className="btn btn-primario so-largo" onClick={() => novo('entrada')}><Icone nome="mais" tamanho={18} /> Lançar</button>
        </div>
      </header>

      <main className="conteudo">
        {rota === 'painel' && <Painel novo={novo} ir={ir} />}
        {rota === 'lancamentos' && <Livro editar={editar} ir={ir} />}
        {rota === 'agenda' && <Agenda baixa={setBaixa} editar={editar} />}
        {rota === 'relatorio' && <Relatorio />}
        {rota === 'opcoes' && <Ajustes />}
        {rota === 'extrato' && <Extrato />}
      </main>

      {rota !== 'painel' && rota !== 'opcoes' && rota !== 'extrato' && (
        <button type="button" className="fab so-estreito" onClick={() => novo('saida')} aria-label="Novo lançamento"><Icone nome="mais" tamanho={26} /></button>
      )}

      <nav className="nav-baixo" aria-label="Seções">
        {ROTAS.filter((r) => r.id !== 'extrato').map((r) => (
          <a key={r.id} href={`#${r.id}`} aria-current={rota === r.id || (rota === 'extrato' && r.id === 'lancamentos') ? 'page' : undefined} onClick={(e) => { e.preventDefault(); ir(r.id); }}>
            <Icone nome={r.icone} tamanho={22} />
            <span>{'curto' in r ? r.curto : r.nome}</span>
          </a>
        ))}
      </nav>

      {form && <FormLancamento key={form.editar?.id ?? form.tipo} tipoInicial={form.tipo} editar={form.editar} aoFechar={fecharForm} />}
      {baixa && <FormBaixa lancamento={baixa} aoFechar={fecharBaixa} />}
    </div>
  );
}
