import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import type { Dados } from './types';
import { ProvedorDados, vazio } from './data/store';
import { SessaoCtx, type EstadoNuvem } from './data/sessao';
import { baixar, criarConta, entrar, enviar, recuperarSenha, sair, servicoFotos, supabase, trocarSenha, type Session } from './data/nuvem';
import { Campo } from './components/ui';
import { App } from './App';

/*
 * Versão publicada: pede login, baixa os dados da conta e salva na nuvem a cada mudança
 * (agrupando mudanças seguidas). Se outro aparelho salvar no meio do caminho, recarrega
 * a versão mais nova em vez de apagar o que foi feito lá.
 */

export function Nuvem() {
  const [sessao, setSessao] = useState<Session | null | undefined>(undefined);
  const [novaSenha, setNovaSenha] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSessao(data.session));
    const { data } = supabase.auth.onAuthStateChange((evento, s) => {
      if (evento === 'PASSWORD_RECOVERY') setNovaSenha(true);
      setSessao(s);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  if (sessao === undefined) return <Aguarde texto="Abrindo…" />;
  if (novaSenha && sessao) return <NovaSenha aoConcluir={() => setNovaSenha(false)} />;
  if (!sessao) return <Entrar />;
  return <Conectado key={sessao.user.id} usuario={sessao.user.id} email={sessao.user.email ?? ''} />;
}

function Conectado({ usuario, email }: { usuario: string; email: string }) {
  const [carga, setCarga] = useState<{ dados: Dados; n: number } | null>(null);
  const [erro, setErro] = useState('');
  const [estado, setEstado] = useState<EstadoNuvem>('salvo');
  const [aviso, setAviso] = useState('');
  const revisao = useRef(0);
  const pendente = useRef<Dados | null>(null);
  const enviando = useRef(false);
  const timer = useRef<number | undefined>(undefined);

  const recarregar = useCallback(async (motivo?: string) => {
    try {
      const r = await baixar(usuario);
      revisao.current = r.revisao;
      pendente.current = null;
      setCarga((c) => ({ dados: r.dados ?? vazio, n: (c?.n ?? 0) + 1 }));
      setEstado('salvo');
      setErro('');
      if (motivo) setAviso(motivo);
    } catch (e) {
      setErro((e as Error).message);
    }
  }, [usuario]);

  useEffect(() => {
    recarregar();
  }, [recarregar]);

  const descarregar = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (enviando.current || !pendente.current) return;
    const d = pendente.current;
    enviando.current = true;
    setEstado('salvando');
    try {
      const r = await enviar(usuario, d, revisao.current);
      if (r === 'conflito') {
        await recarregar('Seus dados foram alterados em outro aparelho. Carregamos a versão mais recente; confira a última coisa que você fez aqui.');
        return;
      }
      revisao.current = r;
      if (pendente.current === d) pendente.current = null;
      setEstado(pendente.current ? 'salvando' : 'salvo');
    } catch (e) {
      const offline = !navigator.onLine || /conexão|fetch/i.test((e as Error).message);
      setEstado(offline ? 'offline' : 'erro');
      timer.current = window.setTimeout(descarregar, 8000);
    } finally {
      enviando.current = false;
    }
    if (pendente.current) timer.current = window.setTimeout(descarregar, 300);
  }, [usuario, recarregar]);

  const salvar = useCallback((d: Dados) => {
    pendente.current = d;
    setEstado('salvando');
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(descarregar, 700);
  }, [descarregar]);

  // Volta da internet, aba fechando, ou volta para a aba: salva o que falta / busca novidades de outro aparelho.
  useEffect(() => {
    const online = () => descarregar();
    const antesDeSair = (e: BeforeUnloadEvent) => {
      if (pendente.current) {
        descarregar();
        e.preventDefault();
      }
    };
    const visivel = async () => {
      if (document.visibilityState === 'hidden') return void descarregar();
      if (pendente.current || enviando.current) return;
      try {
        const r = await baixar(usuario);
        if (r.revisao > revisao.current && !pendente.current && !enviando.current) {
          revisao.current = r.revisao;
          setCarga((c) => ({ dados: r.dados ?? vazio, n: (c?.n ?? 0) + 1 }));
        }
      } catch {
        /* sem internet: segue com o que tem */
      }
    };
    window.addEventListener('online', online);
    window.addEventListener('beforeunload', antesDeSair);
    document.addEventListener('visibilitychange', visivel);
    return () => {
      window.removeEventListener('online', online);
      window.removeEventListener('beforeunload', antesDeSair);
      document.removeEventListener('visibilitychange', visivel);
    };
  }, [descarregar, usuario]);

  const fotos = useMemo(() => servicoFotos(usuario), [usuario]);
  const valor = useMemo(() => ({ email, estado, sair: () => void sair(), fotos }), [email, estado, fotos]);

  if (erro && !carga) {
    return (
      <Moldura>
        <h1>Não foi possível abrir seus dados</h1>
        <p className="erro">{erro}</p>
        <div className="linha-botoes">
          <button type="button" className="btn btn-primario" onClick={() => recarregar()}>Tentar de novo</button>
          <button type="button" className="btn" onClick={() => sair()}>Sair</button>
        </div>
      </Moldura>
    );
  }
  if (!carga) return <Aguarde texto="Buscando seus dados…" />;

  return (
    <SessaoCtx.Provider value={valor}>
      <ProvedorDados key={carga.n} inicial={carga.dados} salvar={salvar}>
        <App />
      </ProvedorDados>
      {(estado === 'offline' || estado === 'erro') && (
        <div className="aviso-nuvem" role="status">
          {estado === 'offline' ? 'Sem internet. O que você fizer agora será salvo quando a conexão voltar; não feche esta página.' : 'Não conseguimos salvar. Tentando de novo…'}
        </div>
      )}
      {aviso && (
        <div className="aviso-nuvem" role="alert">
          {aviso} <button type="button" className="btn btn-link" onClick={() => setAviso('')}>Entendi</button>
        </div>
      )}
    </SessaoCtx.Provider>
  );
}

function Moldura({ children }: { children: ReactNode }) {
  return (
    <main className="onboarding">
      <div className="onb-marca">
        <span className="logo" aria-hidden="true">R$</span>
        <span>MicroCaixa Fácil</span>
      </div>
      <section className="onb-passo">{children}</section>
    </main>
  );
}

function Aguarde({ texto }: { texto: string }) {
  return (
    <Moldura>
      <p className="lead" role="status">{texto}</p>
    </Moldura>
  );
}

type Modo = 'entrar' | 'criar' | 'esqueci';

function Entrar() {
  const [modo, setModo] = useState<Modo>('entrar');
  const [email, setEmail] = useState('');
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  const [ok, setOk] = useState('');
  const [ocupado, setOcupado] = useState(false);

  async function enviarForm(e: FormEvent) {
    e.preventDefault();
    setErro('');
    setOk('');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setErro('Confira o e-mail digitado.');
    if (modo !== 'esqueci' && senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    setOcupado(true);
    try {
      if (modo === 'entrar') {
        const r = await entrar(email.trim(), senha);
        if (r) setErro(r);
      } else if (modo === 'criar') {
        const r = await criarConta(email.trim(), senha);
        if (r.erro) setErro(r.erro);
        else if (r.confirmar) setOk(`Enviamos um link para ${email.trim()}. Abra o e-mail e clique em "Confirm" para ativar a conta. Depois volte aqui e entre.`);
      } else {
        const r = await recuperarSenha(email.trim());
        if (r) setErro(r);
        else setOk(`Se houver uma conta com ${email.trim()}, chega em instantes um e-mail com o link para criar uma senha nova.`);
      }
    } finally {
      setOcupado(false);
    }
  }

  const trocar = (m: Modo) => {
    setModo(m);
    setErro('');
    setOk('');
  };

  return (
    <Moldura>
      <h1>{modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar sua conta' : 'Esqueci minha senha'}</h1>
      <p className="lead">
        {modo === 'entrar' && 'Use o e-mail e a senha da sua conta. Seus dados ficam guardados na nuvem e aparecem em qualquer aparelho.'}
        {modo === 'criar' && 'Só o seu e-mail e uma senha. Ninguém além de você vê os dados da sua empresa.'}
        {modo === 'esqueci' && 'Digite o e-mail da conta e enviamos um link para você criar uma senha nova.'}
      </p>
      <form className="form-entrar" onSubmit={enviarForm} noValidate>
        <Campo rotulo="E-mail" id="e-email">
          <input id="e-email" type="email" autoComplete="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </Campo>
        {modo !== 'esqueci' && (
          <Campo rotulo="Senha" id="e-senha" ajuda={modo === 'criar' ? 'Pelo menos 8 caracteres.' : undefined}>
            <input id="e-senha" type="password" autoComplete={modo === 'criar' ? 'new-password' : 'current-password'} value={senha} onChange={(e) => setSenha(e.target.value)} />
          </Campo>
        )}
        {erro && <p className="erro" role="alert">{erro}</p>}
        {ok && <p className="previa-ok" role="status">{ok}</p>}
        <button type="submit" className="btn btn-primario btn-grande" disabled={ocupado}>
          {ocupado ? 'Aguarde…' : modo === 'entrar' ? 'Entrar' : modo === 'criar' ? 'Criar conta' : 'Enviar link'}
        </button>
      </form>
      <div className="onb-exemplo">
        {modo === 'entrar' ? (
          <>
            <button type="button" className="btn btn-link" onClick={() => trocar('esqueci')}>Esqueci minha senha</button>
            <button type="button" className="btn" onClick={() => trocar('criar')}>Primeira vez? Criar conta</button>
          </>
        ) : (
          <button type="button" className="btn" onClick={() => trocar('entrar')}>Já tenho conta: entrar</button>
        )}
      </div>
    </Moldura>
  );
}

function NovaSenha({ aoConcluir }: { aoConcluir: () => void }) {
  const [senha, setSenha] = useState('');
  const [erro, setErro] = useState('');
  async function salvar(e: FormEvent) {
    e.preventDefault();
    if (senha.length < 8) return setErro('A senha precisa ter pelo menos 8 caracteres.');
    const r = await trocarSenha(senha);
    if (r) setErro(r);
    else aoConcluir();
  }
  return (
    <Moldura>
      <h1>Crie uma senha nova</h1>
      <form className="form-entrar" onSubmit={salvar} noValidate>
        <Campo rotulo="Senha nova" id="n-senha" ajuda="Pelo menos 8 caracteres.">
          <input id="n-senha" type="password" autoComplete="new-password" value={senha} onChange={(e) => setSenha(e.target.value)} />
        </Campo>
        {erro && <p className="erro" role="alert">{erro}</p>}
        <button type="submit" className="btn btn-primario btn-grande">Salvar senha</button>
      </form>
    </Moldura>
  );
}
