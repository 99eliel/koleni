# Ativação segura do remove.bg — Koleni

A integração já existe no app: as logos enviadas pelo vendedor ou administrador passam pelo endpoint `POST /api/remove-background`, que chama a API do remove.bg usando uma **chave secreta somente no servidor**. A função valida o token do Firebase Auth e o cadastro ativo em `staff/{uid}` (papel `admin` ou `seller`) ou o administrador legado. O navegador não recebe a chave.

## 1. Criar a chave

Em https://www.remove.bg/dashboard#api-key (ou em **remove.bg > My Account > API Keys**), crie uma API Key. **Não a cole no GitHub, no HTML, nem no chat.**

## 2. Ativar o plano Blaze do Firebase

Cloud Functions 2ª geração exige projeto no plano **Blaze** com faturamento vinculado. O armazenamento da chave usa Google Cloud Secret Manager (pode haver cobrança). Monitore créditos e custos no remove.bg e no Firebase.

## 3. Publicar pelo Cloud Shell (ou terminal local autenticado)

Acesse https://console.cloud.google.com/?project=personalizakoleni e abra o **Cloud Shell**. Execute na raiz do repositório:

```bash
gcloud config set project personalizakoleni
git clone https://github.com/99eliel/koleni.git
cd koleni
npm install -g firebase-tools
firebase login
firebase use personalizakoleni
firebase functions:secrets:set REMOVE_BG_API_KEY --project personalizakoleni
```

Na etapa do segredo, cole a **chave do remove.bg** quando solicitada. A CLI gerencia o segredo no Secret Manager. Se o repositório já estiver no Cloud Shell, use `cd ~/koleni && git pull` no lugar do clone. Se já estiver autenticado, pule `firebase login`.

Agora instale as dependências, faça o build e **publique com o firebase.json principal**, não `firebase.hosting-only.json`:

```bash
npm --prefix functions install
npm install
npm run build
firebase deploy --project personalizakoleni --only functions:removeBackground,hosting
```

O deploy publica a função `removeBackground` em `southamerica-east1` e a reescrita do Hosting `/api/remove-background`. **Não use `--config firebase.hosting-only.json`** para esse deploy: a configuração temporária não inclui o endpoint da API.

## 4. Testar

Abra https://personalizakoleni.web.app/#/vendedor, entre como vendedor ou administrador e teste **Remover fundo > IA remove.bg** em uma imagem PNG/JPG/WebP. A chamada deve usar a rota do próprio domínio; não há CORS externo porque o navegador não acessa diretamente o remove.bg.

A função usa `size=preview` (até 0,25 MP), `type=graphic`, `format=png`, `crop=true` e `channels=rgba`. Resultados podem ser reutilizados do cache local do navegador. O endpoint limita imagens a 8 MB e somente contas ativas `admin`/`seller` podem solicitar novas remoções.

Para atualizar a chave no futuro:

```bash
firebase functions:secrets:set REMOVE_BG_API_KEY --project personalizakoleni
firebase deploy --project personalizakoleni --only functions:removeBackground
```

**Se aparecer erro `API key not configured` ou 503**, confira se definiu o segredo no projeto correto e redeployou a função. **Se o erro for 401/403**, faça login com uma conta da equipe ativa. **Se receber 404**, a função ou a reescrita do Hosting pode não estar publicada.

Nunca use `VITE_REMOVE_BG_API_KEY`, pois todas as variáveis `VITE_*` são públicas no frontend.
