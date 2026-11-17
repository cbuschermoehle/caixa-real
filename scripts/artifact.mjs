// Gera uma página única (HTML + CSS + JS embutidos) para publicar a versão de teste.
import { readFileSync, readdirSync, writeFileSync, mkdirSync } from 'node:fs';
const dir = 'dist/assets';
const arquivos = readdirSync(dir);
const css = arquivos.filter((f) => f.endsWith('.css')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
const js = arquivos.filter((f) => f.endsWith('.js')).map((f) => readFileSync(`${dir}/${f}`, 'utf8')).join('\n');
const html = `<title>MicroCaixa Fácil</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,600..800&family=Manrope:wght@400..800&display=swap">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/g, '<\\/script')}</script>
`;
mkdirSync('artifact', { recursive: true });
writeFileSync('artifact/caixa-real.html', html);
console.log('artifact/caixa-real.html', (html.length / 1024).toFixed(0), 'KB');
