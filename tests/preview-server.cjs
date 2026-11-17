const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '..');
const mime = {
  '.html': 'text/html', '.js': 'application/javascript', '.css': 'text/css',
  '.md': 'text/markdown', '.webmanifest': 'application/manifest+json',
  '.png': 'image/png', '.svg': 'image/svg+xml'
};
http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://localhost').pathname;
  if (pathname === '/__preview/app.html') {
    const html = fs.readFileSync(path.join(root, 'app.html'), 'utf8')
      .replace('<head>', '<head><base href="/">')
      .replace('<script src="app.js"></script>', '<script src="tests/preview-fixture.js"></script><script src="app.js"></script>')
      .replace('<script defer src="/_vercel/insights/script.js"></script>', '');
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(html);
    return;
  }
  const target = path.resolve(root, `.${decodeURIComponent(pathname === '/' ? '/index.html' : pathname)}`);
  if (!target.startsWith(root + path.sep) || !fs.existsSync(target) || !fs.statSync(target).isFile()) {
    response.writeHead(404); response.end('Not found'); return;
  }
  response.writeHead(200, { 'Content-Type': `${mime[path.extname(target)] || 'application/octet-stream'}; charset=utf-8`, 'Cache-Control': 'no-store' });
  fs.createReadStream(target).pipe(response);
}).listen(8766, '127.0.0.1', () => console.log('Preview ready: http://127.0.0.1:8766/__preview/app.html'));
