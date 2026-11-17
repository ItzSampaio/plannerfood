import { ALLERGENS, DIET_TAGS, type AllergenInfo, type Catalogue, type DietCompatibility, type DietStatus, type Ingredient, type IngredientCategory, type MealType, type PriceState, type Recipe, type SupermarketId, type ValidationError, type ValidationResult } from '../types';
import { deriveRecipeAllergens } from '../safety/allergens';
import { deriveRecipeDiet } from '../safety/diet';

const ingredientCategories: IngredientCategory[] = ['carne_peixe', 'laticinios_ovos', 'frutas_legumes', 'hidratos', 'despensa'];
const units = ['g', 'ml', 'un'] as const;
const looseUnits = ['colher_sopa', 'colher_cha', 'chavena', 'pitada'] as const;
const meals: MealType[] = ['pequeno_almoco', 'almoco', 'jantar', 'lanche'];
const supermarkets: SupermarketId[] = ['continente', 'pingo_doce'];
const priceStates: PriceState[] = ['manual', 'verificado', 'observado', 'estimativa', 'desconhecido'];
const dietStatuses: DietStatus[] = ['compativel', 'incompativel', 'desconhecido'];
const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null && !Array.isArray(value);
const finitePositive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
const finiteNonNegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const hasCentsPrecision = (value: number): boolean => Math.round(value * 100) / 100 === value;
const isIsoDate = (value: unknown): value is string => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`)) && new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;

function add(errors: ValidationError[], code: string, path: string, message: string): void { errors.push({ code, path, message }); }
function isWebUrl(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  try { const url = new URL(value); return url.protocol === 'https:' || url.protocol === 'http:'; } catch { return false; }
}
function isAllergenInfo(value: unknown): value is AllergenInfo {
  return value === 'unknown' || (Array.isArray(value) && value.every((item) => typeof item === 'string' && (ALLERGENS as readonly string[]).includes(item)));
}
function sameValues(left: AllergenInfo, right: AllergenInfo): boolean {
  if (left === 'unknown' || right === 'unknown') return left === right;
  return [...left].sort().join('|') === [...right].sort().join('|');
}
function validDiet(value: unknown): value is DietCompatibility {
  return isRecord(value) && Object.keys(value).length === DIET_TAGS.length
    && DIET_TAGS.every((tag) => dietStatuses.includes(value[tag] as DietStatus));
}
function dietEqual(left: DietCompatibility, right: DietCompatibility): boolean { return DIET_TAGS.every((tag) => left[tag] === right[tag]); }
function uniqueIds(rows: unknown[], path: string, errors: ValidationError[]): void {
  const seen = new Set<string>();
  rows.forEach((row, index) => {
    if (!isRecord(row) || typeof row.id !== 'string' || row.id.trim() === '') add(errors, 'id.invalid', `${path}[${index}].id`, 'ID must be a non-empty string.');
    else if (seen.has(row.id)) add(errors, 'id.duplicate', `${path}[${index}].id`, `Duplicate ID: ${row.id}.`);
    else seen.add(row.id);
  });
}

export function validateIngredients(input: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  if (!Array.isArray(input)) return { ok: false, errors: [{ code: 'collection.invalid', path: 'ingredients', message: 'Expected an array.' }] };
  uniqueIds(input, 'ingredients', errors);
  input.forEach((value, index) => {
    const path = `ingredients[${index}]`;
    if (!isRecord(value)) { add(errors, 'record.invalid', path, 'Expected an ingredient object.'); return; }
    if (typeof value.name !== 'string' || !value.name.trim()) add(errors, 'name.invalid', `${path}.name`, 'Name is required.');
    if (!ingredientCategories.includes(value.category as IngredientCategory)) add(errors, 'enum.invalid', `${path}.category`, 'Unknown ingredient category.');
    if (!(units as readonly unknown[]).includes(value.baseUnit)) add(errors, 'enum.invalid', `${path}.baseUnit`, 'Unknown base unit.');
    if (!isAllergenInfo(value.allergens)) add(errors, 'allergens.invalid', `${path}.allergens`, 'Expected an EU-14 allergen list or unknown.');
    if (!validDiet(value.dietCompatibility)) add(errors, 'diet.invalid', `${path}.dietCompatibility`, 'All four diet compatibility values are required.');
    if (typeof value.isNeutral !== 'boolean') add(errors, 'neutral.invalid', `${path}.isNeutral`, 'isNeutral must be a boolean.');
    if (value.unitConversions !== undefined) {
      if (!isRecord(value.unitConversions)) add(errors, 'conversion.invalid', `${path}.unitConversions`, 'Expected an object of loose-unit conversions.');
      else for (const [unit, amount] of Object.entries(value.unitConversions)) {
        if (!(looseUnits as readonly string[]).includes(unit) || !finitePositive(amount)) add(errors, 'conversion.invalid', `${path}.unitConversions.${unit}`, 'Conversion unit must be known and amount must be positive.');
      }
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true };
}

export function validateRecipes(input: unknown, ingredientInput: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  if (!Array.isArray(input)) return { ok: false, errors: [{ code: 'collection.invalid', path: 'recipes', message: 'Expected an array.' }] };
  const ingredientResult = validateIngredients(ingredientInput);
  if (!ingredientResult.ok) return { ok: false, errors: ingredientResult.errors.map((error) => ({ ...error, path: `catalogue.${error.path}` })) };
  const ingredients = ingredientInput as Ingredient[];
  const ingredientMap = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  uniqueIds(input, 'recipes', errors);
  input.forEach((value, index) => {
    const path = `recipes[${index}]`;
    if (!isRecord(value)) { add(errors, 'record.invalid', path, 'Expected a recipe object.'); return; }
    if (typeof value.name !== 'string' || !value.name.trim()) add(errors, 'name.invalid', `${path}.name`, 'Name is required.');
    if (typeof value.description !== 'string') add(errors, 'description.invalid', `${path}.description`, 'Description must be a string.');
    if (value.imageUrl !== undefined && (typeof value.imageUrl !== 'string' || !value.imageUrl.trim())) add(errors, 'image.invalid', `${path}.imageUrl`, 'imageUrl must be a non-empty string when provided.');
    if (!Array.isArray(value.mealTypes) || value.mealTypes.length < 1 || value.mealTypes.some((item) => !meals.includes(item as MealType))) add(errors, 'meal_types.invalid', `${path}.mealTypes`, 'At least one known meal type is required.');
    if (!Number.isInteger(value.baseServings) || Number(value.baseServings) < 1) add(errors, 'servings.invalid', `${path}.baseServings`, 'baseServings must be an integer of at least one.');
    if (!Number.isInteger(value.prepMinutes) || Number(value.prepMinutes) < 0) add(errors, 'prep.invalid', `${path}.prepMinutes`, 'prepMinutes must be a non-negative integer.');
    if (!Array.isArray(value.tags) || value.tags.some((tag) => !['saudavel', 'rapido', 'economica'].includes(String(tag)))) add(errors, 'tags.invalid', `${path}.tags`, 'Recipe tags must be known.');
    if (!Array.isArray(value.steps) || value.steps.length < 1 || value.steps.some((step) => typeof step !== 'string' || !step.trim())) add(errors, 'steps.invalid', `${path}.steps`, 'At least one non-empty step is required.');
    if (!Array.isArray(value.ingredients) || value.ingredients.length < 1) { add(errors, 'recipe_ingredients.invalid', `${path}.ingredients`, 'At least one ingredient line is required.'); return; }
    let linesValid = true;
    value.ingredients.forEach((line, lineIndex) => {
      const linePath = `${path}.ingredients[${lineIndex}]`;
      if (!isRecord(line)) { add(errors, 'line.invalid', linePath, 'Expected a recipe ingredient line.'); linesValid = false; return; }
      if (typeof line.ingredientId !== 'string' || !ingredientMap.has(line.ingredientId)) { add(errors, 'reference.invalid', `${linePath}.ingredientId`, 'Ingredient reference does not exist.'); linesValid = false; return; }
      if (!finitePositive(line.amount)) add(errors, 'amount.invalid', `${linePath}.amount`, 'Ingredient amount must be positive.');
      const ingredient = ingredientMap.get(line.ingredientId);
      if (!(units as readonly unknown[]).includes(line.unit) && !(looseUnits as readonly unknown[]).includes(line.unit)) add(errors, 'enum.invalid', `${linePath}.unit`, 'Unknown recipe unit.');
      if ((looseUnits as readonly unknown[]).includes(line.unit) && !finitePositive(ingredient?.unitConversions?.[line.unit as keyof NonNullable<Ingredient['unitConversions']>])) add(errors, 'conversion.missing', `${linePath}.unit`, 'Loose unit requires a positive ingredient conversion.');
      if (line.optional !== undefined && typeof line.optional !== 'boolean') add(errors, 'optional.invalid', `${linePath}.optional`, 'optional must be a boolean.');
    });
    if (!isAllergenInfo(value.declaredAllergens)) add(errors, 'allergens.invalid', `${path}.declaredAllergens`, 'Expected an EU-14 allergen list or unknown.');
    if (!validDiet(value.declaredDietCompatibility)) add(errors, 'diet.invalid', `${path}.declaredDietCompatibility`, 'All four diet compatibility values are required.');
    if (linesValid && isAllergenInfo(value.declaredAllergens) && validDiet(value.declaredDietCompatibility)) {
      const recipe = value as unknown as Recipe;
      const derivedAllergens = deriveRecipeAllergens(recipe, ingredientMap);
      if (!sameValues(value.declaredAllergens, derivedAllergens)) add(errors, 'allergens.derived_mismatch', `${path}.declaredAllergens`, 'Declared allergens must exactly match ingredient-derived allergens.');
      if (!dietEqual(value.declaredDietCompatibility, deriveRecipeDiet(recipe, ingredientMap))) add(errors, 'diet.derived_mismatch', `${path}.declaredDietCompatibility`, 'Declared dietary compatibility must match ingredient-derived compatibility.');
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true };
}

function validateProductPrice(value: Record<string, unknown>, path: string, errors: ValidationError[]): void {
  const state = value.priceState;
  const price = value.price;
  const estimate = value.estimate;
  const updated = value.priceUpdatedAt;
  if (!priceStates.includes(state as PriceState)) { add(errors, 'enum.invalid', `${path}.priceState`, 'Unknown price state.'); return; }
  if (state === 'manual' || state === 'verificado') {
    if (!finiteNonNegative(price) || !hasCentsPrecision(price)) add(errors, 'price.invalid', `${path}.price`, 'Known price must be finite, non-negative, and have at most two decimal places.');
    if (estimate !== undefined) add(errors, 'price.estimate_forbidden', `${path}.estimate`, 'Known price cannot include an estimate.');
    if (!isIsoDate(updated)) add(errors, 'price.date_required', `${path}.priceUpdatedAt`, 'Known prices require an ISO date.');
    if (value.priceObservation !== undefined) add(errors, 'price.observation_state', `${path}.priceObservation`, 'A live price observation must use the observed state.');
  } else if (state === 'observado') {
    if (!finiteNonNegative(price) || !hasCentsPrecision(price)) add(errors, 'price.observed_invalid', `${path}.price`, 'Observed price must be finite, non-negative, and use cents precision.');
    if (estimate !== undefined) add(errors, 'price.estimate_forbidden', `${path}.estimate`, 'Observed price cannot include an estimate.');
    if (!isIsoDate(updated)) add(errors, 'price.date_required', `${path}.priceUpdatedAt`, 'Observed price requires its checked date.');
    validatePriceObservation(value.priceObservation, price, path, errors, 'available');
    if (isRecord(value.priceObservation) && value.priceObservation.checkedDate !== updated) add(errors, 'price.observation_date_mismatch', `${path}.priceObservation.checkedDate`, 'Observed date must match priceUpdatedAt.');
  } else if (state === 'estimativa') {
    if (price !== null) add(errors, 'price.must_be_null', `${path}.price`, 'Estimated price must be null.');
    if (!isRecord(estimate) || !finiteNonNegative(estimate.value) || typeof estimate.enteredAt !== 'string' || !estimate.enteredAt.trim()) add(errors, 'estimate.invalid', `${path}.estimate`, 'Estimate requires a non-negative numeric value and enteredAt.');
    else {
      const hasLow = estimate.low !== undefined;
      const hasHigh = estimate.high !== undefined;
      if (hasLow !== hasHigh) add(errors, 'estimate.bounds_partial', `${path}.estimate`, 'Estimate low and high must be supplied together.');
      else if (hasLow && (!finiteNonNegative(estimate.low) || !finiteNonNegative(estimate.high) || Number(estimate.low) > Number(estimate.value) || Number(estimate.value) > Number(estimate.high))) add(errors, 'estimate.bounds_invalid', `${path}.estimate`, 'Estimate bounds must satisfy low <= value <= high.');
    }
    if (updated !== null) add(errors, 'price.date_forbidden', `${path}.priceUpdatedAt`, 'Estimated price uses estimate.enteredAt, not priceUpdatedAt.');
    if (value.priceObservation !== undefined) add(errors, 'price.observation_state', `${path}.priceObservation`, 'A live price observation must use the observed state.');
  } else {
    if (price !== null) add(errors, 'price.must_be_null', `${path}.price`, 'Unknown price must be null.');
    if (estimate !== undefined) add(errors, 'price.estimate_forbidden', `${path}.estimate`, 'Unknown price cannot include an estimate.');
    if (updated !== null) add(errors, 'price.date_forbidden', `${path}.priceUpdatedAt`, 'Unknown price cannot have a price update date.');
    if (value.priceObservation !== undefined) validatePriceObservation(value.priceObservation, null, path, errors, 'unavailable');
  }
  if (value.promo !== undefined) {
    if ((state !== 'manual' && state !== 'verificado') || !isRecord(value.promo)) add(errors, 'promo.invalid', `${path}.promo`, 'Promotion requires a known price.');
    else {
      if (!finiteNonNegative(value.promo.price) || !finiteNonNegative(price) || Number(value.promo.price) >= price || !hasCentsPrecision(value.promo.price)) add(errors, 'promo.price_invalid', `${path}.promo.price`, 'Promotion price must be lower than the regular price and use cents.');
      if (!isIsoDate(value.promo.validUntil)) add(errors, 'promo.date_invalid', `${path}.promo.validUntil`, 'Promotion validity must be an ISO date.');
    }
  }
}

function validatePriceObservation(value: unknown, price: unknown, path: string, errors: ValidationError[], availability: 'available' | 'unavailable'): void {
  if (!isRecord(value) || (value.provider !== 'cesta_mcp' && value.provider !== 'scrapling') || typeof value.sourceProductId !== 'string' || !value.sourceProductId.trim()
    || typeof value.checkedAt !== 'string' || Number.isNaN(Date.parse(value.checkedAt))
    || !isIsoDate(value.checkedDate) || value.currency !== 'EUR' || value.availability !== availability) {
    add(errors, 'price.observation_invalid', `${path}.priceObservation`, 'Observation requires a valid source, product ID, timestamp, date, currency, and availability state.');
    return;
  }
  const localDate = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Lisbon', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(value.checkedAt));
  if (localDate !== value.checkedDate) add(errors, 'price.observation_date_mismatch', `${path}.priceObservation.checkedDate`, 'Checked date must match the Europe/Lisbon timestamp date.');
  if (availability === 'available' && !finiteNonNegative(price)) add(errors, 'price.observation_price_missing', `${path}.price`, 'Available observations require a price.');
  if (availability === 'unavailable' && price !== null) add(errors, 'price.observation_unavailable_price', `${path}.price`, 'Unavailable observations cannot be assigned a price.');
  if (value.unitPrice !== undefined && (!isRecord(value.unitPrice) || !finiteNonNegative(value.unitPrice.amount) || !hasCentsPrecision(value.unitPrice.amount) || !['kg', 'l', 'un'].includes(String(value.unitPrice.unit)))) add(errors, 'price.unit_price_invalid', `${path}.priceObservation.unitPrice`, 'Observed unit price must have a valid amount and unit.');
  if (value.promotion !== undefined) {
    const promo = value.promotion;
    if (!isRecord(promo) || !finitePositive(promo.regularPrice) || !hasCentsPrecision(promo.regularPrice) || Number(promo.regularPrice) <= Number(price)
      || (promo.discountPercent !== null && (!finiteNonNegative(promo.discountPercent) || Number(promo.discountPercent) > 100)) || promo.validUntil !== null) add(errors, 'price.observed_promotion_invalid', `${path}.priceObservation.promotion`, 'Observed promotion requires a higher regular price; no end date may be inferred.');
  }
}

export function validateProducts(input: unknown, ingredientInput: unknown): ValidationResult {
  const errors: ValidationError[] = [];
  if (!Array.isArray(input)) return { ok: false, errors: [{ code: 'collection.invalid', path: 'products', message: 'Expected an array.' }] };
  const ingredientsValid = validateIngredients(ingredientInput);
  if (!ingredientsValid.ok) return { ok: false, errors: ingredientsValid.errors };
  const ingredients = ingredientInput as Ingredient[];
  const ingredientMap = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
  uniqueIds(input, 'products', errors);
  const barcodeOwners = new Map<string, number>();
  const externalOwners = new Map<string, number>();
  input.forEach((value, index) => {
    const path = `products[${index}]`;
    if (!isRecord(value)) { add(errors, 'record.invalid', path, 'Expected a product object.'); return; }
    if (typeof value.name !== 'string' || !value.name.trim()) add(errors, 'name.invalid', `${path}.name`, 'Name is required.');
    if (!supermarkets.includes(value.supermarketId as SupermarketId)) add(errors, 'enum.invalid', `${path}.supermarketId`, 'Unknown supermarket.');
    const ingredient = typeof value.ingredientId === 'string' ? ingredientMap.get(value.ingredientId) : undefined;
    if (!ingredient) add(errors, 'reference.invalid', `${path}.ingredientId`, 'Ingredient reference does not exist.');
    const sellingModel = value.sellingModel === undefined ? 'fixed_package' : value.sellingModel;
    if (!['fixed_package', 'variable_weight', 'per_unit'].includes(String(sellingModel))) add(errors, 'selling_model.invalid', `${path}.sellingModel`, 'Unknown product selling model.');
    if (sellingModel === 'variable_weight' && value.unit === 'un') add(errors, 'selling_model.unit_invalid', `${path}.sellingModel`, 'Variable-weight products require a mass or volume unit.');
    if (sellingModel === 'fixed_package' && !finitePositive(value.packSize)) add(errors, 'pack_size.invalid', `${path}.packSize`, 'Fixed-package products require a positive pack size.');
    if (sellingModel !== 'fixed_package' && value.packSize !== null && value.packSize !== undefined && !finitePositive(value.packSize)) add(errors, 'pack_size.invalid', `${path}.packSize`, 'Optional legacy pack size must be positive when provided.');
    if (sellingModel === 'per_unit' && value.unit !== 'un' && !finitePositive(value.unitQuantity)) add(errors, 'unit_quantity.required', `${path}.unitQuantity`, 'Per-unit products with a base mass/volume unit require a positive quantity per unit.');
    if (value.unitQuantity !== undefined && value.unitQuantity !== null && !finitePositive(value.unitQuantity)) add(errors, 'unit_quantity.invalid', `${path}.unitQuantity`, 'Quantity per purchased unit must be positive.');
    if (value.minimumQuantity !== undefined && value.minimumQuantity !== null && !finitePositive(value.minimumQuantity)) add(errors, 'minimum_quantity.invalid', `${path}.minimumQuantity`, 'Minimum purchase quantity must be positive.');
    if (value.minimumQuantityUnit !== undefined && value.minimumQuantityUnit !== null && !(units as readonly unknown[]).includes(value.minimumQuantityUnit)) add(errors, 'minimum_quantity_unit.invalid', `${path}.minimumQuantityUnit`, 'Minimum purchase quantity unit is invalid.');
    if (sellingModel === 'fixed_package' && value.minimumQuantity !== undefined && value.minimumQuantity !== null) add(errors, 'minimum_quantity.fixed_forbidden', `${path}.minimumQuantity`, 'Fixed packages cannot use a variable minimum quantity.');
    if (value.actualCheckoutQuantity !== undefined && value.actualCheckoutQuantity !== null && !finitePositive(value.actualCheckoutQuantity)) add(errors, 'checkout_quantity.invalid', `${path}.actualCheckoutQuantity`, 'Actual checkout quantity must be positive.');
    if (!(units as readonly unknown[]).includes(value.unit)) add(errors, 'enum.invalid', `${path}.unit`, 'Unknown product unit.');
    if (ingredient && value.unit !== ingredient.baseUnit) add(errors, 'unit.mismatch', `${path}.unit`, 'Product unit must match ingredient base unit.');
    if (value.brand !== undefined && value.brand !== null && (typeof value.brand !== 'string' || !value.brand.trim())) add(errors, 'brand.invalid', `${path}.brand`, 'Brand must be a non-empty string when provided.');
    if (value.productUrl !== undefined && value.productUrl !== null && !isWebUrl(value.productUrl)) add(errors, 'product_url.invalid', `${path}.productUrl`, 'Product URL must be an HTTP(S) URL when provided.');
    if (value.barcode !== undefined && value.barcode !== null && (typeof value.barcode !== 'string' || !/^\d{8,14}$/.test(value.barcode))) add(errors, 'barcode.invalid', `${path}.barcode`, 'Barcode must contain 8 to 14 digits when provided.');
    if (value.catalogueSource !== undefined && !['generic_seed', 'user', 'open_prices', 'cesta_mcp', 'scrapling'].includes(String(value.catalogueSource))) add(errors, 'catalogue_source.invalid', `${path}.catalogueSource`, 'Unknown catalogue source.');
    if (value.barcodes !== undefined && (!Array.isArray(value.barcodes) || value.barcodes.some((code) => typeof code !== 'string' || !/^\d{8,14}$/.test(code)))) add(errors, 'barcodes.invalid', `${path}.barcodes`, 'Barcodes must be valid EAN digit strings.');
    const identifiers = [
      ...(typeof value.barcode === 'string' && /^\d{8,14}$/.test(value.barcode) ? [{ code: value.barcode, path: `${path}.barcode` }] : []),
      ...(Array.isArray(value.barcodes) ? value.barcodes.flatMap((code, barcodeIndex) => typeof code === 'string' && /^\d{8,14}$/.test(code) ? [{ code, path: `${path}.barcodes[${barcodeIndex}]` }] : []) : []),
    ];
    for (const { code: barcode, path: barcodePath } of identifiers) {
      const owner = barcodeOwners.get(`${value.supermarketId}:${barcode}`);
      if (owner !== undefined && owner !== index) add(errors, 'barcode.duplicate', barcodePath, `EAN ${barcode} is already assigned to another product for this retailer.`);
      else barcodeOwners.set(`${value.supermarketId}:${barcode}`, index);
    }
    if (value.imageUrl !== undefined && value.imageUrl !== null && !isWebUrl(value.imageUrl)) add(errors, 'image_url.invalid', `${path}.imageUrl`, 'Image URL must be HTTP(S).');
    if (value.imageSourceUrl !== undefined && value.imageSourceUrl !== null && !isWebUrl(value.imageSourceUrl)) add(errors, 'image_source_url.invalid', `${path}.imageSourceUrl`, 'Image source URL must be HTTP(S).');
    if (value.externalProductId !== undefined && value.externalProductId !== null && (typeof value.externalProductId !== 'string' || !value.externalProductId.trim())) add(errors, 'external_product_id.invalid', `${path}.externalProductId`, 'External product ID must be non-empty text.');
    if (typeof value.externalProductId === 'string' && value.externalProductId.trim()) {
      const key = `${value.supermarketId}:${value.externalProductId}`;
      const owner = externalOwners.get(key);
      if (owner !== undefined && owner !== index) add(errors, 'external_product_id.duplicate', `${path}.externalProductId`, 'External product ID is already assigned to another product for this retailer.');
      else externalOwners.set(key, index);
    }
    if (value.availability !== undefined && !['available', 'unavailable'].includes(String(value.availability))) add(errors, 'availability.invalid', `${path}.availability`, 'Unknown product availability state.');
    if (value.unitPrice !== undefined && (!isRecord(value.unitPrice) || !finiteNonNegative(value.unitPrice.amount) || !hasCentsPrecision(value.unitPrice.amount) || !['kg', 'l', 'un'].includes(String(value.unitPrice.unit)))) add(errors, 'unit_price.invalid', `${path}.unitPrice`, 'Unit price must have a valid amount and denominator unit.');
    if (value.priceHistory !== undefined) {
      if (!Array.isArray(value.priceHistory)) add(errors, 'price_history.invalid', `${path}.priceHistory`, 'Price history must be an array.');
      else value.priceHistory.forEach((entry, historyIndex) => {
        const historyPath = `${path}.priceHistory[${historyIndex}]`;
        if (!isRecord(entry)) { add(errors, 'price_history.entry_invalid', historyPath, 'Expected a price history record.'); return; }
        if (typeof entry.id !== 'string' || !entry.id.trim()) add(errors, 'price_history.id_invalid', `${historyPath}.id`, 'History record requires an ID.');
        if (typeof entry.recordedAt !== 'string' || Number.isNaN(Date.parse(entry.recordedAt))) add(errors, 'price_history.recorded_at_invalid', `${historyPath}.recordedAt`, 'History record requires a valid recordedAt date.');
        if (entry.effectiveDate !== null && !isIsoDate(entry.effectiveDate)) add(errors, 'price_history.effective_date_invalid', `${historyPath}.effectiveDate`, 'History effectiveDate must be an ISO date or null.');
        if (entry.sourceUrl !== null && !isWebUrl(entry.sourceUrl)) add(errors, 'price_history.source_url_invalid', `${historyPath}.sourceUrl`, 'History sourceUrl must be an HTTP(S) URL or null.');
        if (entry.note !== null && typeof entry.note !== 'string') add(errors, 'price_history.note_invalid', `${historyPath}.note`, 'History note must be text or null.');
        validateProductPrice({ price: entry.price, priceState: entry.priceState, estimate: entry.estimate, priceUpdatedAt: entry.effectiveDate, priceObservation: entry.observation }, historyPath, errors);
      });
    }
    validateProductPrice(value, path, errors);
    if (!isAllergenInfo(value.allergens)) add(errors, 'allergens.invalid', `${path}.allergens`, 'Expected an EU-14 allergen list or unknown.');
    if (!validDiet(value.dietCompatibility)) add(errors, 'diet.invalid', `${path}.dietCompatibility`, 'All four diet compatibility values are required.');
    if (ingredient && isAllergenInfo(value.allergens) && value.allergens !== 'unknown' && ingredient.allergens !== 'unknown') {
      for (const allergen of ingredient.allergens) if (!value.allergens.includes(allergen)) add(errors, 'product.allergens_underspecified', `${path}.allergens`, `Product allergen list omits ingredient allergen ${allergen}.`);
    }
    if (ingredient && validDiet(value.dietCompatibility)) {
      if (!ingredient.isNeutral) for (const tag of DIET_TAGS) {
        if (ingredient.dietCompatibility[tag] === 'incompativel' && value.dietCompatibility[tag] === 'compativel') add(errors, 'product.diet_overclaim', `${path}.dietCompatibility.${tag}`, 'Product cannot be compatible when its non-neutral ingredient is incompatible.');
      }
    }
  });
  return errors.length ? { ok: false, errors } : { ok: true };
}

export function validateCatalogue(input: unknown): ValidationResult {
  if (!isRecord(input)) return { ok: false, errors: [{ code: 'catalogue.invalid', path: 'catalogue', message: 'Expected a catalogue object.' }] };
  const errors: ValidationError[] = [];
  const ingredientResult = validateIngredients(input.ingredients);
  const recipeResult = validateRecipes(input.recipes, input.ingredients);
  const productResult = validateProducts(input.products, input.ingredients);
  for (const result of [ingredientResult, recipeResult, productResult]) {
    if (!result.ok) errors.push(...result.errors);
  }
  if (Array.isArray(input.recipes) && Array.isArray(input.products) && Array.isArray(input.ingredients)
    && ingredientResult.ok && recipeResult.ok && productResult.ok) {
    const referenced = new Set<string>();
    const ingredients = input.ingredients as Ingredient[];
    const ingredientMap = new Map(ingredients.map((ingredient) => [ingredient.id, ingredient]));
    input.recipes.forEach((recipe, index) => {
      if (!isRecord(recipe) || !Array.isArray(recipe.ingredients)) return;
      for (const line of recipe.ingredients) if (isRecord(line) && typeof line.ingredientId === 'string') referenced.add(line.ingredientId);
      if (typeof recipe.id === 'string') {
        const derived = deriveRecipeAllergens(recipe as unknown as Recipe, ingredientMap);
        if (derived === 'unknown') add(errors, 'seed.allergens_unknown', `recipes[${index}].ingredients`, 'Shipped recipes must have fully known derived allergens.');
      }
    });
    const products = input.products.filter(isRecord);
    for (const ingredientId of referenced) for (const supermarket of supermarkets) {
      if (!products.some((product) => product.ingredientId === ingredientId && product.supermarketId === supermarket)) add(errors, 'seed.product_missing', `products.${ingredientId}`, `Ingredient used by a shipped recipe has no product for ${supermarket}.`);
    }
  }
  return errors.length ? { ok: false, errors } : { ok: true };
}

export const isCatalogue = (input: unknown): input is Catalogue => validateCatalogue(input).ok;
