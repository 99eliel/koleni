import { auth } from './firebase';

const ENDPOINT = '/api/remove-background';
const CACHE_NAME = 'koleni-removebg-v2';

async function readError(response) {
  // O corpo de uma Response só pode ser lido uma vez. Em falhas HTML da
  // hospedagem/Cloud Run, tentar json() e depois text() ocultava o erro real.
  const body = await response.text().catch(() => '');
  let payload = null;
  try {
    if (body) payload = JSON.parse(body);
  } catch {
    // Firebase Hosting e Cloud Run podem devolver uma página HTML de erro.
  }
  const detail = payload?.error || payload?.message || payload?.errors?.[0]?.title;
  if (typeof detail === 'string' && detail.trim()) return detail.trim();

  const contentType = String(response.headers.get('content-type') || '').toLowerCase();
  if (contentType.includes('text/html') || /^\s*<(?:!doctype|html)/i.test(body)) {
    return response.status === 404
      ? 'A rota do remove.bg não foi publicada no Firebase Hosting (HTTP 404). Publique o firebase.json principal, não firebase.hosting-only.json.'
      : response.status === 403
        ? 'A função foi bloqueada antes de processar a imagem (HTTP 403). Confira as permissões de invocação no Cloud Run.'
        : 'O servidor devolveu uma página HTML, não a resposta da API. Verifique o rewrite /api/remove-background no Firebase Hosting.';
  }
  if (response.status === 401) return 'Sessão não autorizada (HTTP 401). Saia do Koleni e entre novamente.';
  if (response.status === 403) return 'Acesso negado (HTTP 403). Verifique a conta da equipe e a permissão da função.';
  if (response.status === 404) return 'Função removeBackground não encontrada (HTTP 404). Reimplante o Hosting com o firebase.json principal.';
  if (response.status === 429) return 'Limite de requisições do remove.bg atingido (HTTP 429). Tente novamente mais tarde.';
  if (response.status === 502 || response.status === 503) return `Serviço remove.bg indisponível ou não configurado (HTTP ${response.status}). Confira os logs da Cloud Function.`;
  return `Falha ao remover o fundo (HTTP ${response.status}). Consulte os logs da função removeBackground.`;
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

// Validar os bytes e a decodificação: o fallback do Hosting pode responder
// HTTP 200 com index.html, que versões antigas salvaram incorretamente
// como PNG no Cache Storage.
async function isValidPng(blob) {
  if (!blob || blob.size < 33) return false;
  try {
    const header = new Uint8Array(await blob.slice(0, 24).arrayBuffer());
    const pngSignature = [137, 80, 78, 71, 13, 10, 26, 10];
    if (!pngSignature.every((byte, index) => header[index] === byte)) return false;
    if (String.fromCharCode(...header.slice(12, 16)) !== 'IHDR') return false;
    if (typeof createImageBitmap === 'function') {
      const bitmap = await createImageBitmap(blob);
      const valid = bitmap.width > 0 && bitmap.height > 0;
      bitmap.close?.();
      return valid;
    }
    // Fallback para navegadores sem createImageBitmap.
    const url = URL.createObjectURL(blob);
    try {
      return await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img.naturalWidth > 0 && img.naturalHeight > 0);
        img.onerror = () => resolve(false);
        img.src = url;
      });
    } finally {
      URL.revokeObjectURL(url);
    }
  } catch {
    return false;
  }
}

async function readCachedResult(key) {
  if (!('caches' in window) || !key) return null;
  try {
    const cache = await caches.open(CACHE_NAME);
    const request = await cacheRequestFor(key);
    const response = await cache.match(request);
    if (!response) return null;
    const blob = await response.blob();
    if (!await isValidPng(blob)) {
      await cache.delete(request);
      return null;
    }
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

  const user = auth.currentUser;
  if (!user || user.isAnonymous) {
    throw new Error('Entre com sua conta da equipe Koleni para usar a remoção de fundo com IA.');
  }
  const idToken = await user.getIdToken();

  let sourceResponse;
  try {
    sourceResponse = await fetch(source, { cache: 'no-store' });
  } catch {
    throw new Error('Não foi possível carregar a logo do armazenamento. Verifique as permissões CORS do Firebase Storage.');
  }
  if (!sourceResponse.ok) throw new Error(`Não foi possível carregar a logo (HTTP ${sourceResponse.status}).`);
  const inputBlob = await sourceResponse.blob();

  if (!['image/png', 'image/jpeg', 'image/webp'].includes(inputBlob.type)) {
    throw new Error('O remove.bg aceita nesta tela apenas PNG, JPG ou WEBP.');
  }

  const response = await fetch(ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': inputBlob.type,
      'X-Source-Name': 'koleni-logo',
      Authorization: `Bearer ${idToken}`,
    },
    body: inputBlob,
  });

  if (!response.ok) {
    const message = await readError(response);
    const error = new Error(message);
    error.status = response.status;
    throw error;
  }

  const responseType = String(response.headers.get('content-type') || '').toLowerCase();
  if (!responseType.startsWith('image/png')) {
    throw new Error('A rota /api/remove-background devolveu uma resposta que não é PNG. Provavelmente o Hosting está servindo o site em vez da função. Reimplante com o firebase.json principal.');
  }

  const blob = await response.blob();
  if (!blob?.size) throw new Error('O remove.bg retornou uma imagem vazia.');
  if (!await isValidPng(blob)) {
    throw new Error('O servidor retornou dados inválidos no lugar de uma imagem PNG. Verifique a rota /api/remove-background e o Hosting do Firebase.');
  }

  const result = {
    blob,
    creditsCharged: response.headers.get('x-removebg-credits-charged') || '',
    detectedType: response.headers.get('x-removebg-type') || '',
    cached: false,
  };

  await cacheResult(cacheKey, blob, result);
  return result;
}
