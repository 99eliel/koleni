# Simulador de orçamento Koleni — integração privada

## Como ativar
1. Publique o arquivo `firestore.rules` atualizado no Firebase do projeto `personalizakoleni` (console Firestore > Regras > Publicar ou `firebase deploy --only firestore:rules --project personalizakoleni`).
2. Entre no sistema com uma conta `admin`, abra `/simulador` pelo menu do vendedor e clique em **Importar tabela Koleni (JSON)**.
3. Selecione o arquivo **Tabela_de_Precos_Koleni_PRIVADA.json**, exportado do simulador original. O arquivo NÃO deve ser commitado nem hospedado no GitHub Pages.
4. Depois de importar, todos os vendedores ativos terão leitura via Firebase Authentication + Firestore Rules.

## Fluxo de atendimento
- Monte as artes dos modelos e **adicione cada peça ao carrinho**.
- Na página do carrinho, clique em **Simular preços**.
- Para cada personalização, escolha produto/técnica e a mesma quantidade; clique **Adicionar este produto ao orçamento**.
- Clique **Enviar preços simulados ao pedido Koleni**. Confira o pareamento de cada produto e valide quantidade e preço.
- Clique **Aplicar preços ao pedido e voltar ao carrinho**. Os valores ficam armazenados localmente apenas para este conjunto exato de peças, por 7 dias.
- Ao finalizar o pedido, o sistema grava o orçamento junto ao pedido no Firestore. O orçamento com fotos/PDF continua disponível pela interface existente, com os valores pré-preenchidos.
- Também é possível gerar Excel, imagem e texto para WhatsApp diretamente do simulador.

## Segurança e limitações
- `public/simulador-orcamento.html` não contém tabelas de preços; o arquivo é apenas a interface/motor e a logo.
- Os preços ficam exclusivamente em `pricingTables/current` no Firestore, com acesso restrito às contas autorizadas; somente administradores podem alterar.
- Como GitHub Pages publica todos os arquivos estáticos, NUNCA colocar o JSON privado no repositório ou dentro da pasta `public`.
- O preço informado no simulador é uma sugestão. Confira equivalência de produto, arte, técnica, quantidade e condições antes de enviar ao cliente. A tabela original considera arte até 10 × 10 cm.
- Não há atualização automática entre carrinhos de navegadores diferentes. O orçamento só é aplicado quando o vendedor faz a confirmação.
