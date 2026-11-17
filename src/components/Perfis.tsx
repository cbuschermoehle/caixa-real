import { useEffect, useRef, useState } from 'react';
import { useDados } from '../data/store';
import { ehPessoal } from '../data/planos';
import { Icone } from './ui';

/** Nome do perfil no topo da tela. Um toque abre a lista para trocar de perfil ou criar outro. */
export function TrocaPerfil({ aoTrocar }: { aoTrocar: () => void }) {
  const { dados, perfis, ativo, despachar } = useDados();
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  const empresa = dados.empresa!;

  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => {
      if (!caixa.current?.contains(e.target as Node)) setAberto(false);
    };
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const lista = perfis.map((p, i) => ({ p, i })).filter(({ p }) => p.empresa);

  return (
    <div className="perfil-troca" ref={caixa}>
      <button type="button" className="perfil-botao" aria-expanded={aberto} aria-haspopup="true" onClick={() => setAberto(!aberto)}>
        <span className="logo" aria-hidden="true">R$</span>
        <span className="marca-nome">{empresa.nome}</span>
        <span className="perfil-tipo">{ehPessoal(empresa) ? 'Pessoal' : 'Empresa'}</span>
        {empresa.exemplo && <span className="selo selo-exemplo">Exemplo</span>}
        <span className="seta-baixo" aria-hidden="true"><Icone nome="seta" tamanho={16} /></span>
      </button>
      {aberto && (
        <div className="perfil-menu" role="menu" aria-label="Perfis">
          {lista.map(({ p, i }) => (
            <button
              key={p.empresa!.id}
              type="button"
              role="menuitem"
              aria-current={i === ativo}
              onClick={() => {
                setAberto(false);
                if (i !== ativo) {
                  despachar({ t: 'trocarPerfil', indice: i });
                  aoTrocar();
                }
              }}
            >
              <span className="perfil-menu-nome">{p.empresa!.nome}</span>
              <span className="perfil-tipo">{ehPessoal(p.empresa) ? 'Pessoal' : 'Empresa'}</span>
            </button>
          ))}
          <button type="button" role="menuitem" className="perfil-novo" onClick={() => { setAberto(false); despachar({ t: 'novoPerfil' }); }}>
            <Icone nome="mais" tamanho={18} /> Criar outro perfil (empresa ou pessoal)
          </button>
        </div>
      )}
    </div>
  );
}
