import http from 'node:http';
import { homeHtml } from './home.js';

export function createServer() {
  return http.createServer((req, res) => {
    const { pathname } = new URL(req.url ?? '/', 'http://localhost');

    if (pathname === '/') {
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        res.writeHead(405, { allow: 'GET, HEAD' });
        res.end();
        return;
      }
      res.writeHead(200, {
        'content-type': 'text/html; charset=utf-8',
        'content-length': Buffer.byteLength(homeHtml),
      });
      res.end(req.method === 'HEAD' ? undefined : homeHtml);
      return;
    }

    if (pathname === '/health') {
      if (req.method !== 'GET') {
        res.writeHead(405, { allow: 'GET' });
        res.end();
        return;
      }
      const body = JSON.stringify({ ok: true });
      res.writeHead(200, {
        'content-type': 'application/json',
        'content-length': Buffer.byteLength(body),
      });
      res.end(body);
      return;
    }

    res.writeHead(404);
    res.end();
  });
}
