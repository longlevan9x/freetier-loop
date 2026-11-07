import { existsSync, mkdirSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from '../app';
import { createDefaultDeps } from '../platform/deps';
import {
  applyMigrationsToD1,
  createAppDatabase,
  createSqliteD1Binding,
} from '../platform/sqlite-d1';

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

export const createNodeRuntimeApp = async (options?: {
  dbPath?: string;
  env?: Record<string, unknown>;
  fetchFn?: typeof fetch;
}) => {
  const dbPath = options?.dbPath ?? process.env.SQLITE_DB_PATH ?? ':memory:';
  if (dbPath !== ':memory:') {
    mkdirSync(dirname(resolve(dbPath)), { recursive: true });
  }
  const d1 = createSqliteD1Binding(dbPath);
  await applyMigrationsToD1(d1);
  const db = createAppDatabase(d1);
  const deps = createDefaultDeps(options?.env ?? process.env, {
    db,
    ...(options?.fetchFn ? { fetchFn: options.fetchFn } : {}),
  });
  const app = createApp(deps);
  return { app, deps, db };
};

const serveStaticOrSpa = (webDistDir: string, pathname: string): Response | null => {
  if (!existsSync(webDistDir)) {
    return null;
  }
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const candidate = join(webDistDir, safePath);
  if (existsSync(candidate) && statSync(candidate).isFile()) {
    const ext = extname(candidate).toLowerCase();
    const contentType = MIME_TYPES[ext] ?? 'application/octet-stream';
    return new Response(readFileSync(candidate), {
      status: 200,
      headers: { 'content-type': contentType },
    });
  }
  const indexHtml = join(webDistDir, 'index.html');
  if (existsSync(indexHtml)) {
    return new Response(readFileSync(indexHtml), {
      status: 200,
      headers: { 'content-type': 'text/html; charset=utf-8' },
    });
  }
  return null;
};

const isMainModule =
  Boolean(process.argv[1]) &&
  pathToFileURL(resolve(process.argv[1] ?? '')).href === import.meta.url;

if (isMainModule) {
  const port = Number.parseInt(process.env.PORT ?? '8787', 10);
  const webDistDir = resolve(import.meta.dirname, '../../../web/dist');

  createNodeRuntimeApp().then(({ app, deps }) => {
    const server = createServer(async (req, res) => {
      try {
        const url = new URL(req.url ?? '/', `http://${req.headers.host ?? `localhost:${port}`}`);
        if (!url.pathname.startsWith('/api/')) {
          const staticRes = serveStaticOrSpa(webDistDir, url.pathname);
          if (staticRes) {
            res.writeHead(staticRes.status, Object.fromEntries(staticRes.headers.entries()));
            const buf = Buffer.from(await staticRes.arrayBuffer());
            res.end(buf);
            return;
          }
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
        }
        const bodyBuffer = Buffer.concat(chunks);

        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers)) {
          if (typeof v === 'string') headers.set(k, v);
          else if (Array.isArray(v)) headers.set(k, v.join(', '));
        }

        const method = req.method ?? 'GET';
        const request = new Request(url.toString(), {
          method,
          headers,
          ...(method !== 'GET' && method !== 'HEAD' && bodyBuffer.length > 0
            ? { body: bodyBuffer }
            : {}),
        });

        const response = await app.fetch(request);
        res.writeHead(response.status, Object.fromEntries(response.headers.entries()));
        const respBuf = Buffer.from(await response.arrayBuffer());
        res.end(respBuf);
      } catch (err) {
        deps.platform.logger.error('Node server error', {
          error: err instanceof Error ? err.message : 'unknown',
        });
        res.writeHead(500, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ error: { code: 'INTERNAL_ERROR', message: 'Internal Error' } }));
      }
    });

    server.listen(port, () => {
      deps.platform.logger.info(`freetier-loop Node server listening on http://localhost:${port}`);
    });
  });
}
