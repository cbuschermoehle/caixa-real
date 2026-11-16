import { useRef, useState } from 'react';
import { useDados } from '../data/store';
import { baixarCopia, lerCopia } from '../lib/copia';
import { Confirmar } from './ui';
import type { Dados } from '../types';

/** Botão que lê um arquivo de cópia de segurança e substitui os dados atuais (com confirmação). */
export function RestaurarCopia({ rotulo = 'Restaurar uma cópia de segurança', confirmar = true }: { rotulo?: string; confirmar?: boolean }) {
  const { despachar } = useDados();
  const entrada = useRef<HTMLInputElement>(null);
  const [lida, setLida] = useState<Dados | null>(null);
  const [erro, setErro] = useState('');

  async function escolher(f: File | undefined) {
    if (!f) return;
    setErro('');
    const d = lerCopia(await f.text());
    if (entrada.current) entrada.current.value = '';
    if (!d) return setErro('Este arquivo não é uma cópia de segurança do Caixa Real.');
    if (confirmar) setLida(d);
    else despachar({ t: 'restaurar', dados: d });
  }

  return (
    <div className="copia">
      <input ref={entrada} type="file" accept=".json,application/json" hidden onChange={(e) => escolher(e.target.files?.[0])} aria-label="Arquivo da cópia" />
      {lida ? (
        <Confirmar
          perigo
          texto={<>Trocar os dados atuais pela cópia de <strong>{lida.empresa?.nome ?? 'empresa sem nome'}</strong> ({lida.lancamentos.length} lançamentos)? O que está aqui agora será substituído.</>}
          rotuloOk="Restaurar"
          aoCancelar={() => setLida(null)}
          aoConfirmar={() => {
            despachar({ t: 'restaurar', dados: lida });
            setLida(null);
          }}
        />
      ) : (
        <button type="button" className="btn" onClick={() => entrada.current?.click()}>{rotulo}</button>
      )}
      {erro && <p className="erro">{erro}</p>}
    </div>
  );
}

export function BaixarCopia() {
  const { dados } = useDados();
  const [erro, setErro] = useState('');
  return (
    <div className="copia">
      <button type="button" className="btn" onClick={async () => setErro((await baixarCopia(dados)) ?? '')}>Baixar cópia de segurança</button>
      {erro && <p className="erro">{erro}</p>}
    </div>
  );
}
