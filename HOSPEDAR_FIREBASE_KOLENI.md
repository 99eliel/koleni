# Publicar o sistema Koleni no Firebase Hosting (primeira publicação)

Este procedimento não modifica o projeto Martimpel e não substitui o site institucional koleni.com.br.

## Pré-requisitos
- Conta Google com permissão no projeto Firebase `personalizakoleni`.
- Cloud Shell do Google Cloud, com acesso ao GitHub.
- Para Cloud Storage for Firebase, confirmar se o projeto está no plano Blaze (exigência do Firebase a partir de 2026).

## 1. CORS do Storage (Cloud Shell)

```bash
gcloud config set project personalizakoleni
git clone https://github.com/99eliel/koleni.git
cd koleni
gcloud storage buckets update gs://personalizakoleni.firebasestorage.app --cors-file=storage-cors.json
gcloud storage buckets describe gs://personalizakoleni.firebasestorage.app --format='default(cors_config)'
```

Se já clonou o repositório, em vez de `git clone`, entre na pasta com `cd ~/koleni` e atualize com `git pull`.

## 2. Hosting

No [Firebase Hosting](https://console.firebase.google.com/project/personalizakoleni/hosting), ative o Hosting se o assistente inicial aparecer.

No mesmo Cloud Shell (dentro de `koleni`), rode:

```bash
npm install
npm run build
firebase projects:list
firebase deploy --project personalizakoleni --config firebase.hosting-only.json --only hosting
```

A configuração `firebase.hosting-only.json` preserva o app estático e remove somente o rewrite para a Cloud Function `removeBackground` que pode não estar implantada. O arquivo `firebase.json` original continua disponível para uma futura implantação de Functions.

Endereço esperado após o deploy: https://personalizakoleni.web.app/  
Acesso ao vendedor: https://personalizakoleni.web.app/#/vendedor  
Admin: https://personalizakoleni.web.app/#/admin

## 3. Regras do banco, se ainda não publicadas

```bash
firebase deploy --project personalizakoleni --only firestore:rules,storage
```

## 4. Depois de hospedar
- No Firebase Console > Authentication > Configurações > Domínios autorizados, verifique `personalizakoleni.web.app`. Adicione-o se necessário.
- Teste login, cadastro de cliente, personalização, exportação, pedido, aprovação e ficha técnica.
- Se desejar `sistema.koleni.com.br`, em Hosting clique em Adicionar domínio personalizado. O Firebase informará os registros DNS; insira-os no provedor do domínio, preservando os registros do site principal.

**Atenção:** para usar a função paga remove.bg em `/api/remove-background`, será necessário implantar a função e só então voltar à configuração original de Hosting.
