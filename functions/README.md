# Integração remove.bg

A API key fica somente no Firebase Functions e nunca é enviada para o navegador.

## Configurar a chave

```bash
firebase functions:secrets:set REMOVE_BG_API_KEY
```

Cole a chave criada em **remove.bg > My Account > API Keys**.

## Instalar dependências e publicar

Na raiz do projeto:

```bash
npm --prefix functions install
npm install
npm run build
firebase deploy --only functions,hosting
```

A função usa sempre:

- `size=preview` (até 0,25 MP)
- `type=graphic`
- `format=png`
- `crop=true`
- `channels=rgba`

O endpoint público do app é `POST /api/remove-background`. A chave nunca deve ser adicionada ao `src/` ou a variáveis `VITE_*`.
