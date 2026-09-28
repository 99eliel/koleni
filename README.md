# Customizador de Uniformes

Aplicação React + Vite para cadastro e customização visual de peças de uniforme, preparada para GitHub Pages.

## Stack

- React + Vite
- React Router com `HashRouter`
- Fabric.js para múltiplas logos
- Firebase Auth, Firestore e Storage
- Canvas 2D para regiões e recolorização

## Rotas

- `#/admin` — painel interno protegido por Firebase Auth
- `#/customizar/:garmentId` — customizador do cliente
- `#/` — catálogo público das peças cadastradas

## Admin

O login usa E-mail/Senha do Firebase Authentication. Além de estar autenticado, o UID precisa possuir o documento:

```text
admins/{uid}
  role: "admin"
```

O editor permite:

- foto da frente e das costas;
- regiões com coordenadas normalizadas entre 0 e 1;
- múltiplos polígonos por região;
- edição de vértices;
- inserção de vértice clicando na aresta;
- remoção do vértice selecionado com Delete/Backspace;
- reordenação visual definindo `zIndex`;
- regiões bloqueadas para o cliente;
- pré-visualização das cores antes de salvar.

## Cliente

O cliente recebe autenticação anônima em segundo plano. A tela suporta recolorização por região, frente/costas, várias logos com Fabric.js e finalização do pedido em `orders`.

Os renders finais são gravados em `final-renders/{uid}` e as logos originais em `logos/{uid}`.

## Firebase usado

O projeto está configurado em `src/lib/firebase.js` para o Firebase `app-da-cidade-7759b`.

**Atenção:** esse Firebase já possui outras coleções/aplicações. Os arquivos `firestore.rules` e `storage.rules` deste repositório descrevem as permissões necessárias para este customizador, mas NÃO devem substituir às cegas as regras atualmente publicadas no projeto compartilhado. Antes de publicar, mescle os blocos de `garments`, `orders` e `admins` com as regras existentes. O mesmo vale para os caminhos de Storage.

## Desenvolvimento

```bash
npm install
npm run dev
```

## GitHub Pages

O Vite usa `base: '/cor/'`. O workflow `.github/workflows/deploy.yml` compila e publica automaticamente a cada push no `main`.

Também continua disponível o deploy manual:

```bash
npm run deploy
```

## Estrutura principal

```text
src/components/AdminAuth.jsx
src/components/GarmentEditorCanvas.jsx
src/components/RegionSidebar.jsx
src/components/CustomerStage.jsx
src/lib/geometry.js
src/lib/renderGarment.js
src/pages/AdminPage.jsx
src/pages/CustomizerPage.jsx
firestore.rules
storage.rules
```
