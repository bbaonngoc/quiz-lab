// Development server only. Production is entirely static (GitHub Pages).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { resolve, extname, sep } from 'node:path';

const root = process.env.QUIZLAB_STATIC_ROOT || fileURLToPath(new URL('../', import.meta.url));
const port = Number(process.env.PORT || 4173);
const types = { '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml', '.png':'image/png', '.xlsx':'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' };
const server = createServer(async (request,response) => {
  try {
    let pathname = decodeURIComponent(new URL(request.url,'http://localhost').pathname);
    // The optional prefix lets browser checks verify GitHub Pages project URLs.
    if (pathname.startsWith('/quiz-app/')) pathname = pathname.slice('/quiz-app'.length);
    const file = resolve(root, `.${pathname.endsWith('/') ? `${pathname}index.html` : pathname}`);
    if (!file.startsWith(`${root.replace(/\/$/,'')}${sep}`) || pathname.split('/').some(part=>part.startsWith('.'))) throw new Error('Forbidden');
    const data = await readFile(file);
    response.writeHead(200,{'Content-Type':types[extname(file)] || 'application/octet-stream','Cache-Control':'no-cache'});
    response.end(data);
  } catch { response.writeHead(404,{'Content-Type':'text/plain'}); response.end('Not found'); }
});
server.listen(port,'127.0.0.1',()=>console.log(`QuizLab: http://127.0.0.1:${port}`));
for (const signal of ['SIGINT','SIGTERM']) process.on(signal,()=>server.close(()=>process.exit(0)));
