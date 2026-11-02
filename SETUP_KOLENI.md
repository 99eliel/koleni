# Implantação — Koleni

Código clonado da versão mais recente de `99eliel/cor`, adaptado à marca Koleni e ao Firebase `personalizakoleni`.

## Independência
- O repositório `99eliel/cor` não foi alterado.
- O Firebase do front-end aponta exclusivamente para `personalizakoleni` (`src/lib/firebase.js`).
- O projeto Firebase CLI está configurado em `.firebaserc`.
- A cópia contempla o código e as regras, **não os documentos do Firestore, usuários do Authentication ou arquivos do Storage**.

**Exportação das imagens:** o bucket precisa de CORS configurado no Google Cloud; veja [CONFIGURAR_CORS_KOLENI.md](./CONFIGURAR_CORS_KOLENI.md). O arquivo JSON no repositório não aplica a configuração automaticamente.

## Preparação obrigatória do Firebase
1. No projeto Firebase `personalizakoleni`, criar Firestore e Storage, caso ainda não estejam ativos.
2. Em Authentication > Método de login, habilitar E-mail/Senha.
3. Publicar as regras com Firebase CLI: `firebase use personalizakoleni` e `firebase deploy --only firestore:rules,storage`.
4. Para bootstrap do primeiro administrador: criar usuário em Authentication, copiar UID e criar documento `admins/{UID}` no Firestore com campo `role` (string) igual a `admin`. Após login, pode-se migrar para `staff/{UID}` e gerenciar equipe pelo painel.
5. Configurar Authorized Domains do Authentication para `99eliel.github.io` e/ou domínio onde for hospedar.
6. Aplicar CORS do bucket usando `storage-cors.json` se as imagens falharem ao carregar/exportar.
7. O serviço de remoção de fundo via remove.bg requer a Cloud Function `removeBackground`, o segredo `REMOVE_BG_API_KEY` e um ambiente com o rewrite `/api/remove-background` (Firebase Hosting); o GitHub Pages por si só não executa essa função.

## Publicação
- Deploy automático GitHub Pages: workflow em `.github/workflows/deploy.yml`, base `/koleni/`.
- URL prevista: https://99eliel.github.io/koleni/
- Deploy de Firebase Hosting/Functions (se necessário): usar o projeto `personalizakoleni`.
- A identidade visual atual usa temporariamente a paleta da origem; definir as novas cores e logo definitivo separadamente.
