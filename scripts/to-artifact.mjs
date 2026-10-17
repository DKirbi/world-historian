// Turns dist-artifact/index.html (one self-contained page from `vite build --mode artifact`)
// into the body-only page format claude.ai artifacts expect, loading React and d3 from cdnjs.
import { readFileSync, writeFileSync } from 'node:fs';

const src = readFileSync('dist-artifact/index.html', 'utf8');
const pick = (re) => [...src.matchAll(re)].map((m) => m[0]);

const title = (src.match(/<title>[\s\S]*?<\/title>/) ?? ['<title>World History Timeline</title>'])[0];
const fontLinks = pick(/<link[^>]+fonts\.(googleapis|gstatic)\.com[^>]*>/g).join('\n');
const styles = pick(/<style[\s\S]*?<\/style>/g).join('\n');
const scripts = pick(/<script[\s\S]*?<\/script>/g)
  .map((s) => s.replace(/ crossorigin/g, ''))
  .join('\n');

const cdn = [
  'https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js',
]
  .map((u) => `<script src="${u}"></script>`)
  .join('\n');

const page = `${title}
<meta name="claude:viewport-fit-sides" content="cover">
${fontLinks}
${styles}
${cdn}
<div id="root"></div>
${scripts}
`;
writeFileSync('dist-artifact/world-history-timeline.html', page);
console.log(`artifact page: ${(page.length / 1024).toFixed(0)} KB`);
