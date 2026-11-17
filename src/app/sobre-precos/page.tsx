export default function PriceInformationPage() {
  return <main className="management-shell"><header className="management-heading"><span className="eyebrow">Transparência</span><h1>Como interpretar os preços</h1><p>Os valores apresentados dependem dos dados guardados e da forma de venda de cada produto.</p></header>
    <section className="management-card"><h2>Estados do preço</h2><dl className="price-explanations">
      <div><dt>Manual</dt><dd>Valor introduzido pelo utilizador. A aplicação não confirma a sua exatidão.</dd></div>
      <div><dt>Verificado</dt><dd>Valor que o utilizador declarou ter conferido numa fonte. O SmartBasket não faz essa verificação.</dd></div>
      <div><dt>Estimativa</dt><dd>Referência aproximada introduzida pelo utilizador; não é um preço confirmado nem permite afirmar que o orçamento foi cumprido.</dd></div>
      <div><dt>Observado</dt><dd>Valor guardado a partir de uma observação importada ou aprovada. Não é automaticamente verificado, pode estar desatualizado e não prova disponibilidade na loja escolhida.</dd></div>
      <div><dt>Desconhecido</dt><dd>Não existe um valor utilizável. O preço desconhecido nunca é contado como zero.</dd></div>
    </dl></section>
    <section className="management-card"><h2>Datas e observações desatualizadas</h2><p>Uma observação é considerada desatualizada quando a sua data é anterior ao dia atual. Uma data recente também não garante que o preço se mantenha, nem que corresponda à sua loja ou disponibilidade.</p><p>Os preços guardados não são consultados em tempo real.</p></section>
    <section className="management-card"><h2>Produtos vendidos a peso ou por unidade</h2><p>O custo esperado pode ser calculado a partir do preço por unidade de medida, mas o valor final da caixa depende da quantidade efetivamente pesada ou registada. Sem essa quantidade, o custo exato fica por determinar.</p><p>O custo de consumo é uma referência separada do custo de compra de embalagens inteiras.</p></section>
    <section className="management-card"><h2>Orçamento incompleto</h2><p>Um orçamento incompleto significa que há linhas sem preço exato ou sem quantidade de caixa conhecida. Mesmo que os valores conhecidos pareçam caber no orçamento, não é possível concluir que o total final ficará dentro dele.</p><p>“Dentro do orçamento” só é apresentado quando todas as linhas não pertencentes à despensa têm preço manual ou verificado e o total exato de compra não excede o limite.</p></section>
    <p className="management-footnote">Continente e Pingo Doce são marcas dos respetivos proprietários. O SmartBasket não é afiliado a estes supermercados.</p>
  </main>;
}
