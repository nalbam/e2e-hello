import http from 'node:http';
import { createMemoryStore } from './store.js';
import { todosPage } from './todos-page.js';

export const MAX_BODY_BYTES = 16 * 1024;
const MAX_TITLE_LENGTH = 200;
const JSON_TYPE = 'application/json; charset=utf-8';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'content-type': JSON_TYPE,
    'content-length': Buffer.byteLength(body),
    ...headers,
  });
  res.end(body);
}

function methodNotAllowed(res, allow, json = true) {
  if (json) {
    sendJson(res, 405, { error: 'method not allowed' }, { allow });
  } else {
    res.writeHead(405, { allow });
    res.end();
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const declared = Number(req.headers['content-length']);
    if (declared > MAX_BODY_BYTES) {
      req.resume();
      reject(new HttpError(413, 'request body too large'));
      return;
    }
    const chunks = [];
    let size = 0;
    let rejected = false;
    req.on('data', (chunk) => {
      if (rejected) return;
      size += chunk.length;
      if (size > MAX_BODY_BYTES) {
        rejected = true;
        reject(new HttpError(413, 'request body too large'));
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      if (rejected) return;
      const text = Buffer.concat(chunks).toString('utf8');
      try {
        resolve(JSON.parse(text));
      } catch {
        reject(new HttpError(400, 'invalid JSON'));
      }
    });
    req.on('error', (err) => {
      if (!rejected) reject(err);
    });
  });
}

function requireObject(body) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    throw new HttpError(400, 'body must be a JSON object');
  }
  return body;
}

function validateTitle(value) {
  if (typeof value !== 'string') throw new HttpError(400, 'title must be a string');
  const title = value.trim();
  if (title.length < 1 || title.length > MAX_TITLE_LENGTH) {
    throw new HttpError(400, `title must be 1-${MAX_TITLE_LENGTH} characters`);
  }
  return title;
}

function parseId(segment) {
  if (!/^[1-9][0-9]*$/.test(segment)) return null;
  const id = Number(segment);
  return Number.isSafeInteger(id) ? id : null;
}

async function handleHealth(req, res, store) {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET', false);
  const ok = await store.health();
  if (ok) sendJson(res, 200, { ok: true, storage: store.kind });
  else sendJson(res, 503, { ok: false });
}

async function handleTodos(req, res, store) {
  if (req.method === 'GET') {
    return sendJson(res, 200, await store.list());
  }
  if (req.method === 'POST') {
    const body = requireObject(await readJson(req));
    const todo = await store.create(validateTitle(body.title));
    return sendJson(res, 201, todo);
  }
  return methodNotAllowed(res, 'GET, POST');
}

async function handleTodo(req, res, store, id) {
  if (req.method === 'PATCH') {
    const body = requireObject(await readJson(req));
    const patch = {};
    if (body.title !== undefined) patch.title = validateTitle(body.title);
    if (body.done !== undefined) {
      if (typeof body.done !== 'boolean') throw new HttpError(400, 'done must be a boolean');
      patch.done = body.done;
    }
    if (Object.keys(patch).length === 0) throw new HttpError(400, 'title or done is required');
    const todo = await store.update(id, patch);
    if (!todo) throw new HttpError(404, 'not found');
    return sendJson(res, 200, todo);
  }
  if (req.method === 'DELETE') {
    if (!(await store.remove(id))) throw new HttpError(404, 'not found');
    res.writeHead(204);
    res.end();
    return;
  }
  return methodNotAllowed(res, 'PATCH, DELETE');
}

function handleTodosPage(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return methodNotAllowed(res, 'GET, HEAD', false);
  res.writeHead(200, {
    'content-type': 'text/html; charset=utf-8',
    'content-length': Buffer.byteLength(todosPage),
    'cache-control': 'no-store',
  });
  res.end(req.method === 'HEAD' ? undefined : todosPage);
}

async function route(req, res, store) {
  const { pathname } = new URL(req.url ?? '/', 'http://localhost');

  if (pathname === '/health') return handleHealth(req, res, store);
  if (pathname === '/todos') return handleTodosPage(req, res);
  if (pathname === '/api/todos') return handleTodos(req, res, store);

  const match = /^\/api\/todos\/([^/]+)$/.exec(pathname);
  if (match) {
    const id = parseId(match[1]);
    if (id === null) throw new HttpError(404, 'not found');
    return handleTodo(req, res, store, id);
  }

  res.writeHead(404);
  res.end();
}

export function createServer({ store = createMemoryStore() } = {}) {
  return http.createServer((req, res) => {
    route(req, res, store).catch((err) => {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (err instanceof HttpError) {
        const headers = err.status === 413 ? { connection: 'close' } : {};
        sendJson(res, err.status, { error: err.message }, headers);
        return;
      }
      console.error(`request failed (${err.code ?? err.name ?? 'unknown'})`);
      sendJson(res, 500, { error: 'internal error' });
    });
  });
}
