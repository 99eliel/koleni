# Módulo de precificação Koleni — controle administrativo

O simulador mantém o **mesmo motor de cálculo** da planilha original: peça lisa, silk com posições/cores/complexidade/tela, DTF e bordado com posições/matriz, faixas de quantidade, interpolação e set-up para quantidades abaixo da primeira faixa.

## Acessos

- **Simular orçamento:** `https://99eliel.github.io/koleni/#/simulador` — apenas vendedores e administradores ativos.
- **Gerenciar o simulador:** `https://99eliel.github.io/koleni/#/admin/simulador` — exclusivamente administradores.
- Há um novo atalho **Preços e simulador** no menu de administração.

## Ativação obrigatória no Firebase

A publicação do GitHub Pages NÃO publica as regras de segurança. No projeto Firebase `personalizakoleni`, publicar a versão atual de **ambos** os arquivos:

1. `firestore.rules` — adicionar a coleção privada `pricingProducts/{productId}`, visível apenas para equipe ativa e editável por administradores.
2. `storage.rules` — liberar o caminho `pricing-products/{productId}/{fileName}` para fotos de até 5 MB, somente com upload administrativo.

É possível aplicar pelo Firebase CLI autorizado:

```bash
firebase deploy --only firestore:rules,storage --project personalizakoleni
```

Não coloque tabelas de preços ou JSON de backup em diretórios públicos ou no GitHub.

## Migração da tabela atual

Se a tabela antiga estiver em `pricingTables/current`, o administrador verá **Ativar controle individual de peças**. O sistema baixa um JSON de backup e migra em uma operação Firestore por lote. Os produtos existentes preservam nome, códigos, matrizes e preços em centavos; a configuração geral continua em `pricingTables/current`. Os preços passam para a coleção `pricingProducts`, um documento por modelo, permitindo expandir o catálogo sem bater no limite de um único documento.

Se ainda não houver tabela, use **Importar tabela JSON**, selecionando a tabela original `Tabela_de_Precos_Koleni_PRIVADA.json`. A importação reúne modelos pelo mesmo nome e preserva outros cadastros já existentes. As operações não são abertas a vendedores.

## Ferramentas administrativas

- Criar modelo a partir da matriz de um modelo de referência (novo sempre inativo até revisão).
- Duplicar, editar, ativar, desativar e excluir modelos.
- Categorizar, ordenar, acrescentar código, composição, tecido, tamanhos, descrição comercial, notas técnicas, foto de referência e campos livres de nome/valor.
- Editar cada preço em R$ na matriz completa, agrupada por técnica. Os códigos das combinações originais são preservados.
- Ajustar descontos, prazo de entrega, validade, parcelamento, referência de data e faixas de quantidade.
- Quando as faixas mudam, os valores das faixas novas são inicialmente copiados da faixa inferior mais próxima; revisar todos os preços antes de vender.
- Baixar um backup JSON com preços e metadados.

## Fluxo com o pedido

O vendedor monta o carrinho de personalizações, simula os preços por modelo, confere o pareamento de peças e quantidades e confirma. Os valores são armazenados como rascunho no navegador até a criação do pedido; no pedido, são anexados aos dados existentes e usados no orçamento com fotos e PDF.

## Segurança

Os preços não são embarcados nos arquivos públicos da aplicação: são lidos mediante autenticação e regras do Firestore. Não é possível proteger preços já vazados em backups ou links públicos. Revise permissões e nunca use o simulador como fonte automática de preço final sem conferência comercial.
