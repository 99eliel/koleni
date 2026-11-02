import { defineSecret } from 'firebase-functions/params';
import { onRequest } from 'firebase-functions/v2/https';

const REMOVE_BG_API_KEY = defineSecret('REMOVE_BG_API_KEY');
const MAX_INPUT_BYTES = 8 * 1024 * 1024;
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp']);

function sendJson(res, status, body) {
  res.status(status);
  res.set('Cache-Control', 'no-store');
  res.set('Content-Type', 'application/json; charset=utf-8');
  res.send(JSON.stringify(body));
}

function removeBgErrorMessage(payload, fallback) {
  const title = payload?.errors?.[0]?.title;
  if (title) return title;
  return fallback || 'O remove.bg não conseguiu processar esta imagem.';
}

export const removeBackground = onRequest(
  {
    region: 'southamerica-east1',
    memory: '512MiB',
    timeoutSeconds: 60,
    secrets: [REMOVE_BG_API_KEY],
  },
  async (req, res) => {
    if (req.method !== 'POST') {
      res.set('Allow', 'POST');
      return sendJson(res, 405, { error: 'Use POST para remover o fundo.' });
    }

    const contentType = String(req.headers['content-type'] || '').split(';')[0].trim().toLowerCase();
    if (!ALLOWED_TYPES.has(contentType)) {
      return sendJson(res, 415, { error: 'Envie uma imagem PNG, JPG ou WEBP.' });
    }

    const input = req.rawBody;
    if (!Buffer.isBuffer(input) || input.length === 0) {
      return sendJson(res, 400, { error: 'A imagem não foi recebida pelo servidor.' });
    }
    if (input.length > MAX_INPUT_BYTES) {
      return sendJson(res, 413, { error: 'A imagem deve ter no máximo 8 MB para o remove.bg.' });
    }

    const apiKey = REMOVE_BG_API_KEY.value();
    if (!apiKey) {
      return sendJson(res, 503, {
        error: 'A chave do remove.bg ainda não foi configurada no servidor.',
        code: 'REMOVE_BG_KEY_MISSING',
      });
    }

    try {
      const form = new FormData();
      const extension = contentType === 'image/jpeg' ? 'jpg' : contentType.split('/')[1];
      form.append('image_file', new Blob([input], { type: contentType }), `logo.${extension}`);
      form.append('size', 'preview');
      form.append('type', 'graphic');
      form.append('format', 'png');
      form.append('crop', 'true');
      form.append('channels', 'rgba');

      const response = await fetch('https://api.remove.bg/v1.0/removebg', {
        method: 'POST',
        headers: {
          'X-Api-Key': apiKey,
        },
        body: form,
      });

      if (!response.ok) {
        let payload = null;
        let fallback = '';
        try {
          payload = await response.json();
        } catch {
          fallback = await response.text().catch(() => '');
        }

        return sendJson(res, response.status, {
          error: removeBgErrorMessage(payload, fallback),
          code: 'REMOVE_BG_UPSTREAM_ERROR',
        });
      }

      const output = Buffer.from(await response.arrayBuffer());
      const creditsCharged = response.headers.get('x-credits-charged') || '';
      const detectedType = response.headers.get('x-type') || '';

      res.status(200);
      res.set('Content-Type', 'image/png');
      res.set('Cache-Control', 'no-store');
      if (creditsCharged) res.set('X-Removebg-Credits-Charged', creditsCharged);
      if (detectedType) res.set('X-Removebg-Type', detectedType);
      res.send(output);
    } catch (error) {
      console.error('remove.bg request failed', error);
      return sendJson(res, 502, {
        error: 'Não foi possível conectar ao remove.bg agora. Tente novamente.',
        code: 'REMOVE_BG_NETWORK_ERROR',
      });
    }
  },
);
