import type { Allergen, BaseUnit, DietStatus, DietTag, DietaryRule, IngredientCategory, LooseUnit, MealType, PriceState, Priority, RecipeTag, SupermarketId, Weekday } from '@/lib/types';

export const allergenLabels: Record<Allergen, string> = {
  gluten: 'Cereais que contêm glúten', crustaceos: 'Crustáceos', ovo: 'Ovos', peixe: 'Peixe',
  amendoim: 'Amendoins', soja: 'Soja', leite: 'Leite (incluindo lactose)',
  frutos_casca_rija: 'Frutos de casca rija', aipo: 'Aipo', mostarda: 'Mostarda',
  sesamo: 'Sementes de sésamo', sulfitos: 'Dióxido de enxofre e sulfitos', tremoco: 'Tremoço', moluscos: 'Moluscos',
};

export const dietLabels: Record<DietaryRule, string> = {
  vegetariana: 'Vegetariana', vegana: 'Vegana', sem_gluten: 'Sem glúten', sem_lactose: 'Sem lactose', nenhuma: 'Sem restrições',
};

export const mealLabels: Record<MealType, string> = {
  pequeno_almoco: 'Pequeno-almoço', almoco: 'Almoço', jantar: 'Jantar', lanche: 'Lanches',
};

export const priorityLabels: Record<Priority, string> = {
  mais_barato: 'Mais barato possível', saudavel: 'Saudável e equilibrado', rapido: 'Rápido e fácil', melhor_valor: 'Melhor relação qualidade-preço',
};

export const recipeTagLabels: Record<RecipeTag, string> = {
  saudavel: 'Saudável', rapido: 'Rápido', economica: 'Económica',
};

export const weekdayLabels: Record<Weekday, string> = {
  segunda: 'Segunda-feira', terca: 'Terça-feira', quarta: 'Quarta-feira', quinta: 'Quinta-feira',
  sexta: 'Sexta-feira', sabado: 'Sábado', domingo: 'Domingo',
};

export const priceStateLabels: Record<PriceState, string> = {
  observado: 'Observado hoje',
  manual: 'Manual', verificado: 'Verificado', estimativa: 'Estimativa', desconhecido: 'Sem preço',
};

export const categoryLabels: Record<IngredientCategory, string> = {
  carne_peixe: 'Carne, peixe e proteína', laticinios_ovos: 'Laticínios e ovos', frutas_legumes: 'Fruta e legumes',
  hidratos: 'Hidratos de carbono', despensa: 'Despensa',
};

export const supermarketLabels: Record<SupermarketId, string> = { continente: 'Continente', pingo_doce: 'Pingo Doce' };

export const baseUnitLabels: Record<BaseUnit, string> = { g: 'g', ml: 'ml', un: 'unidades' };

export const looseUnitLabels: Record<LooseUnit, string> = {
  colher_sopa: 'colher de sopa', colher_cha: 'colher de chá', chavena: 'chávena', pitada: 'pitada',
};

export const dietStatusLabels: Record<DietStatus, string> = {
  compativel: 'Compatível', incompativel: 'Incompatível', desconhecido: 'Por confirmar',
};

export const dietTagLabels: Record<DietTag, string> = {
  vegetariana: dietLabels.vegetariana, vegana: dietLabels.vegana, sem_gluten: dietLabels.sem_gluten, sem_lactose: dietLabels.sem_lactose,
};

export const wizardStepLabels: readonly string[] = [
  'Supermercado', 'Pessoas', 'Refeições', 'Alimentação', 'Alergénios e despensa', 'Prioridade e orçamento',
];
