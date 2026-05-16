// Cloudflare Worker — Comments backend for ahmadali.net
// Bindings required:
//   - COMMENTS_KV (KV Namespace)
//   - ADMIN_TOKEN (Secret — used to delete spam comments)

const ALLOWED_ORIGINS = [
  'https://ahmadali.net',
  'https://www.ahmadali.net',
  'https://ahmad-abdullah-ali.github.io',
];

const RATE_LIMIT_WINDOW_SECONDS = 60;
const MAX_NAME_LENGTH = 50;
const MAX_COMMENT_LENGTH = 2000;
const MIN_COMMENT_LENGTH = 2;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin') || '';
    const cors = corsHeadersFor(origin);

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors });
    }

    try {
      if (url.pathname === '/api/comments' && request.method === 'POST') {
        return await handleCreate(request, env, cors);
      }
      if (url.pathname === '/api/comments' && request.method === 'GET') {
        return await handleList(request, env, cors);
      }
      if (url.pathname.startsWith('/api/admin/delete/') && request.method === 'POST') {
        return await handleDelete(request, env, cors);
      }
      return json({ error: 'Not found' }, 404, cors);
    } catch (err) {
      return json({ error: 'Server error' }, 500, cors);
    }
  },
};

function corsHeadersFor(origin) {
  const allowed = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Max-Age': '86400',
    'Vary': 'Origin',
  };
}

function json(data, status, cors) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json; charset=utf-8' },
  });
}

async function handleCreate(request, env, cors) {
  const body = await request.json().catch(() => ({}));
  const name = String(body.name || '').trim();
  const comment = String(body.comment || '').trim();
  const postId = String(body.postId || '').trim();
  const honeypot = String(body.website || '').trim();

  // Silently succeed on honeypot trigger (don't reveal it to bots)
  if (honeypot) return json({ ok: true }, 200, cors);

  if (!postId || !/^[a-z0-9\-_]+$/i.test(postId)) {
    return json({ error: 'postId غير صالح' }, 400, cors);
  }
  if (!name || name.length > MAX_NAME_LENGTH) {
    return json({ error: 'الاسم مطلوب ولا يتجاوز 50 حرفاً' }, 400, cors);
  }
  if (!comment || comment.length < MIN_COMMENT_LENGTH || comment.length > MAX_COMMENT_LENGTH) {
    return json({ error: 'التعليق مطلوب (2 - 2000 حرف)' }, 400, cors);
  }

  // Rate limit by IP
  const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
  const rateKey = `rl:${ip}`;
  const blocked = await env.COMMENTS_KV.get(rateKey);
  if (blocked) {
    return json({ error: 'الرجاء الانتظار قبل إرسال تعليق آخر' }, 429, cors);
  }
  await env.COMMENTS_KV.put(rateKey, '1', { expirationTtl: RATE_LIMIT_WINDOW_SECONDS });

  const id = crypto.randomUUID();
  const createdAt = Date.now();
  const key = `comment:${postId}:${String(createdAt).padStart(15, '0')}:${id}`;
  const record = { id, name, comment, postId, createdAt };
  await env.COMMENTS_KV.put(key, JSON.stringify(record));

  return json({ ok: true, comment: record }, 200, cors);
}

async function handleList(request, env, cors) {
  const url = new URL(request.url);
  const postId = url.searchParams.get('postId') || '';
  if (!postId || !/^[a-z0-9\-_]+$/i.test(postId)) {
    return json({ error: 'postId مطلوب' }, 400, cors);
  }

  const prefix = `comment:${postId}:`;
  const list = await env.COMMENTS_KV.list({ prefix });
  const values = await Promise.all(list.keys.map(k => env.COMMENTS_KV.get(k.name, 'json')));
  const comments = values
    .filter(Boolean)
    .sort((a, b) => b.createdAt - a.createdAt);

  return json({ comments }, 200, cors);
}

async function handleDelete(request, env, cors) {
  const url = new URL(request.url);
  const token = url.searchParams.get('token') || '';
  if (!env.ADMIN_TOKEN || token !== env.ADMIN_TOKEN) {
    return json({ error: 'Unauthorized' }, 401, cors);
  }
  const id = url.pathname.split('/').pop();
  if (!id) return json({ error: 'Missing id' }, 400, cors);

  const list = await env.COMMENTS_KV.list({ prefix: 'comment:' });
  for (const key of list.keys) {
    if (key.name.endsWith(':' + id)) {
      await env.COMMENTS_KV.delete(key.name);
      return json({ ok: true }, 200, cors);
    }
  }
  return json({ error: 'Comment not found' }, 404, cors);
}
