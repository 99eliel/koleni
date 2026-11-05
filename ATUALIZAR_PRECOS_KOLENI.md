# Atualizar o simulador de preços da Koleni

Acesse https://personalizakoleni.web.app/#/admin/simulador como administrador.

1. Receba o HTML completo atualizado da confecção ou um arquivo JSON de preços.
2. Clique em **Atualizar preços (HTML/JSON)**.
3. Confira quantos modelos serão criados/atualizados/preservados.
4. Confirme; o painel faz download de backup JSON antes de salvar no Firestore.
5. Teste os preços no simulador. Não é necessário um deploy a cada atualização do mesmo formato.

**Importante:** na primeira vez, publique o código novo no Firebase Hosting. O importador não executa scripts do HTML. A atualização não apaga modelos ausentes nem recalcula orçamentos anteriores. Modelos de tabelas antigas sem as 106 combinações da versão de novembro ficam fora da venda até serem atualizados. Se a confecção mudar o formato interno do HTML, a importação recusará o arquivo por segurança. Confira especialmente silk, bordado, arte compartilhada, peças abaixo de 10 unidades e bandeira do Brasil.
