# Checklist de entrada em produção — Martinpel

Este arquivo registra o que precisa estar concluído antes de liberar o sistema para uso diário da equipe.

## 1. Código e segurança

- [x] Firebase Hosting configurado.
- [x] Login por e-mail e senha.
- [x] Recuperação de senha pelo Firebase Authentication.
- [x] Perfis em `staff/{uid}` com funções `admin`, `seller` e `production`.
- [x] Bloqueio por `active: false`.
- [x] Área administrativa de Equipe em `#/admin/equipe`.
- [x] Compatibilidade temporária com o administrador antigo em `admins/{uid}`.
- [x] Firestore Rules separadas por função.
- [x] Storage Rules separadas por função.
- [x] Vendedor/Admin podem montar pedidos.
- [x] Produção/Admin podem operar o pipeline.
- [x] Somente Admin gerencia catálogo e equipe.

## 2. Ações manuais obrigatórias no Firebase

- [ ] Publicar `firestore.rules`.
- [ ] Publicar `storage.rules`.
- [ ] Publicar a versão atual do Hosting.
- [ ] Abrir `#/admin/equipe` e migrar a conta administrativa atual para `staff/{uid}`.
- [ ] Criar no Firebase Authentication cada funcionário real.
- [ ] Copiar o UID de cada usuário e vinculá-lo em Admin > Equipe.
- [ ] Testar um usuário Vendedor.
- [ ] Testar um usuário Produção.
- [ ] Testar um usuário Bloqueado.

## 3. Storage / navegador

- [ ] Aplicar `storage-cors.json` ao bucket `personalizamartinpel.firebasestorage.app`.
- [ ] Testar troca de cores claras, incluindo branco `#FFFFFF`.
- [ ] Testar logo PNG/JPG/WEBP.
- [ ] Testar PDF vetorial.
- [ ] Confirmar que a arte final exporta sem erro de CORS.

## 4. Primeiro pedido real

- [ ] Criar o primeiro pedido completo.
- [ ] Confirmar código profissional `MP-000001` ou próximo número disponível.
- [ ] Confirmar grade por letras.
- [ ] Confirmar grade numérica.
- [ ] Confirmar grade personalizada.
- [ ] Confirmar Meus Pedidos do vendedor.
- [ ] Confirmar link público de aprovação.
- [ ] Testar `Aprovar arte`.
- [ ] Testar `Solicitar alteração`.
- [ ] Confirmar mudança de status no pipeline.
- [ ] Confirmar ficha técnica e QR.
- [ ] Concluir o pedido.

## 5. Retenção e custo

- [ ] Criar TTL para collection group `orders`, campo `expireAt`.
- [ ] Criar TTL para collection group `approvalPreviews`, campo `expireAt`.
- [ ] Aplicar `storage-lifecycle.json` ao bucket.
- [ ] Confirmar exclusão automática apenas em `final-renders/` após 90 dias.
- [ ] Configurar alertas de orçamento no Google Cloud.

## 6. Catálogo

- [ ] Criar peça de teste.
- [ ] Editar peça.
- [ ] Testar regiões e cores.
- [ ] Testar tipo de numeração.
- [ ] Arquivar peça.
- [ ] Restaurar peça.
- [ ] Excluir permanentemente uma peça de teste.
- [ ] Confirmar que pedidos antigos não são afetados.

## 7. Compatibilidade final

- [ ] Chrome desktop.
- [ ] Edge desktop.
- [ ] Notebook/resolução menor.
- [ ] Celular para página pública de aprovação.
- [ ] Testar recuperação de senha.
- [ ] Validar logout e nova autenticação.

## 8. Liberação

Quando todos os itens obrigatórios acima estiverem concluídos:

- [ ] criar tag/release `v1.0.0` no GitHub;
- [ ] registrar a data da entrada em produção;
- [ ] evitar mudanças estruturais diretamente na versão estável sem teste prévio.

## Migração do acesso antigo

A coleção `admins/{uid}` permanece somente como compatibilidade temporária. Depois que todos os administradores estiverem cadastrados e testados em `staff/{uid}`, a compatibilidade antiga pode ser removida das regras e do código em uma versão posterior.
