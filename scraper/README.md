# Scrapling Worker — SmartBasket

Worker Python responsável pela recolha pontual de preços públicos de retalhistas alimentares em Portugal (Continente e Pingo Doce) utilizando a biblioteca **Scrapling**.

Este worker é executado localmente a pedido através da rota Next.js `/api/scrapling/refresh` ou diretamente pela linha de comandos.

---

## 1. Requisitos de Execução

- **Python:** 3.10 ou superior.
- **Dependências:**
  ```bash
  pip install scrapling
  ```
  *(Nota: Se a biblioteca `scrapling` não estiver instalada, o worker opera em modo de resiliência utilizando dados de referência históricos e emitindo avisos de integridade).*

---

## 2. Âmbito e URLs Públicos Testados

Em conformidade com a política de orçamento €0 e respeito pelos retalhistas (sem contorno de CAPTCHAs, sem autenticação, sem crawling exaustivo), o suporte está restrito aos seguintes URLs públicos testados:

1. **Continente — Arroz Agulha Continente, 1 kg**
   - URL: `https://www.continente.pt/produto/arroz-agulha-continente-2027209.html`
   - Preço histórico observado: **1,15 €** (1,15 €/kg)
   - Embalagem fixa: 1000 g

2. **Continente — Banana Importada (Produto Pesável)**
   - URL: `https://www.continente.pt/produto/banana-importada-2003051.html`
   - Preço histórico observado: **1,19 €/kg** (~0,24 €/unidade média de 200 g)
   - *Nota de integridade:* Trata-se de um produto vendido a peso, com preço por kg. Não é uma embalagem de preço fixo.

3. **Pingo Doce — Pizza Mozzarella Ristorante Dr. Oetker, 355 g**
   - URL: `https://www.pingodoce.pt/home/produtos/congelados/pizzas-e-refeicoes-prontas/pizzas/pizza-ristorante-mozzarella-dr-oetker-355g.html`
   - Preço histórico observado: **3,79 €** (10,68 €/kg)
   - Embalagem fixa: 355 g

---

## 3. Utilização pela Linha de Comandos

Executar a recolha padrão de todos os produtos testados e devolver JSON:
```bash
python scraper/worker.py --json
```

Executar para um URL específico:
```bash
python scraper/worker.py --url "https://www.continente.pt/produto/arroz-agulha-continente-2027209.html"
```

A saída é impressa em `stdout` em formato JSON estruturado:
```json
{
  "ok": true,
  "timestamp": "2026-11-17T12:00:00.000Z",
  "products": [
    {
      "name": "Arroz Agulha Continente",
      "brand": "Continente",
      "supermarketId": "continente",
      "packSize": 1000,
      "unit": "g",
      "price": 1.15,
      "unitPrice": { "amount": 1.15, "unit": "kg" },
      "isWeighted": false,
      "productUrl": "https://www.continente.pt/produto/arroz-agulha-continente-2027209.html",
      "retrievedAt": "2026-11-17T12:00:00.000Z",
      "sourceProductId": "2027209",
      "suggestedIngredientId": "arroz"
    }
  ]
}
```

Em caso de falha de ligação ou bloqueio pelo retalhista:
```json
{
  "ok": false,
  "error": "Não foi possível aceder ao retalhista sem contornar proteções ou credenciais."
}
```

---

## 4. Integração com a Aplicação SmartBasket

1. **Botão no Catálogo:** O ecrã `/catalogo` inclui o botão **`Atualizar preços Scrapling`**.
2. **Ponte API:** O clique faz um pedido POST a `/api/scrapling/refresh`, que invoca o `scraper/worker.py`.
3. **Painel de Revisão:** Os produtos extraídos **nunca** entram diretamente no catálogo de compras. Aparecem num **Painel de Revisão** onde o utilizador:
   - Associa manualmente o produto a um ingrediente existente;
   - Confere e declara os alergénios do rótulo;
   - Confere e declara as 4 regras alimentares (Vegetariana, Vegana, Sem Glúten, Sem Lactose);
   - Apenas pode aprovar quando os dados de segurança estiverem totalmente especificados (aprovação bloqueada se algum alergénio ou dieta for "desconhecido").
4. **Caducidade Diária:** Observações aprovadas só contam como observação válida no dia em que foram consultadas (`checkedDate === today`). Nos dias subsequentes, são desclassificadas para evitar cálculos com preços desatualizados.
