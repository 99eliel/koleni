# Koleni — corrigir bloqueio CORS ao exportar fotos e logos

## Por que aparece o erro?
O navegador consegue *mostrar* imagens remotas, mas para gerar uma arte final em Canvas precisa ler os pixels. Quando o bucket que hospeda uma imagem não autoriza a origem `https://99eliel.github.io`, a exportação é bloqueada.

O Firebase Storage é **independente do Firestore**. Alterar `firestore.rules`, `storage.rules` ou enviar `storage-cors.json` para o GitHub **não altera o CORS do bucket**.

**Projeto:** `personalizakoleni`  
**Bucket configurado no app:** `personalizakoleni.firebasestorage.app`  
**Site atual:** `https://99eliel.github.io/koleni/`  
**Origem exigida pelo navegador:** `https://99eliel.github.io` (sem o caminho `/koleni`).

## Solução pelo painel do Google Cloud (sem terminal)
1. Acesse [Cloud Storage / Buckets da Koleni](https://console.cloud.google.com/storage/browser?project=personalizakoleni).
2. Selecione **personalizakoleni.firebasestorage.app** (confira o nome do bucket).
3. Abra **Configuração / Configuration**.
4. Em **Cross-origin resource sharing (CORS)**, clique em **Editar**.
5. Habilite a configuração e adicione:
   - **Origins:** `https://99eliel.github.io`, `https://personalizakoleni.web.app`, `https://personalizakoleni.firebaseapp.com` (opcionalmente `https://www.koleni.com.br`, `https://koleni.com.br`).
   - **Methods:** `GET`, `HEAD`.
   - **Response headers:** `Content-Type`, `Content-Length`, `ETag`.
   - **Max age:** `3600` segundos.
6. Salve. Volte ao sistema, recarregue com `Ctrl+F5` e exporte uma peça.

## Solução pelo Google Cloud Shell
Na barra superior do [Console Google Cloud](https://console.cloud.google.com/home/dashboard?project=personalizakoleni), abra o ícone **Cloud Shell** e cole **todos** os comandos:

```bash
cat > /tmp/koleni-cors.json <<'EOF'
[
  {
    "origin": [
      "https://99eliel.github.io",
      "https://personalizakoleni.web.app",
      "https://personalizakoleni.firebaseapp.com",
      "https://www.koleni.com.br",
      "https://koleni.com.br",
      "http://localhost:5173"
    ],
    "method": [
      "GET",
      "HEAD"
    ],
    "responseHeader": [
      "Content-Type",
      "Content-Length",
      "ETag"
    ],
    "maxAgeSeconds": 3600
  }
]
EOF

gcloud storage buckets update gs://personalizakoleni.firebasestorage.app --cors-file=/tmp/koleni-cors.json

gcloud storage buckets describe gs://personalizakoleni.firebasestorage.app --format="default(cors_config)"
```

O comando `update` aplica a configuração no bucket; o `describe` verifica o resultado. Também é possível baixar `storage-cors.json` do repositório e usar `--cors-file=storage-cors.json`.

## Se o erro continuar
- Leia o texto completo do erro: ele agora identifica a vista da peça e o servidor/bucket da imagem.
- Verifique se o **bucket exibido** corresponde a `personalizakoleni.firebasestorage.app`. Se a imagem aponta para um bucket antigo da Martimpel, aplicar CORS somente na Koleni não resolverá: recadastre aquela foto no Storage Koleni.
- Se o erro citar uma **logo**, ela pode ter sido hospedada por terceiros. Envie-a diretamente pelo editor da Koleni para que seja copiada para o Storage da Koleni.
- O bucket precisa existir e o usuário da configuração deve ter permissão de **Storage Admin** ou as permissões `storage.buckets.get` e `storage.buckets.update`.
- CORS não torna arquivos públicos: as permissões de acesso continuam controladas pelas regras e tokens de download.

Referências oficiais:
- https://docs.cloud.google.com/storage/docs/using-cors
- https://firebase.google.com/docs/storage/web/download-files
