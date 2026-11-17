export const ALLERGENS = [
  'gluten', 'crustaceos', 'ovo', 'peixe', 'amendoim', 'soja', 'leite',
  'frutos_casca_rija', 'aipo', 'mostarda', 'sesamo', 'sulfitos', 'tremoco', 'moluscos',
] as const;
export type Allergen = typeof ALLERGENS[number];
export type AllergenInfo = Allergen[] | 'unknown';

export const DIET_TAGS = ['vegetariana', 'vegana', 'sem_gluten', 'sem_lactose'] as const;
export type DietTag = typeof DIET_TAGS[number];
export type DietStatus = 'compativel' | 'incompativel' | 'desconhecido';
export type DietCompatibility = Record<DietTag, DietStatus>;
export type DietaryRule = DietTag | 'nenhuma';

export type MealType = 'pequeno_almoco' | 'almoco' | 'jantar' | 'lanche';
export type Priority = 'mais_barato' | 'saudavel' | 'rapido' | 'melhor_valor';
export type RecipeTag = 'saudavel' | 'rapido' | 'economica';
export type SupermarketId = 'continente' | 'pingo_doce';
export type Weekday = 'segunda' | 'terca' | 'quarta' | 'quinta' | 'sexta' | 'sabado' | 'domingo';
export type BaseUnit = 'g' | 'ml' | 'un';
export type LooseUnit = 'colher_sopa' | 'colher_cha' | 'chavena' | 'pitada';
export type RecipeUnit = BaseUnit | LooseUnit;
export type IngredientCategory = 'carne_peixe' | 'laticinios_ovos' | 'frutas_legumes' | 'hidratos' | 'despensa';
export type PriceState = 'manual' | 'verificado' | 'observado' | 'estimativa' | 'desconhecido';
export type SellingModel = 'fixed_package' | 'variable_weight' | 'per_unit';
export type PriceObservation = {
  provider: 'cesta_mcp' | 'scrapling';
  sourceProductId: string;
  checkedAt: string;
  checkedDate: string;
  currency: 'EUR';
  availability: 'available' | 'unavailable';
  unitPrice?: { amount: number; unit: 'kg' | 'l' | 'un' };
  promotion?: { regularPrice: number; discountPercent: number | null; validUntil: null };
};

export type Estimate = { value: number; low?: number; high?: number; enteredAt: string };
export type PriceHistoryEntry = {
  id: string;
  price: number | null;
  priceState: PriceState;
  estimate?: Estimate;
  recordedAt: string;
  effectiveDate: string | null;
  sourceUrl: string | null;
  note: string | null;
  observation?: PriceObservation;
};

export type Ingredient = {
  id: string;
  name: string;
  category: IngredientCategory;
  baseUnit: BaseUnit;
  allergens: AllergenInfo;
  dietCompatibility: DietCompatibility;
  isNeutral: boolean;
  unitConversions?: Partial<Record<LooseUnit, number>>;
};

export type Product = {
  id: string;
  name: string;
  supermarketId: SupermarketId;
  ingredientId: string;
  packSize: number;
  unit: BaseUnit;
  sellingModel?: SellingModel;
  minimumQuantity?: number | null;
  minimumQuantityUnit?: BaseUnit | null;
  unitQuantity?: number | null;
  actualCheckoutQuantity?: number | null;
  price: number | null;
  priceState: PriceState;
  priceUpdatedAt: string | null;
  estimate?: Estimate;
  allergens: AllergenInfo;
  dietCompatibility: DietCompatibility;
  promo?: { price: number; validUntil: string };
  brand?: string | null;
  productUrl?: string | null;
  barcode?: string | null;
  barcodes?: string[];
  imageUrl?: string | null;
  imageSourceUrl?: string | null;
  externalProductId?: string | null;
  availability?: 'available' | 'unavailable';
  unitPrice?: { amount: number; unit: 'kg' | 'l' | 'un' };
  priceObservation?: PriceObservation;
  catalogueSource?: 'generic_seed' | 'user' | 'open_prices' | 'cesta_mcp' | 'scrapling';
  priceHistory?: PriceHistoryEntry[];
};

export type RecipeLine = { ingredientId: string; amount: number; unit: RecipeUnit; optional?: boolean };

export type Recipe = {
  id: string;
  name: string;
  description: string;
  imageUrl?: string;
  mealTypes: MealType[];
  baseServings: number;
  prepMinutes: number;
  tags: RecipeTag[];
  ingredients: RecipeLine[];
  steps: string[];
  declaredAllergens: AllergenInfo;
  declaredDietCompatibility: DietCompatibility;
};

export type UserProfile = {
  supermarketId: SupermarketId;
  people: number;
  mealTypes: MealType[];
  dietaryRule: DietaryRule;
  allergens: Allergen[];
  exclusionText: string[];
  ownedIngredientIds: string[];
  priority: Priority;
  weeklyBudget: number;
};

export type Slot = { mealType: MealType; recipeId: string; locked: boolean };
export type PlanDay = { day: Weekday; slots: Slot[] };
export type Plan = {
  id: string;
  createdAt: string;
  profile: UserProfile;
  days: PlanDay[];
  productOverrides: Record<string, string>;
  purchased: Record<string, boolean>;
};

export type Catalogue = {
  ingredients: Ingredient[];
  recipes: Recipe[];
  products: Product[];
};

export type ValidationError = { code: string; path: string; message: string };
export type ValidationResult = { ok: true } | { ok: false; errors: ValidationError[] };

export type QuantityWarning = { ingredientId: string; recipeId: string; unit: LooseUnit };
export type IngredientNeed = { ingredientId: string; quantity: number; quantityUncertain: boolean; warnings: QuantityWarning[] };
export type ProductSelection =
  | { status: 'selected'; product: Product; packs: number; priceState: PriceState; perPackPriceCents: number | null; checkoutCents: number | null; expectedCheckoutCents?: number | null; checkoutQuantity?: number | null; checkoutQuantityKnown?: boolean; consumptionCents: number | null }
  | { status: 'unavailable'; reason: 'no_safe_product' | 'unsafe_override' };
export type BasketLine = {
  ingredientId: string;
  ingredientName: string;
  quantity: number | null;
  quantityUncertain: boolean;
  warnings: QuantityWarning[];
  owned: boolean;
  selection: ProductSelection;
  checkoutCents: number | null;
  expectedCheckoutCents: number | null;
  consumptionCents: number | null;
};
export type BasketRange = { low: number; high: number };
export type Basket = {
  lines: BasketLine[];
  subtotalKnownCents: number;
  estimatedTotalCents: number;
  unknownLines: BasketLine[];
  rangeCents: BasketRange | null;
  consumptionTotalCents: number;
  observedTotalCents: number;
  consumptionIncomplete: boolean;
  hasEstimate: boolean;
  hasObservation: boolean;
  hasUnknown: boolean;
  hasUnavailable: boolean;
  hasUncertainQuantity: boolean;
};
export type BudgetStatus = 'dentro' | 'excede' | 'provavel_dentro' | 'excede_estimado' | 'incerto' | 'incompleto';
