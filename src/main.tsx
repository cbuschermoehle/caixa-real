import { StrictMode, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { ProvedorDados } from './data/store';
import { App } from './App';
import './estilo.css';

document.documentElement.lang = 'pt-BR';

const raiz = createRoot(document.getElementById('root')!);
const mostrar = (n: ReactNode) => raiz.render(<StrictMode>{n}</StrictMode>);

if (import.meta.env.VITE_SUPABASE_URL) {
  // Versão publicada: login e dados na nuvem.
  import('./Nuvem').then(({ Nuvem }) => mostrar(<Nuvem />));
} else {
  // Versão de teste: dados só neste navegador.
  mostrar(
    <ProvedorDados>
      <App />
    </ProvedorDados>,
  );
}

// Modo app instalável (PWA): só quando aberto direto no navegador, fora de molduras.
if ('serviceWorker' in navigator && import.meta.env.PROD && window.self === window.top && location.protocol === 'https:') {
  navigator.serviceWorker.register('./sw.js').catch(() => undefined);
}
