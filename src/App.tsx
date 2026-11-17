import { useCallback, useEffect, useState } from 'react';
import type { Lancamento, Pendente, TipoLancamento } from './types';
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
import { Futuro } from './screens/Futuro';
import { Patrimonio } from './screens/Patrimonio';
import { FormRapido, ListaPendentes } from './components/Rapido';
import { ehPessoal } from './data/planos';
import { TrocaPerfil } from './components/Perfis';

const ROTAS = [
  { id: 'painel', nome: 'Painel', icone: 'painel' },
  { id: 'lancamentos', nome: 'Lançamentos', icone: 'lista' },
  { id: 'agenda', nome: 'A pagar e receber', curto: 'Agenda', icone: 'agenda' },
  { id: 'futuro', nome: 'Futuro', icone: 'futuro' },
  { id: 'patrimonio', nome: 'Patrimônio', icone: 'patrimonio' },
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
  const { dados, despachar } = useDados();
  const [rota, setRota] = useState<Rota>(rotaDoHash);
  const [form, setForm] = useState<{ tipo: TipoLancamento; editar?: Lancamento; pendente?: Pendente } | null>(null);
  const [rapido, setRapido] = useState(false);
  const [verPendentes, setVerPendentes] = useState(false);
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
  // Futuro e Patrimônio são do perfil pessoal; na empresa, o longo prazo fica em "A pagar e receber".
  const soPessoal = (id: string) => id === 'futuro' || id === 'patrimonio';
  const rotas = ROTAS.filter((r) => !soPessoal(r.id) || ehPessoal(dados.empresa));
  const rotaAtual: Rota = soPessoal(rota) && !ehPessoal(dados.empresa) ? 'painel' : rota;

  return (
    <div className="app">
      <header className="barra-topo">
        <div className="barra-topo-in">
          <TrocaPerfil aoTrocar={() => ir('painel')} />
          <nav className="nav-larga" aria-label="Seções">
            {/* No pessoal a barra fica cheia: o Extrato abre pelos Lançamentos, como no celular. */}
            {rotas.filter((r) => r.id !== 'extrato' || !ehPessoal(dados.empresa)).map((r) => (
              <a key={r.id} href={`#${r.id}`} aria-current={rotaAtual === r.id || (rotaAtual === 'extrato' && r.id === 'lancamentos' && ehPessoal(dados.empresa)) ? 'page' : undefined} onClick={(e) => { e.preventDefault(); ir(r.id); }}>{r.nome}</a>
            ))}
          </nav>
          <button type="button" className="btn btn-primario so-largo" onClick={() => novo('entrada')}><Icone nome="mais" tamanho={18} /> Lançar</button>
        </div>
      </header>

      <main className="conteudo">
        {rotaAtual === 'painel' && <Painel novo={novo} ir={ir} rapido={() => setRapido(true)} pendentes={() => setVerPendentes(true)} />}
        {rotaAtual === 'futuro' && <Futuro ir={ir} />}
        {rotaAtual === 'patrimonio' && <Patrimonio ir={ir} />}
        {rotaAtual === 'lancamentos' && <Livro editar={editar} ir={ir} />}
        {rotaAtual === 'agenda' && <Agenda baixa={setBaixa} editar={editar} />}
        {rotaAtual === 'relatorio' && <Relatorio />}
        {rotaAtual === 'opcoes' && <Ajustes />}
        {rotaAtual === 'extrato' && <Extrato />}
      </main>

      {rotaAtual !== 'painel' && rotaAtual !== 'opcoes' && rotaAtual !== 'extrato' && (
        <button type="button" className="fab so-estreito" onClick={() => novo('saida')} aria-label="Novo lançamento"><Icone nome="mais" tamanho={26} /></button>
      )}

      <nav className="nav-baixo" aria-label="Seções" style={{ gridTemplateColumns: `repeat(${rotas.length - 1}, 1fr)` }}>
        {rotas.filter((r) => r.id !== 'extrato').map((r) => (
          <a key={r.id} href={`#${r.id}`} aria-current={rotaAtual === r.id || (rotaAtual === 'extrato' && r.id === 'lancamentos') ? 'page' : undefined} onClick={(e) => { e.preventDefault(); ir(r.id); }}>
            <Icone nome={r.icone} tamanho={22} />
            <span>{'curto' in r ? r.curto : r.nome}</span>
          </a>
        ))}
      </nav>

      {form && (
        <FormLancamento
          key={form.editar?.id ?? form.pendente?.id ?? form.tipo}
          tipoInicial={form.tipo}
          editar={form.editar}
          inicial={form.pendente}
          aoSalvar={form.pendente ? () => despachar({ t: 'excluirPendente', id: form.pendente!.id }) : undefined}
          aoFechar={fecharForm}
        />
      )}
      {rapido && <FormRapido aoFechar={() => setRapido(false)} />}
      {verPendentes && !form && <ListaPendentes aoFechar={() => setVerPendentes(false)} completar={(p) => setForm({ tipo: 'saida', pendente: p })} />}
      {baixa && <FormBaixa lancamento={baixa} aoFechar={fecharBaixa} />}
    </div>
  );
}
