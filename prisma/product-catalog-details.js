/**
 * Authoritative storefront copy for every seeded SKU.
 * No mock fallbacks — seed-products.js requires an entry for each slug.
 */

const CATALOG_DETAILS = {
  // ─── CHICKEN ───────────────────────────────────────────────────────────────
  'chicken-curry-cut': {
    cutType: 'Curry Cut',
    description:
      'Bone-in chicken cut into curry-ready pieces, cleaned and trimmed of excess fat. Ideal for everyday home-style curries and gravies.',
    storefrontMeta: {
      origin: 'Sourced from government-approved poultry farms within 100km of our processing unit.',
      cutInfo: 'Bone-in pieces, cut into 8–10 curry-sized portions per kg.',
      storageInstructions: 'Refrigerate at 0–4°C and use within 2 days, or freeze at -18°C for up to 3 months.',
      cookingTips: 'Marinate for at least 30 minutes before cooking for best flavor absorption in gravies.',
      freshnessTags: ['Farm Fresh', 'Antibiotic-Free', 'Hygienically Packed'],
    },
  },
  'chicken-breast-boneless': {
    cutType: 'Boneless',
    description:
      'Skinless, boneless chicken breast fillets trimmed of fat and connective tissue. A lean protein option suited for grilling, stir-fries, and healthy meal prep.',
    storefrontMeta: {
      origin: 'Sourced from government-approved poultry farms within 100km of our processing unit.',
      cutInfo: 'Whole breast fillets, deboned and skin removed, average 200–250g per piece.',
      storageInstructions: 'Refrigerate at 0–4°C and use within 2 days, or freeze at -18°C for up to 3 months.',
      cookingTips: 'Pound to even thickness before pan-searing so it cooks uniformly without drying out.',
      freshnessTags: ['Farm Fresh', 'Antibiotic-Free', 'Lean Cut'],
    },
  },
  'whole-chicken-skinless': {
    cutType: 'Whole',
    description:
      'A whole dressed chicken with skin removed, cleaned and ready to cook. Suited for roasting, tandoori preparations, or portioning at home.',
    storefrontMeta: {
      origin: 'Sourced from government-approved poultry farms within 100km of our processing unit.',
      cutInfo: 'Whole bird, skin and giblets removed, average weight 900g–1.1kg.',
      storageInstructions: 'Refrigerate at 0–4°C and use within 1–2 days, or freeze at -18°C for up to 3 months.',
      cookingTips: 'Pat dry before marinating so spice rubs stick evenly for roasting or tandoori.',
      freshnessTags: ['Farm Fresh', 'Antibiotic-Free', 'Skinless'],
    },
  },

  // ─── MUTTON ────────────────────────────────────────────────────────────────
  'mutton-boneless': {
    cutType: 'Boneless',
    description:
      'Boneless mutton cubes trimmed of excess fat, cut for slow-cooked curries and roasts. Sourced from young goats for a tender texture.',
    storefrontMeta: {
      origin: 'Sourced from local goat farms and inspected before processing.',
      cutInfo: 'Boneless cubes, roughly 1-inch pieces, trimmed of excess fat.',
      storageInstructions: 'Refrigerate at 0–4°C and use within 2 days, or freeze at -18°C for up to 2 months.',
      cookingTips: 'Slow-cook for at least 45 minutes on low heat to tenderize the meat fully.',
      freshnessTags: ['Farm Fresh', 'Hand Trimmed', 'Hygienically Packed'],
    },
  },
  'mutton-curry-cut': {
    cutType: 'Curry Cut',
    description:
      'Bone-in mutton cut into curry-sized pieces, a mix of rib and shoulder cuts. A classic choice for traditional home-style mutton curry.',
    storefrontMeta: {
      origin: 'Sourced from local goat farms and inspected before processing.',
      cutInfo: 'Bone-in pieces from rib and shoulder, cut into 1.5–2 inch portions.',
      storageInstructions: 'Refrigerate at 0–4°C and use within 2 days, or freeze at -18°C for up to 2 months.',
      cookingTips: 'Pressure cook for 4–5 whistles on medium flame for a tender, flavorful curry.',
      freshnessTags: ['Farm Fresh', 'Hand Trimmed', 'Hygienically Packed'],
    },
  },
  'mutton-keema': {
    cutType: 'Minced',
    description:
      'Freshly minced mutton, ground from lean cuts with a light fat ratio for flavor. Perfect for keema curry, kebabs, and stuffed parathas.',
    storefrontMeta: {
      origin: 'Sourced from local goat farms and inspected before processing.',
      cutInfo: 'Double-ground mince from lean shoulder and leg cuts.',
      storageInstructions: 'Refrigerate at 0–4°C and use within 1 day, or freeze at -18°C for up to 1 month.',
      cookingTips: 'Cook on high heat first to seal in juices, then simmer with spices to avoid a dry texture.',
      freshnessTags: ['Farm Fresh', 'Freshly Ground', 'Hygienically Packed'],
    },
  },
  'mutton-seekh-cut': {
    cutType: 'Boneless',
    description:
      'Boneless mutton cut and coarsely minced for seekh kebabs, with a balanced fat content for juicy grilling. Ready to season and skewer.',
    storefrontMeta: {
      origin: 'Sourced from local goat farms and inspected before processing.',
      cutInfo: 'Coarse boneless mince blended for kebab-grade texture and fat ratio.',
      storageInstructions: 'Refrigerate at 0–4°C and use within 1 day, or freeze at -18°C for up to 1 month.',
      cookingTips: 'Rest the seasoned mince for 20 minutes before skewering so it holds shape on the grill.',
      freshnessTags: ['Farm Fresh', 'Kebab Ready', 'Hygienically Packed'],
    },
  },

  // ─── FISH ──────────────────────────────────────────────────────────────────
  'fresh-rohu-fish': {
    cutType: 'Whole',
    description:
      'Whole Rohu fish, scaled and cleaned, sourced fresh from inland fisheries. A household favorite for Bengali and North Indian fish curries.',
    storefrontMeta: {
      origin: 'Sourced fresh from inland freshwater fisheries and delivered same-day.',
      cutInfo: 'Whole fish, scaled and gutted, head-on unless requested otherwise.',
      storageInstructions: 'Refrigerate at 0–4°C and use within 1 day, or freeze at -18°C for up to 2 months.',
      cookingTips: 'Rub with turmeric and salt and rest for 15 minutes before frying to firm up the flesh.',
      freshnessTags: ['Same-Day Catch', 'Scaled & Cleaned', 'River Fresh'],
    },
  },
  'fish-steak-cut-surmai': {
    cutType: 'Steak Cut',
    description:
      'Surmai (king fish) sliced into thick steaks, ideal for shallow frying or grilling. Firm, low-bone flesh that holds together well when cooked.',
    storefrontMeta: {
      origin: 'Sourced from coastal fishing partners and processed within hours of catch.',
      cutInfo: 'Cross-cut steaks, approximately 1.5–2cm thick, skin-on.',
      storageInstructions: 'Refrigerate at 0–4°C and use within 1 day, or freeze at -18°C for up to 2 months.',
      cookingTips: 'Shallow fry on medium-high heat for 3–4 minutes per side for a crisp crust without drying the center.',
      freshnessTags: ['Coastal Catch', 'Low Bone', 'Steak Cut'],
    },
  },

  // ─── SEAFOOD ───────────────────────────────────────────────────────────────
  'prawns-medium': {
    cutType: 'Whole',
    description:
      'Medium-sized prawns, deveined and cleaned, sourced from coastal waters. Versatile for curries, stir-fries, and fry preparations.',
    storefrontMeta: {
      origin: 'Sourced from coastal aquaculture farms and processed within hours of harvest.',
      cutInfo: 'Head-off, deveined prawns, roughly 30–40 pieces per kg.',
      storageInstructions: 'Keep refrigerated at 0–4°C and use within 1 day, or freeze at -18°C for up to 2 months.',
      cookingTips: 'Do not overcook — prawns turn rubbery past 3–4 minutes on high heat.',
      freshnessTags: ['Coastal Catch', 'Deveined', 'Cleaned & Ready'],
    },
  },
  'tiger-prawns-large': {
    cutType: 'Whole',
    description:
      'Large tiger prawns, deveined with shell-on for extra flavor while cooking. A premium choice for grilling, tandoori preparations, and festive meals.',
    storefrontMeta: {
      origin: 'Sourced from coastal aquaculture farms and processed within hours of harvest.',
      cutInfo: 'Shell-on, deveined prawns, roughly 12–16 pieces per kg.',
      storageInstructions: 'Keep refrigerated at 0–4°C and use within 1 day, or freeze at -18°C for up to 2 months.',
      cookingTips: 'Butterfly and marinate for 20 minutes before grilling for even cooking and better spice absorption.',
      freshnessTags: ['Coastal Catch', 'Premium Size', 'Deveined'],
    },
  },

  // ─── READY TO COOK ─────────────────────────────────────────────────────────
  'chicken-seekh-kebab-mix': {
    cutType: 'Breast Cut',
    description:
      'Minced chicken breast pre-blended with basic seasoning, ready to skewer and grill. Saves prep time for weeknight kebabs and barbecues.',
    storefrontMeta: {
      origin: 'Prepared in-house from boneless chicken breast sourced from our poultry partners.',
      cutInfo: 'Fine mince from breast cut, lightly seasoned and portioned for skewering.',
      storageInstructions: 'Refrigerate at 0–4°C and use within 1 day, or freeze at -18°C for up to 1 month.',
      cookingTips: 'Wet your hands before shaping the mince onto skewers to prevent sticking.',
      freshnessTags: ['Ready to Cook', 'Pre-Seasoned', 'Freshly Prepared'],
    },
  },
  'chicken-curry-marinated': {
    cutType: 'Curry Cut',
    description:
      'Bone-in chicken curry cut, pre-marinated with a home-style spice blend. Just cook straight from the pack for a quick weeknight curry.',
    storefrontMeta: {
      origin: 'Prepared in-house using bone-in chicken curry cut sourced from our poultry partners.',
      cutInfo: 'Curry-cut pieces marinated in a base spice blend, ready to cook.',
      storageInstructions: 'Refrigerate at 0–4°C and use within 1 day, or freeze at -18°C for up to 1 month.',
      cookingTips: 'Cook directly from chilled — no extra marination time needed, just add oil and onions.',
      freshnessTags: ['Ready to Cook', 'Pre-Marinated', 'Freshly Prepared'],
    },
  },

  // ─── EGGS ──────────────────────────────────────────────────────────────────
  'farm-fresh-eggs-6-pcs-tray': {
    description:
      'Farm-fresh eggs in a 6-piece tray, sourced from free-range layer hens. Packed and delivered within days of laying.',
    storefrontMeta: {
      origin: 'Sourced from free-range layer farms and collected daily.',
      cutInfo: 'Tray of 6 whole eggs, medium to large size.',
      storageInstructions: 'Refrigerate at 4–8°C and use within 2–3 weeks of purchase.',
      cookingTips: 'Bring to room temperature before boiling to prevent the shell from cracking.',
      freshnessTags: ['Farm Fresh', 'Free-Range', 'Daily Collected'],
    },
  },
  'farm-fresh-eggs-12-pcs-tray': {
    description:
      'Farm-fresh eggs in a 12-piece tray, sourced from free-range layer hens. A convenient family-size pack delivered within days of laying.',
    storefrontMeta: {
      origin: 'Sourced from free-range layer farms and collected daily.',
      cutInfo: 'Tray of 12 whole eggs, medium to large size.',
      storageInstructions: 'Refrigerate at 4–8°C and use within 2–3 weeks of purchase.',
      cookingTips: 'Store pointed-end down in the tray to keep the yolk centered for longer freshness.',
      freshnessTags: ['Farm Fresh', 'Free-Range', 'Family Pack'],
    },
  },
  'farm-fresh-eggs-30-pcs-tray': {
    description:
      'Farm-fresh eggs in a bulk 30-piece tray, sourced from free-range layer hens. Ideal for households, bakeries, and small cafes.',
    storefrontMeta: {
      origin: 'Sourced from free-range layer farms and collected daily.',
      cutInfo: 'Bulk tray of 30 whole eggs, medium to large size.',
      storageInstructions: 'Refrigerate at 4–8°C and use within 3 weeks of purchase.',
      cookingTips: 'Check freshness with a water float test before use if stored near the expiry window.',
      freshnessTags: ['Farm Fresh', 'Free-Range', 'Bulk Pack'],
    },
  },

  // ─── COMBO PACKS ───────────────────────────────────────────────────────────
  'weekly-non-veg-combo': {
    description:
      "A curated weekly combo with chicken curry cut, mutton curry cut, and a whole fish, portioned for a family's non-veg meals across the week. Individually packed for easy storage.",
    storefrontMeta: {
      origin: 'Combo assembled from our regular poultry, goat, and fish suppliers.',
      cutInfo: 'Includes 1kg chicken curry cut, 1kg mutton curry cut, and 1 whole fish, individually packed.',
      storageInstructions:
        'Refrigerate immediately and use chicken and fish within 2 days; mutton keeps up to 2 days chilled. Freeze any portion not used within that window.',
      cookingTips: 'Cook the fish and chicken first within the week; mutton freezes well if you want to save it for later.',
      freshnessTags: ['Weekly Combo', 'Individually Packed', 'Family Size'],
    },
  },
  'family-bbq-combo-pack': {
    description:
      'A grilling combo with a mix of chicken and mutton cuts suited for barbecues, pre-portioned for a family gathering. Just season and grill.',
    storefrontMeta: {
      origin: 'Combo assembled from our regular poultry and goat suppliers.',
      cutInfo: 'Includes a mix of boneless chicken, chicken seekh kebab mix, and mutton seekh cut, individually packed.',
      storageInstructions: 'Refrigerate at 0–4°C and use within 1 day, or freeze at -18°C for up to 1 month.',
      cookingTips: 'Bring all portions to room temperature for 20 minutes before grilling for even cooking.',
      freshnessTags: ['BBQ Ready', 'Individually Packed', 'Family Size'],
    },
  },
};

module.exports = { CATALOG_DETAILS };
