import { nomeCategoria } from '../lib/categorias';
import { Fragment, useState } from 'react';
import type { Bloco, Categoria, Conta, Sentido, TipoConta } from '../types';
import { useDados } from '../data/store';
import { RAMOS, blocosDe, ehPessoal, sentidoDoBloco } from '../data/planos';
import { saldoConta } from '../lib/calc';
import { brl, dataBR, hoje, novoId, parseValor, valorParaCampo } from '../lib/format';
import { Campo, Confirmar, Folha, Icone } from '../components/ui';
import { TIPOS_CONTA } from './Onboarding';
import { BaixarCopia, RestaurarCopia } from '../components/Copia';
import { useSessao } from '../data/sessao';

/** Limite por mês só faz sentido em categorias de gasto principais (não em subcategorias nem em "outras"). */
const temLimite = (c: Categoria) => c.sentido === 'saida' && !c.paiId && c.bloco !== 'outras';

export function Ajustes() {
  const { dados, despachar, perfis } = useDados();
  const blocos = blocosDe(dados.empresa);
  const varios = perfis.filter((p) => p.empresa).length > 1;
  const [contaEd, setContaEd] = useState<Conta | 'nova' | null>(null);
  const [blocoAberto, setBlocoAberto] = useState<Bloco | null>('entradas');
  const [novaCat, setNovaCat] = useState<{ bloco: Bloco; nome: string; sentido: Sentido } | null>(null);
  const [novaSub, setNovaSub] = useState<{ pai: Categoria; nome: string } | null>(null);
  const [renomear, setRenomear] = useState<{ id: string; nome: string; limite: string } | null>(null);
  const [zerar, setZerar] = useState(false);
  const empresa = dados.empresa!;
  const sessao = useSessao();

  const salvarCat = (c: Categoria) => despachar({ t: 'categoria', categoria: c });

  return (
    <div className="tela">
      <header className="tela-topo">
        <h1>Ajustes</h1>
        <p className="lead">{empresa.nome} · {ehPessoal(empresa) ? 'Finanças pessoais' : RAMOS.find((r) => r.id === empresa.ramo)?.nome}</p>
      </header>

      <section className="cartao">
        <header className="cartao-topo">
          <h2>Contas</h2>
          <button type="button" className="btn btn-link" onClick={() => setContaEd('nova')}>+ Nova conta</button>
        </header>
        <ul className="lista-ajustes">
          {dados.contas.map((c) => (
            <li key={c.id} className={c.arquivada ? 'apagado' : ''}>
              <div>
                <strong>{c.nome}</strong>
                <span className="ajuda">{TIPOS_CONTA.find((t) => t.v === c.tipo)?.r}{c.cartao ? ` · fecha dia ${c.cartao.fechamento}, vence dia ${c.cartao.vencimento}` : ''}{c.arquivada ? ' · arquivada' : ''}</span>
              </div>
              <span className="num">{brl(saldoConta(dados, c, hoje()))}</span>
              <button type="button" className="btn-icone" aria-label={`Editar ${c.nome}`} onClick={() => setContaEd(c)}><Icone nome="lapis" tamanho={18} /></button>
            </li>
          ))}
        </ul>
      </section>

      <section className="cartao">
        <h2>Categorias</h2>
        <p className="ajuda">No lápis de uma categoria de gasto você também pode definir um limite por mês: o Painel mostra quanto já foi usado. Renomeie, esconda ou crie categorias. No botão + de uma categoria você cria subcategorias (ex.: Salários › cada funcionário); no relatório elas somam dentro da categoria. Categorias escondidas somem da lista de escolha, mas os lançamentos antigos continuam nos relatórios.</p>
        {blocos.map((b) => {
          const raizes = dados.categorias.filter((c) => c.bloco === b.id && !c.paiId).sort((a, z) => a.ordem - z.ordem);
          const lista = raizes.flatMap((r) => [r, ...dados.categorias.filter((c) => c.paiId === r.id).sort((a, z) => a.ordem - z.ordem)]);
          const aberto = blocoAberto === b.id;
          return (
            <div key={b.id} className="bloco-cat">
              <button type="button" className="bloco-cat-topo" aria-expanded={aberto} onClick={() => setBlocoAberto(aberto ? null : b.id)}>
                <span><strong>{b.nome}</strong> <span className="ajuda">{raizes.filter((c) => !c.oculta).length} ativas</span></span>
                <span className={`seta ${aberto ? 'aberta' : ''}`}><Icone nome="seta" tamanho={16} /></span>
              </button>
              {aberto && (
                <>
                  <p className="ajuda">{b.ajuda}</p>
                  <ul className="lista-cat">
                    {lista.map((c) => (
                      <Fragment key={c.id}>
                      <li className={`${c.oculta ? 'apagado' : ''} ${c.paiId ? 'sub' : ''}`}>
                        {renomear?.id === c.id ? (
                          <form className="renomear" onSubmit={(e) => {
                            e.preventDefault();
                            const lim = renomear.limite.trim() ? parseValor(renomear.limite) : 0;
                            if (renomear.nome.trim()) salvarCat({ ...c, nome: renomear.nome.trim(), limite: lim && lim > 0 ? lim : undefined });
                            setRenomear(null);
                          }}>
                            <input id={`rn-${c.id}`} value={renomear.nome} onChange={(e) => setRenomear({ ...renomear, nome: e.target.value })} aria-label="Novo nome" autoFocus />
                            {temLimite(c) && (
                              <input id={`rl-${c.id}`} className="input-limite" inputMode="decimal" value={renomear.limite} onChange={(e) => setRenomear({ ...renomear, limite: e.target.value })} placeholder="Limite/mês" aria-label={`Limite por mês de ${c.nome} (R$)`} />
                            )}
                            <button type="submit" className="btn btn-primario">OK</button>
                          </form>
                        ) : (
                          <>
                            <span>
                              {c.paiId && <span className="ajuda" aria-hidden="true">↳ </span>}
                              {c.nome}
                              {b.id === 'outras' && <em className="ajuda"> · {c.sentido === 'entrada' ? 'entrada' : 'saída'}</em>}
                              {c.grupo && !c.paiId && <em className="ajuda"> · {c.grupo}</em>}
                              {c.limite && temLimite(c) ? <em className="ajuda"> · limite {brl(c.limite)}/mês</em> : null}
                            </span>
                            <button type="button" className="btn-icone" aria-label={`Renomear ${c.nome}`} onClick={() => setRenomear({ id: c.id, nome: c.nome, limite: c.limite ? valorParaCampo(c.limite) : '' })} title={temLimite(c) ? 'Renomear ou definir limite por mês' : 'Renomear'}><Icone nome="lapis" tamanho={16} /></button>
                            <button type="button" className="btn-icone" aria-label={c.oculta ? `Mostrar ${c.nome}` : `Esconder ${c.nome}`} onClick={() => salvarCat({ ...c, oculta: !c.oculta })}>
                              <Icone nome={c.oculta ? 'olhoFechado' : 'olho'} tamanho={16} />
                            </button>
                            {!c.paiId && (
                              <button type="button" className="btn-icone" aria-label={`Criar subcategoria em ${c.nome}`} title="Criar subcategoria" onClick={() => setNovaSub({ pai: c, nome: '' })}>
                                <Icone nome="mais" tamanho={16} />
                              </button>
                            )}
                          </>
                        )}
                      </li>
                      {novaSub?.pai.id === c.id && (
                        <li className="sub">
                          <form
                            className="renomear"
                            onSubmit={(e) => {
                              e.preventDefault();
                              if (!novaSub.nome.trim()) return;
                              salvarCat({ id: novoId(), nome: novaSub.nome.trim(), bloco: c.bloco, sentido: c.sentido, grupo: c.grupo, paiId: c.id, oculta: false, ordem: Math.max(0, ...dados.categorias.map((x) => x.ordem)) + 1 });
                              setNovaSub(null);
                            }}
                          >
                            <input id={`ns-${c.id}`} value={novaSub.nome} placeholder={`Subcategoria de ${c.nome}`} onChange={(e) => setNovaSub({ ...novaSub, nome: e.target.value })} aria-label={`Nome da subcategoria de ${c.nome}`} autoFocus />
                            <button type="submit" className="btn btn-primario">Criar</button>
                            <button type="button" className="btn btn-link" onClick={() => setNovaSub(null)}>Cancelar</button>
                          </form>
                        </li>
                      )}
                      </Fragment>
                    ))}
                  </ul>
                  {novaCat?.bloco === b.id ? (
                    <form
                      className="renomear"
                      onSubmit={(e) => {
                        e.preventDefault();
                        if (!novaCat.nome.trim()) return;
                        salvarCat({ id: novoId(), nome: novaCat.nome.trim(), bloco: b.id, sentido: novaCat.sentido, oculta: false, ordem: Math.max(0, ...dados.categorias.map((x) => x.ordem)) + 1 });
                        setNovaCat(null);
                      }}
                    >
                      <input id={`nc-${b.id}`} value={novaCat.nome} placeholder="Nome da categoria" onChange={(e) => setNovaCat({ ...novaCat, nome: e.target.value })} aria-label="Nome da nova categoria" autoFocus />
                      {b.id === 'outras' && (
                        <select id={`ncs-${b.id}`} value={novaCat.sentido} onChange={(e) => setNovaCat({ ...novaCat, sentido: e.target.value as Sentido })} aria-label="Entrada ou saída">
                          <option value="entrada">Entrada</option>
                          <option value="saida">Saída</option>
                        </select>
                      )}
                      <button type="submit" className="btn btn-primario">Criar</button>
                    </form>
                  ) : (
                    <button type="button" className="btn btn-link" onClick={() => setNovaCat({ bloco: b.id, nome: '', sentido: sentidoDoBloco(b.id) ?? 'saida' })}>+ Nova categoria em {b.nome}</button>
                  )}
                </>
              )}
            </div>
          );
        })}
      </section>

      <section className="cartao">
        <h2>Regras de categoria automática</h2>
        {(dados.regras ?? []).length === 0 ? (
          <p className="ajuda">Quando você confirma uma linha do extrato com uma categoria, o sistema aprende. Na próxima importação, descrições parecidas já vêm com a categoria preenchida.</p>
        ) : (
          <>
            <p className="ajuda">Descrições do extrato que contêm o texto da esquerda já vêm com a categoria da direita.</p>
            <ul className="lista-ajustes">
              {[...(dados.regras ?? [])].sort((a, b) => b.usos - a.usos).map((r) => (
                <li key={r.id}>
                  <div>
                    <strong className="mono">{r.trecho}</strong>
                    <span className="ajuda">{r.sentido === 'entrada' ? 'Entrada' : 'Saída'} → {nomeCategoria(r.categoriaId, dados.categorias) || 'categoria apagada'} · usada {r.usos}x</span>
                  </div>
                  <button type="button" className="btn-icone" aria-label={`Apagar regra ${r.trecho}`} onClick={() => despachar({ t: 'excluirRegra', id: r.id })}><Icone nome="x" tamanho={16} /></button>
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section className="cartao">
        <h2>Dados</h2>
        {sessao ? (
          <div className="conta-nuvem">
            <p className="ajuda">Conectado como <strong>{sessao.email}</strong>. Tudo o que você faz é salvo na nuvem na hora{sessao.estado === 'salvando' ? ' (salvando agora…)' : sessao.estado === 'salvo' ? ' (tudo salvo)' : ' (aguardando conexão)'}.</p>
            <button type="button" className="btn" onClick={sessao.sair}>Sair desta conta</button>
          </div>
        ) : (
          <p className="ajuda">Nesta versão de teste, tudo fica guardado só neste navegador. Baixe uma cópia de segurança para levar estes dados para a versão na nuvem.</p>
        )}
        <p className="ajuda">A cópia de segurança é um arquivo com todos os dados{varios ? ' de todos os perfis' : ''}. Guarde de vez em quando no computador ou no Google Drive.</p>
        <div className="linha-botoes">
          <BaixarCopia />
          <RestaurarCopia />
        </div>
        <div className="linha-botoes">
          <button type="button" className="btn" onClick={() => despachar({ t: 'novoPerfil' })}>Criar outro perfil (empresa ou pessoal)</button>
        </div>
        {zerar ? (
          <Confirmar
            perigo
            texto={varios
              ? `Apagar o perfil "${empresa.nome}" com todas as contas e lançamentos dele? Os outros perfis continuam. Não dá para desfazer (a não ser que você tenha uma cópia de segurança).`
              : sessao ? 'Apagar este perfil e todos os lançamentos da sua conta? Não dá para desfazer (a não ser que você tenha uma cópia de segurança).' : 'Apagar este perfil e todos os lançamentos deste navegador? Não dá para desfazer.'}
            rotuloOk={varios ? 'Apagar este perfil' : 'Apagar tudo'}
            aoCancelar={() => setZerar(false)}
            aoConfirmar={() => { setZerar(false); despachar({ t: 'zerar' }); }}
          />
        ) : (
          <button type="button" className="btn btn-perigo-texto" onClick={() => setZerar(true)}>{empresa.exemplo ? 'Apagar este exemplo' : varios ? 'Apagar este perfil' : 'Apagar tudo e recomeçar'}</button>
        )}
      </section>

      {contaEd && <FormConta conta={contaEd === 'nova' ? null : contaEd} aoFechar={() => setContaEd(null)} />}
    </div>
  );
}

function FormConta({ conta, aoFechar }: { conta: Conta | null; aoFechar: () => void }) {
  const { dados, despachar } = useDados();
  const [nome, setNome] = useState(conta?.nome ?? '');
  const [tipo, setTipo] = useState<TipoConta>(conta?.tipo ?? 'corrente');
  const [saldo, setSaldo] = useState(conta ? valorParaCampo(conta.saldoInicial) : '');
  const [data, setData] = useState(conta?.dataSaldoInicial ?? hoje());
  const [fechamento, setFechamento] = useState(conta?.cartao ? String(conta.cartao.fechamento) : '');
  const [vencimento, setVencimento] = useState(conta?.cartao ? String(conta.cartao.vencimento) : '');
  const [limite, setLimite] = useState(conta?.cartao?.limite ? valorParaCampo(conta.cartao.limite) : '');
  const pagadoras = dados.contas.filter((c) => c.tipo !== 'cartao' && c.tipo !== 'aplicacao' && (!c.arquivada || c.id === conta?.cartao?.contaPagamentoId));
  const [pagadora, setPagadora] = useState(conta?.cartao?.contaPagamentoId ?? pagadoras.find((c) => c.tipo === 'corrente')?.id ?? pagadoras[0]?.id ?? '');
  const [erro, setErro] = useState('');
  const cartao = tipo === 'cartao';
  function salvar(e: React.FormEvent) {
    e.preventDefault();
    if (!nome.trim()) return setErro('Digite o nome da conta.');
    const v = cartao || !saldo.trim() ? 0 : parseValor(saldo);
    if (v === null) return setErro('O saldo não é um valor válido.');
    const dia = (t: string) => (/^\d{1,2}$/.test(t.trim()) && Number(t) >= 1 && Number(t) <= 31 ? Number(t) : null);
    const lim = limite.trim() ? parseValor(limite) : undefined;
    if (cartao) {
      if (!dia(fechamento) || !dia(vencimento)) return setErro('Digite o dia do fechamento e o dia do vencimento da fatura (de 1 a 31).');
      if (lim === null) return setErro('O limite não é um valor válido.');
    }
    despachar({
      t: 'conta',
      conta: {
        id: conta?.id ?? novoId(), nome: nome.trim(), tipo, saldoInicial: v, dataSaldoInicial: cartao ? conta?.dataSaldoInicial ?? hoje() : data, arquivada: conta?.arquivada ?? false,
        cartao: cartao ? { fechamento: dia(fechamento)!, vencimento: dia(vencimento)!, limite: lim || undefined, contaPagamentoId: pagadora || undefined } : undefined,
      },
    });
    aoFechar();
  }
  return (
    <Folha titulo={conta ? 'Editar conta' : 'Nova conta'} aoFechar={aoFechar}>
      <form onSubmit={salvar} noValidate className="form">
        <Campo rotulo="Nome" id="c-nome" erro={erro}>
          <input id="c-nome" value={nome} onChange={(e) => setNome(e.target.value)} placeholder="Ex.: Banco do Brasil PJ" />
        </Campo>
        <Campo rotulo="Tipo" id="c-tipo" ajuda={tipo === 'aplicacao' ? 'Aplicações aparecem separadas do dinheiro disponível no painel.' : cartao ? 'As compras entram na fatura e só saem do seu saldo quando você paga a fatura.' : undefined}>
          <select id="c-tipo" value={tipo} onChange={(e) => setTipo(e.target.value as TipoConta)}>
            {TIPOS_CONTA.map((t) => <option key={t.v} value={t.v}>{t.r}</option>)}
          </select>
        </Campo>
        {cartao ? (
          <>
            <div className="dias-cartao">
              <Campo rotulo="Fatura fecha no dia" id="c-fecha">
                <input id="c-fecha" inputMode="numeric" value={fechamento} onChange={(e) => setFechamento(e.target.value.replace(/\D/g, ''))} placeholder="Ex.: 3" />
              </Campo>
              <Campo rotulo="Fatura vence no dia" id="c-vence">
                <input id="c-vence" inputMode="numeric" value={vencimento} onChange={(e) => setVencimento(e.target.value.replace(/\D/g, ''))} placeholder="Ex.: 10" />
              </Campo>
            </div>
            <div className="grade-2">
              <Campo rotulo="Limite (R$, opcional)" id="c-limite">
                <input id="c-limite" inputMode="decimal" value={limite} onChange={(e) => setLimite(e.target.value)} placeholder="0,00" />
              </Campo>
              <Campo rotulo="Fatura paga pela conta" id="c-pagadora">
                <select id="c-pagadora" value={pagadora} onChange={(e) => setPagadora(e.target.value)}>
                  {pagadoras.map((c) => <option key={c.id} value={c.id}>{c.nome}</option>)}
                </select>
              </Campo>
            </div>
            <p className="ajuda">Compras do dia do fechamento em diante entram na fatura seguinte. Lance também as parcelas de compras antigas que ainda vão cair nas próximas faturas (ou importe a fatura do cartão em Extrato).</p>
          </>
        ) : (
        <>
        <div className="grade-2">
          <Campo rotulo="Saldo inicial (R$)" id="c-saldo">
            <input id="c-saldo" inputMode="decimal" value={saldo} onChange={(e) => setSaldo(e.target.value)} placeholder="0,00" />
          </Campo>
          <Campo rotulo="Saldo em" id="c-data">
            <input id="c-data" type="date" value={data} onChange={(e) => setData(e.target.value)} />
          </Campo>
        </div>
        <p className="ajuda">O saldo é o que havia na conta no início de {dataBR(data)}. Lançamentos antes dessa data não mexem no saldo.</p>
        </>
        )}
        <div className="acoes-form">
          {conta && (
            <button type="button" className="btn" onClick={() => { despachar({ t: 'conta', conta: { ...conta, arquivada: !conta.arquivada } }); aoFechar(); }}>
              {conta.arquivada ? 'Reativar conta' : 'Arquivar conta'}
            </button>
          )}
          <button type="submit" className="btn btn-primario btn-grande">Salvar</button>
        </div>
      </form>
    </Folha>
  );
}
