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

## 5. Se a função foi criada mas o botão não funciona

1. Abra `https://personalizakoleni.web.app/api/remove-background` diretamente no navegador. **Esperado: HTTP 405** e o JSON `{"error":"Use POST para remover o fundo."}`. Esse teste GET não consome créditos da API.
2. Se abrir a página do Koleni (HTML) ou erro 404, a reescrita do Hosting não está ativa: rode `firebase deploy --project personalizakoleni --only hosting` na raiz do projeto, usando **firebase.json** (não `firebase.hosting-only.json`).
3. Se aparecer HTTP 403 com uma página HTML, verifique a permissão de invocação pública da Cloud Function/Cloud Run (a autenticação do usuário já é validada pelo código da função). Não mude permissões sem conferir os logs.
4. Se o teste GET retornar 405, o roteamento está correto: execute a remoção com uma logo, anote a mensagem exibida e veja `firebase functions:log --only removeBackground --project personalizakoleni`. Retornos 401/403 em JSON indicam autorização; 402/403 da API remove.bg podem indicar chave ou créditos; 502/503 indicam problema upstream, configuração ou serviço.
5. Depois de alterar o front-end no GitHub, faça `npm run build` e `firebase deploy --project personalizakoleni --only hosting`, sempre com o `firebase.json` principal. Faça Ctrl+F5 no navegador.

**Não compartilhe a API Key, tokens de autenticação ou outros segredos em capturas de tela ou logs.**

## Cache inválido e prévia quebrada

Versões antigas do frontend podiam aceitar HTTP 200 com HTML (fallback do Firebase Hosting) e guardar esse conteúdo como se fosse uma imagem. O frontend atual usa o cache `koleni-removebg-v2`, verifica assinatura PNG **e** decodificação da imagem, descarta registros inválidos e recusa salvar resultados impróprios. A prévia também bloqueia a aplicação se o navegador não conseguir exibir a imagem.

Se visualizar "Reutilizado do cache" e uma imagem quebrada na versão anterior, atualize o repositório, recompile e publique com `firebase.json` principal. Se a API falhar novamente, agora aparecerá um erro de rota, autorização ou resposta inválida. Não volte a publicar o `firebase.hosting-only.json`, pois ele redireciona a rota da API para o SPA.
