/**
 * Merchant catalogue for the synthetic generator, shaped like a Monterrey card
 * statement rather than a US sample dataset.
 *
 * Honesty notes, because this file looks like data and is not:
 *
 * - The names are real businesses that operate in Monterrey, used only as labels
 *   on synthetic rows. None of them is a partner, none sponsors or endorses this
 *   project, and no row here says anything about a real company's prices.
 * - The ranges are plausible parameters chosen so the generated distribution looks
 *   like a statement. They are not measured data and not price quotes.
 *   TODO(FabriBanda): if any number from this file ends up in docs/04-market.md or
 *   docs/05-business-model.md, replace it with a cited source first.
 * - Nothing from this catalogue is ever written to Nessie's /enterprise/* pool,
 *   which is shared with every other team. See the Nessie rules in AGENTS.md.
 *
 * Why the shape matters: a generic generator produces uniform amounts across a
 * handful of merchants, and an engine tuned on that falls over on the real thing.
 * Here the convenience-store rows are many and small, the warehouse-club rows are
 * few and large, the services are fixed and monthly, and the amounts are lognormal,
 * so the median and the tail behave like money actually does.
 */

export type MerchantCategory =
  | "groceries"
  | "convenience"
  | "fuel"
  | "utilities"
  | "telecom"
  | "streaming"
  | "pharmacy"
  | "restaurants"
  | "transport"
  | "delivery"
  | "entertainment"
  | "apparel"
  | "home"
  | "fitness"
  | "education";

export interface MerchantSpec {
  name: string;
  category: MerchantCategory;
  /** Lowest plausible ticket in MXN. */
  min: number;
  /** Highest plausible ticket in MXN. */
  max: number;
  /** Roughly how many times one household pays this merchant in a month. */
  monthlyFrequency: number;
  /**
   * A fixed monthly service billed on a day of the month, not tapped at a till.
   * These become bills, not purchases.
   */
  recurring?: boolean;
}

export const MX_MERCHANTS: readonly MerchantSpec[] = [
  // High frequency, small tickets. This is where a Mexican statement gets noisy.
  {
    name: "OXXO Garza Sada",
    category: "convenience",
    min: 25,
    max: 180,
    monthlyFrequency: 12,
  },
  {
    name: "OXXO Cumbres",
    category: "convenience",
    min: 25,
    max: 180,
    monthlyFrequency: 6,
  },
  {
    name: "7-Eleven Valle",
    category: "convenience",
    min: 30,
    max: 200,
    monthlyFrequency: 3,
  },
  {
    name: "Tiendita de la esquina",
    category: "convenience",
    min: 15,
    max: 120,
    monthlyFrequency: 8,
  },

  // Groceries, weekly and heavy.
  {
    name: "HEB Contry",
    category: "groceries",
    min: 220,
    max: 1800,
    monthlyFrequency: 4,
  },
  {
    name: "HEB Valle Oriente",
    category: "groceries",
    min: 250,
    max: 2200,
    monthlyFrequency: 2,
  },
  {
    name: "Soriana Hiper Lincoln",
    category: "groceries",
    min: 180,
    max: 1500,
    monthlyFrequency: 2,
  },
  {
    name: "Walmart Mitras",
    category: "groceries",
    min: 200,
    max: 1900,
    monthlyFrequency: 2,
  },
  {
    name: "Bodega Aurrera Anahuac",
    category: "groceries",
    min: 90,
    max: 800,
    monthlyFrequency: 2,
  },
  {
    name: "Sam's Club Gonzalitos",
    category: "groceries",
    min: 600,
    max: 3500,
    monthlyFrequency: 0.6,
  },
  {
    name: "Costco Valle Oriente",
    category: "groceries",
    min: 800,
    max: 4500,
    monthlyFrequency: 0.5,
  },

  // Fuel.
  {
    name: "Pemex Gonzalitos",
    category: "fuel",
    min: 300,
    max: 900,
    monthlyFrequency: 4,
  },
  {
    name: "Pemex Garza Sada",
    category: "fuel",
    min: 300,
    max: 900,
    monthlyFrequency: 2,
  },

  // Fixed monthly services. These become bills with a recurring day.
  {
    name: "CFE",
    category: "utilities",
    min: 280,
    max: 1400,
    monthlyFrequency: 1,
    recurring: true,
  },
  {
    name: "Agua y Drenaje de Monterrey",
    category: "utilities",
    min: 150,
    max: 600,
    monthlyFrequency: 1,
    recurring: true,
  },
  {
    name: "Naturgy",
    category: "utilities",
    min: 120,
    max: 520,
    monthlyFrequency: 1,
    recurring: true,
  },
  {
    name: "Telcel",
    category: "telecom",
    min: 200,
    max: 700,
    monthlyFrequency: 1,
    recurring: true,
  },
  {
    name: "AT&T Mexico",
    category: "telecom",
    min: 180,
    max: 650,
    monthlyFrequency: 1,
    recurring: true,
  },
  {
    name: "Totalplay",
    category: "telecom",
    min: 450,
    max: 950,
    monthlyFrequency: 1,
    recurring: true,
  },
  {
    name: "Izzi",
    category: "telecom",
    min: 380,
    max: 800,
    monthlyFrequency: 1,
    recurring: true,
  },
  {
    name: "Netflix",
    category: "streaming",
    min: 139,
    max: 299,
    monthlyFrequency: 1,
    recurring: true,
  },
  {
    name: "Spotify",
    category: "streaming",
    min: 129,
    max: 199,
    monthlyFrequency: 1,
    recurring: true,
  },
  {
    name: "Smart Fit",
    category: "fitness",
    min: 299,
    max: 499,
    monthlyFrequency: 1,
    recurring: true,
  },
  {
    name: "Colegiatura universitaria",
    category: "education",
    min: 2500,
    max: 6000,
    monthlyFrequency: 1,
    recurring: true,
  },

  // Pharmacies.
  {
    name: "Farmacias Guadalajara",
    category: "pharmacy",
    min: 60,
    max: 700,
    monthlyFrequency: 2,
  },
  {
    name: "Farmacias Benavides",
    category: "pharmacy",
    min: 80,
    max: 600,
    monthlyFrequency: 1,
  },
  {
    name: "Farmacia del Ahorro",
    category: "pharmacy",
    min: 70,
    max: 650,
    monthlyFrequency: 1,
  },

  // Eating out, weekend heavy.
  {
    name: "Taqueria del Obispado",
    category: "restaurants",
    min: 80,
    max: 320,
    monthlyFrequency: 5,
  },
  {
    name: "Cafe de barrio Centrito",
    category: "restaurants",
    min: 50,
    max: 180,
    monthlyFrequency: 4,
  },
  {
    name: "Starbucks Valle",
    category: "restaurants",
    min: 70,
    max: 220,
    monthlyFrequency: 3,
  },
  {
    name: "Las Alitas Contry",
    category: "restaurants",
    min: 250,
    max: 900,
    monthlyFrequency: 1,
  },
  {
    name: "Little Caesars Mitras",
    category: "restaurants",
    min: 120,
    max: 400,
    monthlyFrequency: 1.5,
  },
  {
    name: "El Pollo Loco Lincoln",
    category: "restaurants",
    min: 150,
    max: 500,
    monthlyFrequency: 1,
  },

  // Getting around.
  {
    name: "Uber",
    category: "transport",
    min: 60,
    max: 350,
    monthlyFrequency: 6,
  },
  {
    name: "DiDi",
    category: "transport",
    min: 50,
    max: 300,
    monthlyFrequency: 4,
  },
  {
    name: "Metrorrey",
    category: "transport",
    min: 10,
    max: 80,
    monthlyFrequency: 8,
  },

  // Delivery.
  {
    name: "Uber Eats",
    category: "delivery",
    min: 120,
    max: 600,
    monthlyFrequency: 3,
  },
  {
    name: "Rappi",
    category: "delivery",
    min: 100,
    max: 550,
    monthlyFrequency: 3,
  },
  {
    name: "DiDi Food",
    category: "delivery",
    min: 90,
    max: 500,
    monthlyFrequency: 1.5,
  },

  // Occasional and large.
  {
    name: "Cinepolis Galerias",
    category: "entertainment",
    min: 90,
    max: 400,
    monthlyFrequency: 1,
  },
  {
    name: "Liverpool Valle Oriente",
    category: "apparel",
    min: 400,
    max: 3000,
    monthlyFrequency: 0.5,
  },
  {
    name: "Coppel Centro",
    category: "apparel",
    min: 250,
    max: 2000,
    monthlyFrequency: 0.4,
  },
  {
    name: "Innovasport Galerias",
    category: "apparel",
    min: 500,
    max: 2500,
    monthlyFrequency: 0.3,
  },
  {
    name: "Home Depot Lincoln",
    category: "home",
    min: 150,
    max: 2000,
    monthlyFrequency: 0.6,
  },
];

/** Every category present in the catalogue, sorted, derived rather than restated. */
export const MX_MERCHANT_CATEGORIES: readonly MerchantCategory[] = [
  ...new Set(MX_MERCHANTS.map((merchant) => merchant.category)),
].sort();

/** Categories that cluster on Friday, Saturday and Sunday. */
export const WEEKEND_HEAVY_CATEGORIES: readonly MerchantCategory[] = [
  "restaurants",
  "delivery",
  "entertainment",
  "apparel",
];

/**
 * The merchant the generator deliberately ships with no category at all, so the
 * engine is forced to handle the gap that real data always has.
 */
export const MERCHANT_WITHOUT_CATEGORY = "Taqueria del Obispado";

/**
 * The merchant name the generator deliberately issues twice under two ids, which
 * is the deduplication case every transaction product runs into.
 */
export const DUPLICATED_MERCHANT_NAME = "OXXO Garza Sada";

export function merchantsByCategory(
  category: MerchantCategory,
): MerchantSpec[] {
  return MX_MERCHANTS.filter((merchant) => merchant.category === category);
}

/** Fixed monthly services: these become bills. */
export function recurringMerchants(): MerchantSpec[] {
  return MX_MERCHANTS.filter((merchant) => merchant.recurring === true);
}

/** Everything paid at a till or in an app: these become purchases. */
export function tappedMerchants(): MerchantSpec[] {
  return MX_MERCHANTS.filter((merchant) => merchant.recurring !== true);
}

export function isWeekendHeavy(category: MerchantCategory): boolean {
  return WEEKEND_HEAVY_CATEGORIES.includes(category);
}
