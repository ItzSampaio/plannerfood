# SmartBasket

## Dados de produtos e Cesta.pt

O catálogo inclui entradas genéricas e produtos observados. A pesquisa manual na cesta.pt é opcional e só usa ferramentas de leitura de preços/produtos. Os resultados entram como observações pendentes e nunca alteram o catálogo sem revisão explícita. Não são usados carrinhos, checkout, pagamentos ou contas.

Consulte [CESTA_MCP_INTEGRATION_REPORT.md](CESTA_MCP_INTEGRATION_REPORT.md) e [docs/CATALOGUE_COVERAGE_REPORT.md](docs/CATALOGUE_COVERAGE_REPORT.md) para a proveniência, cobertura e limitações atuais.

Planeador semanal de refeições e lista de compras, com interface em português de Portugal.

## Abrir o site no Windows

1. Instale o Node.js LTS (versão 20.9 ou mais recente).
2. Abra o **PowerShell** ou o **Prompt de Comando** nesta pasta do projeto.
3. Na primeira utilização, instale as dependências:

   ```powershell
   npm ci
   ```

   Se o PowerShell bloquear o comando, use `npm.cmd ci`.

4. Inicie o site:

   ```powershell
   npm run dev
   ```

   No PowerShell, se necessário, use `npm.cmd run dev`.

5. Abra [http://localhost:3000](http://localhost:3000) no navegador. Deixe a janela do terminal aberta enquanto utiliza o site. Para parar o servidor, volte ao terminal e carregue em `Ctrl+C`.

Para instruções de transferência e utilização a partir de uma pen USB, consulte [docs/DEMO_WINDOWS.md](docs/DEMO_WINDOWS.md).
