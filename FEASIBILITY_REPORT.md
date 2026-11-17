# Relatório de Viabilidade: Recolha de Preços e Integração Scrapling (SmartBasket)

**Data:** 17 de novembro de 2026  
**Projeto:** SmartBasket  
**Âmbito:** Avaliação técnica, legal e operacional de recolha de preços de retalhistas alimentares em Portugal (Continente e Pingo Doce) com orçamento €0.

---

## 1. Contexto e Objetivos

O SmartBasket tem como missão produzir planeamento semanal de refeições e listas de compras honestas para agregados familiares em Portugal, calculando custos na caixa (embalagens inteiras) e respeitando regras estritas de segurança alimentar (alergénios EU-14 e compatibilidade alimentar).

Este relatório documenta a viabilidade técnica, ética e jurídica de atualizar preços de produtos através da biblioteca Python **Scrapling**, sob restrições inegociáveis:
1. **Orçamento de serviços externos: €0**. Nenhum serviço pago de proxy, captcha solver ou API de subscrição comercial.
2. **Proibição estrita de bypass**: Nenhum contorno de CAPTCHAs, bot protection, stealth agressivo ou quebra de autenticação.
3. **Respeito pelos retalhistas**: Proibição de scraping massivo ou desautorizado.
4. **Honestidade de preços**: Nenhuma invenção ou extrapolação de preços. Observações são datadas e rotuladas como observações indicativas.
5. **Segurança alimentar inegociável**: Nenhum dado de alergénios ou dieta extraído automaticamente pode entrar no catálogo sem conferência e aprovação humana explícita.

---

## 2. Análise dos Retalhistas Alvo em Portugal

### 2.1. Continente (Sonae MC)
- **Estrutura Web:** A loja online (`continente.pt`) disponibiliza páginas públicas de produto com dados estruturados em microdados Schema.org (JSON-LD) e metatags OpenGraph.
- **Preços e Unidades:** Apresenta preço da embalagem e preço por unidade de medida (ex.: €/kg). Produtos pesáveis (ex.: fruta e legumes a peso, como a Banana) indicam o preço de referência por quilo e uma estimativa por unidade típica (~200 g).
- **Proteções:** Apresenta camadas de controlo de tráfego (Akamai / WAF). Pedidos diretos e repetitivos de clientes automatizados são rapidamente identificados e bloqueados por desafios de verificação.
- **Preços Locais:** Os preços online são de âmbito nacional para o canal ecommerce, mas podem divergir de lojas físicas de proximidade ("Continente Bomdia" ou "Modelo").

### 2.2. Pingo Doce (Jerónimo Martins)
- **Estrutura Web:** O site (`pingodoce.pt`) utiliza rendering moderno com componentes React/Next.js e endpoints de catálogo internos.
- **Preços e Unidades:** Os produtos embalados de marca e marca própria indicam PVP recomendado e preço unitário (€/kg ou €/l).
- **Proteções:** Camadas Cloudflare e WAF com bloqueio estrito de User-Agents não standard e exigência de execução de scripts de validação de browser.
- **Preços Locais:** A política do Pingo Doce historicamente foca-se na experiência física de loja, tendo variações promocionais locais e disponibilidade dependente da loja associada.

---

## 3. Avaliação da Biblioteca Scrapling

**Scrapling** é uma biblioteca Python moderna de parsing e extração HTTP que fornece interfaces adaptativas para análise de HTML e emulação de clientes web padrão.

### 3.1. Vantagens
- Parsing rápido e resiliente de seletores CSS e XPath.
- Capacidade de extrair JSON-LD e metadados estruturados das páginas públicas de produto.
- Ausência de dependências de serviços na nuvem ou custos de subscrição.

### 3.2. Limitações Críticas (Zero Budget)
- **Sem proxies residenciais:** Qualquer tentativa de rastreio extensivo a partir de um IP residencial ou local de utilizador é bloqueada pelos WAFs dos supermercados após poucos pedidos.
- **Regra de Não-Bypass:** O SmartBasket proíbe terminantemente mecanismos de evasão ou contorno de desafios anti-bot. Se o retalhista responder com erro 403, 429 ou página de desafio, a ferramenta **deve parar e reportar o erro**, nunca tentar contorná-lo.
- **Portabilidade:** A aplicação Next.js corre em ambiente Node.js / navegador. Chamar o Scrapling requer um runtime Python local. Se o utilizador não tiver Python instalado no computador, o bridge deve falhar graciosamente com mensagem clara em português de Portugal.

---

## 4. Produtos Testados e Histórico de Observações

Devido às restrições legais e técnicas, a integração Scrapling foi delimitada a um conjunto controlado de **URLs públicos testados**:

1. **Continente — Arroz Agulha Continente, 1 kg**
   - *URL testado:* `https://www.continente.pt/produto/arroz-agulha-continente-2027209.html`
   - *Observação histórica:* **1,15 €** (1,15 €/kg). Embalagem fixa de 1000 g.

2. **Continente — Banana (Produto Pesável)**
   - *URL testado:* `https://www.continente.pt/produto/banana-importada-2003051.html`
   - *Observação histórica:* **1,19 €/kg** e aprox. **0,24 €/unidade**.
   - *Regra financeira:* Não pode ser tratada como embalagem fixa de preço fechado sem referência ao peso. A lista de compras e cálculo de embalagens baseiam-se na gramagem requerida pelas receitas e no preço por quilo.

3. **Pingo Doce — Pizza Mozzarella Ristorante Dr. Oetker, 355 g**
   - *URL testado:* `https://www.pingodoce.pt/home/produtos/congelados/pizzas-e-refeicoes-prontas/pizzas/pizza-ristorante-mozzarella-dr-oetker-355g.html`
   - *Observação histórica:* **3,79 €** (10,68 €/kg). Embalagem de 355 g.

> **Aviso de Integridade:** Estes valores são observações históricas de teste. Não são garantias de preço atual nem preços em tempo real. O SmartBasket nunca inventa preços nem assume preços desconhecidos como zero.

---

## 5. Protocolo de Segurança e "Human in the Loop"

A extração de dados da web é inerentemente probabilística e sujeita a erros de rotulagem ou formatação. Na alimentação, um erro de alergénio pode ter consequências graves.

Por conseguinte, foi estabelecido o seguinte fluxo inegociável:

```
[Trigger Manual no Catálogo]
          │
          ▼
[API Next.js /api/scrapling/refresh]
          │
          ▼
[Worker Python Scrapling (scraper/worker.py)]
          │ (Erro: Python indisponível ou retalhista inacessível)
          │ ──► [Reportar erro amigável em pt-PT]
          ▼ (Sucesso: Dados brutos extraídos)
[Painel de Revisão Humana no Catálogo]
          │
          ├─► 1. Verificação de Nome, Marca, Supermercado, Tamanho, Preço e Preço Unitário
          ├─► 2. Mapeamento Manual do Ingrediente do Catálogo
          ├─► 3. Confirmação Manual dos Alergénios (EU-14)
          ├─► 4. Confirmação Explícita das 4 Dietas (Vegetariana, Vegana, Sem Glúten, Sem Lactose)
          │
          ▼
[Validação de Bloqueio de Segurança]
  - Informação de alergénios "desconhecida" (unknown)? ──► APROVAÇÃO BLOQUEADA
  - Alguma das 4 dietas com estado "desconhecido"?    ──► APROVAÇÃO BLOQUEADA
          │
          ▼ (Apenas quando 100% conferido pelo utilizador)
[Aprovação e Importação para o Catálogo Local]
  - Estado do produto: 'observado'
  - Data de observação e URL registados
  - Histórico de preços atualizado
  - Validação de expiração diária (observações antigas são desclassificadas)
```

---

## 6. Conclusão e Recomendações

1. **A viabilidade de scraping live contínuo sem custos é nula**, mas a **viabilidade de um conector assistido por Scrapling com revisão humana e URLs testados é alta e segura**.
2. O bridge Next.js (`src/app/api/scrapling/refresh/route.ts`) deve orquestrar a execução do subprocesso Python mantendo isolamento total: falhas no worker nunca afetam a estabilidade do servidor ou a integridade dos dados existentes.
3. Todas as observações importadas devem caducar diariamente para efeitos de cálculo de orçamento, garantindo que o planeador nunca classifica um orçamento como "Dentro do orçamento" com preços obsoletos.
