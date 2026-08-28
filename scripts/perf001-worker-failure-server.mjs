import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const root = path.resolve(import.meta.dirname, '..');
const mimeTypes = new Map([
  ['.html', 'text/html; charset=utf-8'], ['.js', 'text/javascript; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'], ['.png', 'image/png'], ['.woff2', 'font/woff2'], ['.ttf', 'font/ttf']
]);

const server = http.createServer((request, response) => {
  const pathname = new URL(request.url, 'http://127.0.0.1').pathname;
  if(pathname === '/pixelate-worker.js'){
    response.writeHead(503, { 'Content-Type':'text/plain; charset=utf-8', 'Cache-Control':'no-store' });
    response.end('PERF-001 intentional Worker failure fixture');
    return;
  }
  const relativePath = pathname === '/' ? 'pixelate_studio.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const filePath = path.resolve(root, relativePath);
  if(!filePath.startsWith(`${root}${path.sep}`) || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()){
    response.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
    response.end('Not found');
    return;
  }
  response.writeHead(200, {
    'Content-Type':mimeTypes.get(path.extname(filePath)) || 'application/octet-stream',
    'Cache-Control':'no-store'
  });
  fs.createReadStream(filePath).pipe(response);
});

server.listen(8001, '127.0.0.1', () => {
  console.log('PERF-001 Worker failure server: http://127.0.0.1:8001/');
});
