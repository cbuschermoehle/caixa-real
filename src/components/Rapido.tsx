import { useEffect, useRef, useState } from 'react';
import type { Pendente } from '../types';
import { useDados } from '../data/store';
import { brl, dataAmigavel, hoje, novoId, parseValor } from '../lib/format';
import { Campo, Folha, Icone } from './ui';
import { EscolherFoto, VerCupom, useFotos } from './Cupom';

/*
 * Lançamento rápido: anota só o valor (e uma palavra) na hora do gasto.
 * Fica em "Pendentes", sem mexer no saldo, até a pessoa completar categoria e forma de pagamento.
 */

export function FormRapido({ aoFechar }: { aoFechar: () => void }) {
  const { despachar } = useDados();
  const [valor, setValor] = useState('');
  const [descricao, setDescricao] = useState('');
  const [data, setData] = useState(hoje());
  const [erro, setErro] = useState('');
  const [foto, setFoto] = useState<Blob | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [semFoto, setSemFoto] = useState(false);
  const fotos = useFotos();
  const campo = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const t = window.setTimeout(() => campo.current?.focus(), 30);
    return () => window.clearTimeout(t);
  }, []);
  async function guardar(e: React.FormEvent) {
    e.preventDefault();
    const v = parseValor(valor);
    if (v === null || v <= 0) return setErro('Digite o valor, por exemplo 187,40.');
    if (!data) return setErro('Escolha a data.');
    const id = novoId();
    let ref: string | undefined;
    if (foto && !semFoto) {
      setEnviando(true);
      try {
        ref = await fotos.enviar(id, foto);
      } catch (err) {
        setEnviando(false);
        setSemFoto(true);
        return setErro(`${(err as Error).message} Toque em Guardar de novo para anotar sem a foto.`);
      }
    }
    despachar({ t: 'pendente', pendente: { id, valor: v, data, descricao: descricao.trim() || undefined, criadoEm: new Date().toISOString(), foto: ref } });
    aoFechar();
  }
  return (
    <Folha titulo="Lançamento rápido" aoFechar={aoFechar} tom="saida">
      <form onSubmit={guardar} noValidate className="form">
        <p className="ajuda">Anote agora e complete depois em Pendentes (categoria e como pagou). Até lá, não mexe no saldo.</p>
        <Campo rotulo="Quanto gastou (R$)" id="r-valor" erro={erro}>
          <input ref={campo} id="r-valor" className="input-valor" inputMode="decimal" autoComplete="off" placeholder="0,00" value={valor} onChange={(e) => setValor(e.target.value)} />
        </Campo>
        <div className="grade-2">
          <Campo rotulo="Com o quê (opcional)" id="r-desc">
            <input id="r-desc" value={descricao} onChange={(e) => setDescricao(e.target.value)} placeholder="Ex.: mercado" autoComplete="off" />
          </Campo>
          <Campo rotulo="Quando" id="r-data">
            <input id="r-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
        </div>
        <EscolherFoto arquivo={foto} aoMudar={(f) => { setFoto(f); setSemFoto(false); }} />
        <div className="acoes-form">
          <button type="submit" className="btn btn-grande btn-saida" disabled={enviando}>{enviando ? 'Guardando a foto…' : semFoto ? 'Guardar sem a foto' : 'Guardar'}</button>
        </div>
      </form>
    </Folha>
  );
}

export function ListaPendentes({ aoFechar, completar }: { aoFechar: () => void; completar: (p: Pendente) => void }) {
  const { dados, despachar } = useDados();
  const fotos = useFotos();
  const [apagar, setApagar] = useState<string | null>(null);
  const lista = [...(dados.pendentes ?? [])].sort((a, b) => a.data.localeCompare(b.data) || a.criadoEm.localeCompare(b.criadoEm));
  const total = lista.reduce((a, p) => a + p.valor, 0);
  return (
    <Folha titulo="Pendentes" aoFechar={aoFechar}>
      {lista.length === 0 ? (
        <p className="vazio">Nada pendente. Use o botão Rápido no Painel para anotar um gasto na hora.</p>
      ) : (
        <>
          <p className="ajuda">{lista.length} {lista.length === 1 ? 'gasto anotado' : 'gastos anotados'} ({brl(total)}). Toque em Completar para escolher a categoria e como pagou.</p>
          <ul className="lista-lanc lista-pendentes">
            {lista.map((p) => (
              <li key={p.id}>
                <span className="lanc-info">
                  <span className="lanc-titulo">{p.descricao || 'Sem descrição'}</span>
                  <span className="lanc-meta">{dataAmigavel(p.data)}</span>
                  {p.foto && <VerCupom foto={p.foto} />}
                </span>
                <span className="valor lanc-valor neg">-{brl(p.valor)}</span>
                {apagar === p.id ? (
                  <>
                    <button type="button" className="btn btn-perigo" onClick={() => { if (p.foto) void fotos.apagar(p.foto).catch(() => undefined); despachar({ t: 'excluirPendente', id: p.id }); setApagar(null); }}>Apagar</button>
                    <button type="button" className="btn btn-link" onClick={() => setApagar(null)}>Não</button>
                  </>
                ) : (
                  <>
                    <button type="button" className="btn btn-primario" onClick={() => completar(p)}>Completar</button>
                    <button type="button" className="btn-icone" aria-label={`Apagar ${p.descricao || 'pendente'}`} onClick={() => setApagar(p.id)}><Icone nome="x" tamanho={16} /></button>
                  </>
                )}
              </li>
            ))}
          </ul>
        </>
      )}
    </Folha>
  );
}
