const ENDPOINT = '/api/remove-background';
const CACHE_NAME = 'koleni-removebg-v1';

async function readError(response) {
  try {
    const payload = await response.json();
    return payload?.error || 'Não foi possível remover o fundo com remove.bg.';
  } catch {
    try {
      const text = await response.text();
      return text || 'Não foi possível remover o fundo com remove.bg.';
    } catch {
      return 'Não foi possível remover o fundo com remove.bg.';
    }
  }
}

async function shortHash(value) {
  if (!globalThis.crypto?.subtle) return encodeURIComponent(String(value)).slice(0, 120);
  const data = new TextEncoder().encode(String(value));
  const digest = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

async function cacheRequestFor(key) {
  const hash = await shortHash(key);
  return new Request(`${location.origin}/__removebg-cache__/${hash}`);
}

async function readCachedResult(key) {
  if (!('caches' in window) || !key) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const request = await cacheRequestFor(key);
    const response = await cache.match(request);
    if (!response) return null;
    const blob = await response.blob();
    if (!blob?.size) return null;
    return {
      blob,
      creditsCharged: '0',
      detectedType: response.headers.get('x-removebg-type') || '',
      cached: true,
    };
  } catch {
    return null;
  }
}

async function cacheResult(key, blob, metadata = {}) {
  if (!('caches' in window) || !key || !blob?.size) return;
  try {
    const cache = await caches.open(CACHE_NAME);
    const request = await cacheRequestFor(key);
    const response = new Response(blob, {
      headers: {
        'Content-Type': 'image/png',
        'X-Removebg-Type': metadata.detectedType || '',
        'Cache-Control': 'public, max-age=2592000',
      },
    });
    await cache.put(request, response);
  } catch {
    // Cache é apenas uma otimização. Falhas não impedem a remoção.
  }
}

export async function removeBackgroundWithRemoveBg(source, options = {}) {
  if (!source) throw new Error('Logo inválida.');

  const cacheKey = options.cacheKey || source;
  const cached = await readCachedResult(cacheKey);
  if (cached) return cached;

  const sourceResponse = await fetch(source, { cache: 'no-store' });
  if (!sourceResponse.ok) throw new Error('Não foi possível carregar a logo selecionada.');
  const inputBlob = await sourceResponse.blob();

  if (!['image/png', 'image/jpeg', 'image/webp'].includes(inputBlob.type)) {
    throw new Error('O remove.bg aceita nesta tela apenas PNG, JPG ou WEBP.');
  }

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': inputBlob.type,
      'X-Source-Name': 'koleni-logo',
    },
    body: inputBlob,
  });

  if (!response.ok) {
    const message = await readError(response);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const blob = await response.blob();
  if (!blob?.size) throw new Error('O remove.bg retornou uma imagem vazia.');

  const result = {
    blob,
    creditsCharged: response.headers.get('x-removebg-credits-charged') || '',
    detectedType: response.headers.get('x-removebg-type') || '',
    cached: false,
  };

  await cacheResult(cacheKey, blob, result);
  return result;
}
