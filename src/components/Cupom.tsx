import { useEffect, useMemo, useRef, useState } from 'react';
import { useSessao, type ServicoFotos } from '../data/sessao';
import { Folha, Icone } from './ui';

/*
 * Foto do cupom. Na versão publicada a imagem vai para o Supabase Storage (pasta privada "cupons")
 * e nos dados fica só o caminho. Na versão de teste, sem nuvem, a imagem fica embutida nos dados,
 * menor, para caber no navegador.
 */

/** Diminui a foto do celular (vários MB) para um JPEG leve, mantendo legível. */
export async function comprimir(arquivo: Blob, lado = 1400, qualidade = 0.72): Promise<Blob> {
  const url = URL.createObjectURL(arquivo);
  try {
    const img = await new Promise<HTMLImageElement>((ok, falha) => {
      const i = new Image();
      i.onload = () => ok(i);
      i.onerror = () => falha(new Error('Não foi possível abrir a foto.'));
      i.src = url;
    });
    const escala = Math.min(1, lado / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(img.naturalWidth * escala));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * escala));
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível preparar a foto.'))), 'image/jpeg', qualidade));
  } finally {
    URL.revokeObjectURL(url);
  }
}

const paraDataUrl = (b: Blob) =>
  new Promise<string>((ok, falha) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.onerror = () => falha(new Error('Não foi possível ler a foto.'));
    r.readAsDataURL(b);
  });

/** Versão de teste: guarda a foto dentro dos próprios dados. */
const fotosLocais: ServicoFotos = {
  enviar: async (_nome, imagem) => paraDataUrl(await comprimir(imagem, 900, 0.6)),
  endereco: async (ref) => ref,
  apagar: async () => undefined,
};

export function useFotos(): ServicoFotos {
  const sessao = useSessao();
  return useMemo(() => {
    const nuvem = sessao?.fotos;
    if (!nuvem) return fotosLocais;
    // Fotos embutidas (feitas na versão de teste e trazidas por cópia de segurança) continuam abrindo.
    return {
      enviar: async (nome, imagem) => nuvem.enviar(nome, await comprimir(imagem)),
      endereco: async (ref) => (ref.startsWith('data:') ? ref : nuvem.endereco(ref)),
      apagar: async (ref) => (ref.startsWith('data:') ? undefined : nuvem.apagar(ref)),
    };
  }, [sessao?.fotos]);
}

/** Botão "Ver cupom" que abre a foto numa folha. */
export function VerCupom({ foto, rotulo = 'Ver cupom' }: { foto: string; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <>
      <button type="button" className="btn-link btn-cupom" onClick={() => setAberto(true)}><Icone nome="camera" tamanho={16} /> {rotulo}</button>
      {aberto && <FolhaCupom foto={foto} aoFechar={() => setAberto(false)} />}
    </>
  );
}

function FolhaCupom({ foto, aoFechar }: { foto: string; aoFechar: () => void }) {
  const fotos = useFotos();
  const [url, setUrl] = useState<string | null>(null);
  const [erro, setErro] = useState('');
  useEffect(() => {
    let vivo = true;
    fotos.endereco(foto).then((u) => vivo && setUrl(u)).catch((e: Error) => vivo && setErro(e.message));
    return () => { vivo = false; };
  }, [foto, fotos]);
  return (
    <Folha titulo="Cupom" aoFechar={aoFechar}>
      {erro ? <p className="erro">{erro}</p> : url ? <img className="foto-cupom" src={url} alt="Foto do cupom" /> : <p className="ajuda">Abrindo a foto…</p>}
    </Folha>
  );
}

/** Escolher ou tirar a foto (no celular abre a câmera). Mostra a miniatura antes de guardar. */
export function EscolherFoto({ arquivo, aoMudar }: { arquivo: Blob | null; aoMudar: (f: Blob | null) => void }) {
  const campo = useRef<HTMLInputElement>(null);
  const previa = useMemo(() => (arquivo ? URL.createObjectURL(arquivo) : null), [arquivo]);
  useEffect(() => () => { if (previa) URL.revokeObjectURL(previa); }, [previa]);
  return (
    <div className="escolher-foto">
      <input ref={campo} id="r-foto" type="file" accept="image/*" capture="environment" hidden onChange={(e) => { aoMudar(e.target.files?.[0] ?? null); e.target.value = ''; }} />
      {previa ? (
        <>
          <img src={previa} alt="Prévia do cupom" className="miniatura-cupom" />
          <button type="button" className="btn-link" onClick={() => campo.current?.click()}>Trocar foto</button>
          <button type="button" className="btn-link texto-perigo" onClick={() => aoMudar(null)}>Tirar foto</button>
        </>
      ) : (
        <button type="button" className="btn btn-foto" onClick={() => campo.current?.click()}><Icone nome="camera" tamanho={18} /> Foto do cupom (opcional)</button>
      )}
    </div>
  );
}
