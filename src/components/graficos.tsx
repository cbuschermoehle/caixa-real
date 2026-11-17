import { useEffect, useRef, useState } from 'react';
import { brl, brlCurto, dataEixo } from '../lib/format';
import type { MesFuturo } from '../lib/futuro';

/** Escala "bonita" para o eixo: até ~4 marcas em múltiplos de 1, 2 ou 5. */
function marcas(max: number, min = 0): number[] {
  // Valores em centavos: escala mínima de R$ 100 para não repetir "0" no eixo quando está tudo zerado.
  if (max - min < 10_000) max = min + 10_000;
  const amp = max - min;
  const bruto = amp / 4;
  const pot = 10 ** Math.floor(Math.log10(bruto));
  const passo = [1, 2, 5, 10].map((m) => m * pot).find((p) => p >= bruto)!;
  const ini = Math.floor(min / passo) * passo;
  const out: number[] = [];
  for (let v = ini; v <= max + passo * 0.999; v += passo) out.push(v);
  if (out.length < 2) out.push(ini + passo);
  return out;
}

const A = 220;
const M = { t: 12, r: 8, b: 26, l: 52 };

/** Largura real do gráfico em pixels, para o texto dos eixos não encolher no celular. */
function useLargura() {
  const ref = useRef<HTMLElement>(null);
  const [w, setW] = useState(600);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setW(Math.max(280, Math.round(e.contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

const ROTULOS_PADRAO = { entradas: 'Entradas', saidas: 'Saídas', entrou: 'Entrou', saiu: 'Saiu' };

export function BarrasEntradaSaida({ dados, rotuloEixo, rotulos = ROTULOS_PADRAO }: { dados: { data: string; entradas: number; saidas: number }[]; rotuloEixo?: (d: string) => string; rotulos?: typeof ROTULOS_PADRAO }) {
  const [foco, setFoco] = useState<number | null>(null);
  const [ref, L] = useLargura();
  const max = Math.max(10_000, ...dados.flatMap((d) => [d.entradas, d.saidas]));
  const ys = marcas(max);
  const topo = ys[ys.length - 1];
  const w = L - M.l - M.r;
  const h = A - M.t - M.b;
  const y = (v: number) => M.t + h - (v / topo) * h;
  const passo = w / dados.length;
  const barra = Math.min(22, (passo - 6) / 2);
  const rot = rotuloEixo ?? dataEixo;
  const maxRotulos = Math.max(3, Math.floor(w / 56));
  const mostraRotulo = (i: number) => i % Math.ceil(dados.length / maxRotulos) === 0;
  const f = foco !== null ? dados[foco] : null;
  return (
    <figure className="grafico" ref={ref}>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label="Entradas e saídas por período" onMouseLeave={() => setFoco(null)}>
        {ys.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={L - M.r} y1={y(v)} y2={y(v)} className="grade" />
            <text x={M.l - 8} y={y(v) + 4} textAnchor="end" className="eixo">{brlCurto(v)}</text>
          </g>
        ))}
        {dados.map((d, i) => {
          const cx = M.l + passo * i + passo / 2;
          return (
            <g key={d.data} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)}>
              <rect x={M.l + passo * i} y={M.t} width={passo} height={h} fill="transparent" className={foco === i ? 'foco-coluna' : ''} />
              <rect x={cx - barra - 1} y={y(d.entradas)} width={barra} height={Math.max(0, y(0) - y(d.entradas))} rx="3" className="barra-entrada" />
              <rect x={cx + 1} y={y(d.saidas)} width={barra} height={Math.max(0, y(0) - y(d.saidas))} rx="3" className="barra-saida" />
              {mostraRotulo(i) && (
                <text x={cx} y={A - 8} textAnchor="middle" className="eixo">{rot(d.data)}</text>
              )}
            </g>
          );
        })}
      </svg>
      <figcaption className="legenda">
        {f ? (
          <>
            <strong>{rot(f.data)}</strong>
            <span className="chip-entrada">{rotulos.entrou} {brl(f.entradas)}</span>
            <span className="chip-saida">{rotulos.saiu} {brl(f.saidas)}</span>
          </>
        ) : (
          <>
            <span className="chip-entrada">{rotulos.entradas}</span>
            <span className="chip-saida">{rotulos.saidas}</span>
            <span className="ajuda">Toque numa barra para ver os valores</span>
          </>
        )}
      </figcaption>
    </figure>
  );
}

export function LinhaSaldo({ pontos, destaque, nome = 'Saldo projetado', eixo = dataEixo, dica = 'Passe o dedo no gráfico para ver cada dia' }: { pontos: { data: string; saldo: number }[]; destaque?: string | null; nome?: string; eixo?: (data: string) => string; dica?: string }) {
  const [foco, setFoco] = useState<number | null>(null);
  const [ref, L] = useLargura();
  const vals = pontos.map((p) => p.saldo);
  const ys = marcas(Math.max(0, ...vals), Math.min(0, ...vals));
  const lo = ys[0];
  const hi = ys[ys.length - 1];
  const w = L - M.l - M.r;
  const h = A - M.t - M.b;
  const x = (i: number) => M.l + (pontos.length === 1 ? w / 2 : (i / (pontos.length - 1)) * w);
  const y = (v: number) => M.t + h - ((v - lo) / (hi - lo)) * h;
  const linha = pontos.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.saldo).toFixed(1)}`).join('');
  const area = `${linha}L${x(pontos.length - 1).toFixed(1)},${y(Math.max(lo, 0)).toFixed(1)}L${x(0).toFixed(1)},${y(Math.max(lo, 0)).toFixed(1)}Z`;
  const cada = Math.ceil(pontos.length / Math.max(3, Math.floor(w / 80)));
  const ultimo = pontos.length - 1;
  const f = foco !== null ? pontos[foco] : pontos[ultimo];
  const iDestaque = destaque ? pontos.findIndex((p) => p.data === destaque) : -1;
  const mover = (e: React.MouseEvent<SVGSVGElement> | React.TouchEvent<SVGSVGElement>) => {
    const svg = e.currentTarget;
    const r = svg.getBoundingClientRect();
    const cx = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const px = ((cx - r.left) / r.width) * L;
    const i = Math.round(((px - M.l) / w) * (pontos.length - 1));
    setFoco(Math.max(0, Math.min(ultimo, i)));
  };
  return (
    <figure className="grafico" ref={ref}>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label={nome} onMouseMove={mover} onTouchMove={mover} onMouseLeave={() => setFoco(null)}>
        {ys.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={L - M.r} y1={y(v)} y2={y(v)} className={v === 0 ? 'grade-zero' : 'grade'} />
            <text x={M.l - 8} y={y(v) + 4} textAnchor="end" className="eixo">{brlCurto(v)}</text>
          </g>
        ))}
        <path d={area} className="area-saldo" />
        <path d={linha} className="linha-saldo" fill="none" />
        {pontos.map((p, i) =>
          i % cada === 0 || i === ultimo ? (
            <text key={p.data} x={Math.min(L - M.r - 14, Math.max(M.l + 14, x(i)))} y={A - 8} textAnchor="middle" className="eixo">{eixo(p.data)}</text>
          ) : null,
        )}
        {iDestaque >= 0 && <circle cx={x(iDestaque)} cy={y(pontos[iDestaque].saldo)} r="5" className="ponto-alerta" />}
        <circle cx={x(foco ?? ultimo)} cy={y(f.saldo)} r="4.5" className="ponto-saldo" />
      </svg>
      <figcaption className="legenda">
        <strong>{eixo(f.data)}</strong>
        <span className={f.saldo < 0 ? 'neg' : ''}>{nome} {brl(f.saldo)}</span>
        {foco === null && <span className="ajuda">{dica}</span>}
      </figcaption>
    </figure>
  );
}

/** Futuro: barras empilhadas do que já está comprometido em cada mês e a linha da renda prevista. */
export function BarrasFuturo({ meses, rotulo }: { meses: MesFuturo[]; rotulo: (mes: string) => string }) {
  const [foco, setFoco] = useState<number | null>(null);
  const [ref, L] = useLargura();
  const totalBarra = (m: (typeof meses)[number]) => Math.max(0, m.essenciais) + Math.max(0, m.dividas) + Math.max(0, m.parcelasCartao) + Math.max(0, m.outros);
  const max = Math.max(10_000, ...meses.flatMap((m) => [totalBarra(m), m.renda]));
  const ys = marcas(max);
  const topo = ys[ys.length - 1];
  const w = L - M.l - M.r;
  const h = A - M.t - M.b;
  const y = (v: number) => M.t + h - (v / topo) * h;
  const passo = w / meses.length;
  const barra = Math.min(34, passo - 6);
  const cx = (i: number) => M.l + passo * i + passo / 2;
  const cada = Math.ceil(meses.length / Math.max(3, Math.floor(w / 52)));
  const comRenda = meses.map((m, i) => ({ m, i })).filter(({ m }) => m.renda > 0);
  const linha = comRenda.map(({ m, i }, k) => `${k ? 'L' : 'M'}${cx(i).toFixed(1)},${y(m.renda).toFixed(1)}`).join('');
  const f = foco !== null ? meses[foco] : null;
  const CLASSES = { essenciais: 'barra-essenciais', dividas: 'barra-dividas', parcelasCartao: 'barra-parcelas', outros: 'barra-outros' } as const;
  return (
    <figure className="grafico" ref={ref}>
      <svg viewBox={`0 0 ${L} ${A}`} role="img" aria-label="Renda comprometida por mês" onMouseLeave={() => setFoco(null)}>
        {ys.map((v) => (
          <g key={v}>
            <line x1={M.l} x2={L - M.r} y1={y(v)} y2={y(v)} className="grade" />
            <text x={M.l - 8} y={y(v) + 4} textAnchor="end" className="eixo">{brlCurto(v)}</text>
          </g>
        ))}
        {meses.map((m, i) => {
          let base = 0;
          const partes = (Object.keys(CLASSES) as (keyof typeof CLASSES)[]).map((k) => {
            const v = Math.max(0, m[k]);
            const y1 = y(base + v);
            const alt = y(base) - y1;
            base += v;
            return v > 0 ? <rect key={k} x={cx(i) - barra / 2} y={y1} width={barra} height={Math.max(0, alt)} className={CLASSES[k]} /> : null;
          });
          return (
            <g key={m.mes} onMouseEnter={() => setFoco(i)} onClick={() => setFoco(i)}>
              <rect x={M.l + passo * i} y={M.t} width={passo} height={h} fill="transparent" className={foco === i ? 'foco-coluna' : ''} />
              {partes}
              {i % cada === 0 && <text x={cx(i)} y={A - 8} textAnchor="middle" className="eixo">{rotulo(m.mes)}</text>}
            </g>
          );
        })}
        {comRenda.length > 1 && <path d={linha} className="linha-renda" />}
        {comRenda.map(({ m, i }) => <circle key={m.mes} cx={cx(i)} cy={y(m.renda)} r="3.5" className="ponto-renda" />)}
      </svg>
      <figcaption className="legenda legenda-futuro">
        {f ? (
          <>
            <strong>{rotulo(f.mes)}</strong>
            <span>Renda {brl(f.renda)}</span>
            <span><i className="chip-cor c-essenciais" />Essenciais {brl(f.essenciais)}</span>
            <span><i className="chip-cor c-dividas" />Dívidas {brl(f.dividas)}</span>
            <span><i className="chip-cor c-parcelas" />Parcelas no cartão {brl(f.parcelasCartao)}</span>
            {f.outros > 0 && <span><i className="chip-cor c-outros" />Outros {brl(f.outros)}</span>}
          </>
        ) : (
          <>
            <span><i className="chip-cor c-renda" />Renda prevista</span>
            <span><i className="chip-cor c-essenciais" />Essenciais</span>
            <span><i className="chip-cor c-dividas" />Dívidas</span>
            <span><i className="chip-cor c-parcelas" />Parcelas no cartão</span>
            <span><i className="chip-cor c-outros" />Outros já lançados</span>
            <span className="ajuda">Toque num mês para ver os valores</span>
          </>
        )}
      </figcaption>
    </figure>
  );
}
