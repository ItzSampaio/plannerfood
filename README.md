SmartBasket

Planeamento inteligente de refeições e gestão de compras de supermercado.

O SmartBasket é uma aplicação web desenvolvida para simplificar o planeamento semanal de refeições, organizar listas de compras e ajudar a controlar os gastos em supermercados portugueses.

O objetivo é permitir planear refeições para toda a semana, adaptar receitas às necessidades alimentares da família e calcular o custo das compras com base nos produtos e preços disponíveis.

O SmartBasket encontra-se em desenvolvimento. Algumas funcionalidades e dados do catálogo ainda estão em expansão e sujeitos a validação.

Funcionalidades

* Planeamento semanal: criação de planos de refeições para sete dias.
* Planeamento familiar: configuração de 1 a 12 pessoas.
* Receitas: consulta de receitas e respetivos ingredientes.
* Lista de compras: consolidação automática dos ingredientes necessários.
* Gestão de produtos: catálogo organizado por supermercado.
* Controlo de orçamento: comparação dos custos estimados e conhecidos com o orçamento definido.
* Gestão da despensa: possibilidade de considerar ingredientes já disponíveis em casa.
* Preferências alimentares: aplicação de filtros alimentares e exclusão de alergénios.
* Histórico de preços: acompanhamento dos preços registados.
* Importação e exportação: suporte para ficheiros CSV e JSON.
* Cópias de segurança: exportação e restauro dos dados locais.

Supermercados suportados

O projeto está preparado para trabalhar com:

* Continente
* Pingo Doce

A cobertura do catálogo ainda é limitada. Existem produtos genéricos e observações de produtos reais, mas isso não significa que todos os ingredientes tenham correspondências reais verificadas nos dois supermercados.

Segurança alimentar

O SmartBasket utiliza regras conservadoras para a seleção de produtos.

* Considera os 14 alergénios regulamentados pela União Europeia.
* Distingue informação conhecida, desconhecida e incompleta.
* Não considera automaticamente um produto seguro quando faltam dados.
* Não aprova produtos apenas por terem nomes semelhantes.
* Exige revisão explícita antes de incorporar novos produtos no catálogo.

Importante: o SmartBasket não garante a ausência de alergénios ou de contaminação cruzada. Consulta sempre os rótulos originais dos produtos. Em caso de alergia grave, não dependas exclusivamente desta aplicação.

Preços e orçamento

O sistema distingue diferentes níveis de confiança dos preços:

Estado	Significado
Manual	Introduzido manualmente
Verificado	Confirmado através de uma fonte adequada
Estimativa	Valor aproximado, não confirmado
Observado	Recolhido através de uma fonte, ainda não verificado
Desconhecido	Não existe informação suficiente

Os preços desconhecidos nunca são tratados como zero.

O SmartBasket distingue ainda o custo estimado do consumo do custo real de aquisição das embalagens. O orçamento utiliza o custo de compra, não apenas a quantidade consumida numa receita.

Dados e integração com Cesta.pt

A integração com Cesta.pt permite pesquisas manuais de produtos e preços através de ferramentas de leitura.

Os resultados são guardados como observações pendentes e não alteram automaticamente o catálogo.

Não são utilizados:

* Carrinhos de compras.
* Operações de checkout.
* Pagamentos.
* Contas de utilizador.
* Aprovação automática de produtos.

Estado atual do catálogo

O projeto concluiu as seguintes etapas de investigação e expansão:

* Fase 15: auditoria da cobertura e planeamento da expansão.
* Fase 16: recolha de 14 observações Cesta pendentes, relativas a sete grupos prioritários de ingredientes.
* Fase 17: revisão conservadora das observações, mantendo os 14 registos pendentes.

Até ao momento, nenhuma destas 14 observações foi aprovada para integrar o catálogo.

Documentação:

* PHASE15_PLAN.md
* PHASE16_REPORT.md
* docs/PHASE16_COVERAGE_REPORT.md
* PHASE17_REPORT.md
* CESTA_MCP_INTEGRATION_REPORT.md
* docs/CATALOGUE_COVERAGE_REPORT.md

Tecnologias

O projeto utiliza:

* Next.js
* React
* TypeScript
* Tailwind CSS
* Vitest

Os dados são armazenados localmente no navegador, através de LocalStorage. Não é necessário configurar uma base de dados ou um servidor externo para utilizar a aplicação.

Instalação no Windows

Requisitos

* Windows 10 ou Windows 11.
* Node.js LTS, versão 20.9 ou superior.
* npm.

1. Instalar dependências

Abre o PowerShell ou o Prompt de Comando na pasta do projeto:

npm ci

Se o PowerShell bloquear a execução de npm.ps1, utiliza:

npm.cmd ci

2. Iniciar a aplicação

npm run dev

Ou, se necessário:

npm.cmd run dev

3. Abrir o SmartBasket

Abre o navegador e acede a:

http://localhost:3000

Mantém o terminal aberto enquanto utilizas a aplicação.

Para parar o servidor, regressa ao terminal e carrega em Ctrl + C.

Demonstração através de uma pen USB

O SmartBasket pode ser preparado para uma demonstração local noutro computador Windows, sem necessidade de alojar o site na Internet.

Consulta:

docs/DEMO_WINDOWS.md

Este documento explica como preparar os ficheiros necessários e executar a aplicação a partir de uma pen USB.

Desenvolvimento e testes

Para verificar o projeto:

npm.cmd run typecheck
npm.cmd run lint
npm.cmd test
npm.cmd run build
npm.cmd run validate:data

Filosofia do projeto

O SmartBasket procura privilegiar:

* Precisão em vez de dados inventados.
* Segurança alimentar em vez de recomendações arriscadas.
* Transparência sobre preços e respetiva origem.
* Revisão humana antes de aprovar novos produtos.
* Funcionamento local e controlo dos dados pelo utilizador.
* Desenvolvimento incremental, com testes e documentação.

O objetivo não é apenas criar uma lista de compras: é construir uma ferramenta fiável para planear refeições, comparar custos e organizar as compras do dia a dia.

Estado do projeto

O SmartBasket continua em desenvolvimento. A aplicação já dispõe de funcionalidades de planeamento, receitas, gestão de catálogo, cálculo de compras, orçamento, segurança alimentar e integração de observações externas.

A expansão do catálogo real e a validação dos dados dos produtos continuam a ser áreas prioritárias.