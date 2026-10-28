export async function onRequest({ request, env }) {
  let backend;
  try {
    backend = new URL(env.BACKEND_ORIGIN);
  } catch {
    return Response.json({ error: 'API backend is not configured.' }, { status: 503 });
  }

  if (backend.protocol !== 'https:' || backend.username || backend.password || backend.pathname !== '/') {
    return Response.json({ error: 'API backend configuration is invalid.' }, { status: 500 });
  }

  const pageUrl = new URL(request.url);
  const origin = request.headers.get('Origin');
  if (origin) {
    try {
      if (new URL(origin).origin !== pageUrl.origin) {
        return Response.json({ error: 'Cross-origin requests are not allowed.' }, { status: 403 });
      }
    } catch {
      return Response.json({ error: 'Invalid request origin.' }, { status: 403 });
    }
  }

  if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
      request.headers.get('Sec-Fetch-Site') === 'cross-site') {
    return Response.json({ error: 'Cross-site requests are not allowed.' }, { status: 403 });
  }

  const target = new URL(pageUrl.pathname + pageUrl.search, backend.origin);
  const headers = new Headers(request.headers);
  headers.delete('Host');
  headers.set('Origin', backend.origin);

  const upstream = new Request(target, {
    method: request.method,
    headers,
    body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    duplex: request.body ? 'half' : undefined,
    redirect: 'manual',
  });

  return fetch(upstream);
}
