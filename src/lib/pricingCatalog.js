import { collection, deleteDoc, doc, getDoc, getDocs, serverTimestamp, writeBatch, setDoc } from 'firebase/firestore';
import { db } from './firebase';

export const PRICING_CONFIG_REF = doc(db, 'pricingTables', 'current');
export const PRICING_PRODUCTS = 'pricingProducts';
export const DEFAULT_TIERS = [10, 20, 50, 100, 250, 500, 1000, 3000];
export const DEFAULT_CONFIG = {
  qs: DEFAULT_TIERS, avista: 0.05, t3: 0.10, parc: 3,
  deliveryDays: 30, validDays: 15, artSizeCm: '10 × 10 cm', gerado: '', catalogVersion: 2,
  pricingEngine: 'legacy-v2', sourceFile: '', band: { lim: 40, a: 0, b: 0 }, tc: {},
};
// Todas as 172 combinações usadas pelo motor original de preços.
export const REQUIRED_PRICE_CODES = [
  'N',
  ...[1, 2, 3].flatMap((pos) => ['P', 'M', 'G'].flatMap((size) => [
    `D${pos}${size}`,
    ...[0, 1].map((matrix) => `B${pos}${size}${matrix}`),
    ...[1, 2, 3, 4].flatMap((colors) => [0, 1].flatMap((complex) => [0, 1].map((screen) => `S${pos}${size}${colors}${complex}${screen}`))),
  ])),
];


/** Tabela de 04/11/2026: só uma posição-base; até 8 cores de silk. */
export const REQUIRED_PRICE_CODES_V3 = [
  'N', ...['P','M','G'].flatMap((size)=> [
    `D1${size}`, `B1${size}0`, `B1${size}1`,
    ...[1,2,3,4,5,6,7,8].flatMap((colors)=> [0,1].flatMap((complex)=> [0,1].map((screen)=> `S1${size}${colors}${complex}${screen}`))),
  ]),
];
export const priceCodesForConfig = (config) => config?.pricingEngine === 'shared-setup-v3' ? REQUIRED_PRICE_CODES_V3 : REQUIRED_PRICE_CODES;

const text = (value, limit = 300) => String(value ?? '').trim().slice(0, limit);
const asPercent = (value, fallback) => Number.isFinite(Number(value)) ? Number(value) : fallback;
const keyFromName = (name) => text(name, 180).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLocaleLowerCase('pt-BR');

export function cleanConfig(source = {}) {
  const values = Array.isArray(source.qs) ? source.qs.map(Number) : DEFAULT_TIERS;
  const qs = values.length >= 2 && values.length <= 16 && values.every((n, i) => Number.isInteger(n) && n > 0 && (i === 0 || n > values[i - 1])) ? values : [...DEFAULT_TIERS];
  return {
    ...DEFAULT_CONFIG,
    qs,
    avista: asPercent(source.avista, DEFAULT_CONFIG.avista),
    t3: asPercent(source.t3, DEFAULT_CONFIG.t3),
    parc: Number(source.parc) || 3,
    deliveryDays: Number(source.deliveryDays) || 30,
    validDays: Number(source.validDays) || 15,
    artSizeCm: text(source.artSizeCm || '10 × 10 cm', 80),
    gerado: text(source.gerado, 60),
    catalogVersion: Number(source.catalogVersion) === 2 ? 2 : 1,
    pricingEngine: source.pricingEngine === 'shared-setup-v3' ? 'shared-setup-v3' : 'legacy-v2',
    sourceFile: text(source.sourceFile, 140),
    band: {
      lim: Number.isInteger(Number(source.band?.lim)) && Number(source.band?.lim) > 0 ? Number(source.band.lim) : 40,
      a: Number.isFinite(Number(source.band?.a)) && Number(source.band?.a) >= 0 ? Number(source.band.a) : 0,
      b: Number.isFinite(Number(source.band?.b)) && Number(source.band?.b) >= 0 ? Number(source.band.b) : 0,
    },
    tc: Object.fromEntries(Object.entries(source.tc || {}).filter(([key, value]) => /^[SB][1-6][PMG][0-9]{1,3}$/.test(key) && Number.isFinite(Number(value)) && Number(value) >= 0).map(([key, value]) => [key, Number(value)])),
  };
}

export function normalizeProduct(source = {}, id = '') {
  return {
    id: id || source.id || crypto.randomUUID(),
    name: text(source.name || source.garmentName, 180),
    category: text(source.category, 100),
    modelCode: text(source.modelCode, 90),
    fabric: text(source.fabric, 180),
    composition: text(source.composition, 180),
    sizes: text(source.sizes, 180),
    description: text(source.description, 1200),
    notes: text(source.notes, 1400),
    imageUrl: text(source.imageUrl, 1000),
    active: source.active !== false,
    sortOrder: Number(source.sortOrder) || 0,
    belowMinFactor: Number.isFinite(Number(source.belowMinFactor)) && Number(source.belowMinFactor) > 0 ? Number(source.belowMinFactor) : 1,
    setupDivisors: Array.isArray(source.setupDivisors) ? source.setupDivisors.slice(0,16).map((n)=>Number(n)>0?Number(n):1) : [],
    extraFields: Array.isArray(source.extraFields) ? source.extraFields.slice(0, 30).map((pair) => ({ label: text(pair.label, 90), value: text(pair.value, 400) })).filter((pair) => pair.label || pair.value) : [],
    prices: Object.fromEntries(Object.entries(source.prices || {}).map(([code, values]) => [code, Array.isArray(values) ? values.map((n) => Math.round(Number(n) || 0)) : []])),
  };
}

export function legacyProducts(raw) {
  return (raw.produtos || []).map((name, index) => normalizeProduct({
    name,
    prices: raw.p?.[index] || {},
    sortOrder: index,
    active: true,
  }, `legacy-${String(index + 1).padStart(4, '0')}`));
}

function pricingReadError(err, operation) {
  const code = err?.code || 'unknown';
  if (code === 'permission-denied') {
    if (operation === 'pricingProducts') {
      return new Error('A listagem da coleção pricingProducts foi negada pelo Firestore (LIST). O login administrativo já foi validado, mas a regra dessa coleção precisa permitir a leitura da equipe ativa no projeto personalizakoleni. Confirme se a versão publicada contém match /pricingProducts/{productId} com allow read: if isActiveStaff().');
    }
    return new Error('A leitura do documento pricingTables/current foi negada pelo Firestore (GET). Confirme se a regra publicada contém match /pricingTables/{tableId} com allow get: if isActiveStaff(), no projeto personalizakoleni.');
  }
  if (code === 'unavailable') return new Error(`O Firestore não respondeu à consulta ${operation}. Confira a conexão e tente novamente.`);
  return new Error(`Falha ao consultar ${operation} [${code}]: ${err?.message || 'erro desconhecido'}`);
}

export async function loadPricingCatalog() {
  let cfgSnapshot;
  try {
    cfgSnapshot = await getDoc(PRICING_CONFIG_REF);
  } catch (err) {
    throw pricingReadError(err, 'pricingTables/current');
  }
  const raw = cfgSnapshot.exists() ? cfgSnapshot.data() : null;
  if (!raw) return { config: cleanConfig(DEFAULT_CONFIG), products: [], legacy: false, configured: false };
  const config = cleanConfig(raw);
  if (config.catalogVersion === 2) {
    let docs;
    try {
      docs = await getDocs(collection(db, PRICING_PRODUCTS));
    } catch (err) {
      throw pricingReadError(err, 'pricingProducts');
    }
    const products = docs.docs.map((entry) => normalizeProduct(entry.data(), entry.id));
    products.sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'pt-BR'));
    return { config, products, legacy: false, configured: true };
  }
  return { config, products: legacyProducts(raw), legacy: true, configured: true, raw };
}

// Somente campos necessários para cálculo e exposição das descrições à equipe autenticada.
// Os índices dos nomes e matrizes são mantidos sincronizados com o motor de preços original.
export function toCalculatorPricing(config, products) {
  const requiredCodes = priceCodesForConfig(config);
  const published = products.filter((p) => p.active && p.name && requiredCodes.every((code) => p.prices?.[code]?.length === config.qs.length && p.prices[code].every((cents) => Number.isInteger(cents) && cents > 0)));
  return {
    ...cleanConfig(config),
    produtos: published.map((p) => p.name),
    p: published.map((p) => p.prices),
    r: published.map((p) => p.belowMinFactor),
    dv: published.map((p) => p.setupDivisors),
    productMeta: published.map((p) => ({
      category: p.category, modelCode: p.modelCode, fabric: p.fabric,
      composition: p.composition, sizes: p.sizes, description: p.description,
      notes: p.notes, imageUrl: p.imageUrl, extraFields: p.extraFields,
    })),
  };
}

export function validateProduct(product, tiers, expectedCodes = REQUIRED_PRICE_CODES) {
  const p = normalizeProduct(product);
  if (!p.name) throw new Error('Preencha o nome do modelo.');
  if (!Object.keys(p.prices).length) throw new Error('Cadastre a matriz de preços antes de publicar.');
  const codes = expectedCodes.length ? expectedCodes : REQUIRED_PRICE_CODES;
  if (codes.some((code) => !Array.isArray(p.prices[code]) || p.prices[code].length !== tiers.length || p.prices[code].some((price) => !Number.isInteger(price) || price <= 0))) {
    throw new Error('Há preços zerados ou inválidos. Complete as quantidades para todas as técnicas antes de ativar a peça.');
  }
  return p;
}

export async function saveProduct(product, userUid) {
  const entry = normalizeProduct(product);
  if (!entry.name) throw new Error('Informe o nome da peça.');
  await setDoc(doc(db, PRICING_PRODUCTS, entry.id), { ...entry, updatedBy: userUid, updatedAt: serverTimestamp() }, { merge: true });
  return entry;
}

export async function removeProduct(id) { await deleteDoc(doc(db, PRICING_PRODUCTS, id)); }

export function exportLegacyTable(config, products) {
  return {
    version: 1,
    qs: [...config.qs], avista: config.avista, t3: config.t3, parc: config.parc,
    gerado: config.gerado,
    pricingEngine: config.pricingEngine, sourceFile: config.sourceFile,
    band: config.band, tc: config.tc,
    r: products.map((p) => p.belowMinFactor),
    dv: products.map((p) => p.setupDivisors),
    produtos: products.map((p) => p.name),
    p: products.map((p) => p.prices),
  };
}

export function saveJsonDownload(filename, data) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = href; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(href), 1500);
}

export async function migrateLegacyPricing(raw, userUid) {
  const products = legacyProducts(raw);
  const config = cleanConfig(raw);
  const batch = writeBatch(db);
  products.forEach((p) => batch.set(doc(db, PRICING_PRODUCTS, p.id), { ...p, updatedAt: serverTimestamp(), updatedBy: userUid }));
  batch.set(PRICING_CONFIG_REF, { ...config, catalogVersion: 2, updatedAt: serverTimestamp(), updatedBy: userUid });
  await batch.commit();
  return products;
}

export async function saveGlobalPricing(config, products, oldTiers, userUid) {
  const nextConfig = cleanConfig(config);
  if (!(config.qs?.length >= 2) || config.qs.some((n, i) => !Number.isInteger(n) || n <= 0 || (i > 0 && n <= config.qs[i - 1]))) throw new Error('As faixas precisam estar em ordem crescente, sem repetição.');
  if (!(config.avista >= 0 && config.avista <= 0.95 && config.t3 >= 0 && config.t3 <= 0.95)) throw new Error('Os descontos devem ficar entre 0% e 95%.');
  if (!(config.parc >= 1 && config.parc <= 36 && Number.isInteger(config.parc))) throw new Error('Parcelamento inválido (1 a 36).');
  if (!(config.deliveryDays >= 1 && config.deliveryDays <= 730 && config.validDays >= 1 && config.validDays <= 365)) throw new Error('Informe prazos válidos.');
  if (products.length > 400) throw new Error('O catálogo excedeu o limite de atualização em lote. Contate o suporte.');
  const changed = JSON.stringify(oldTiers) !== JSON.stringify(config.qs);
  if (changed && nextConfig.pricingEngine === 'shared-setup-v3') throw new Error('As novas faixas também controlam rateios de tela/matriz. Importe uma tabela HTML completa para alterá-las.');
  const batch = writeBatch(db);
  if (changed) {
    products.forEach((product) => {
      const nextPrices = Object.fromEntries(Object.entries(product.prices).map(([code, cents]) => [code, config.qs.map((tier) => {
        let index = oldTiers.findIndex((n) => n === tier);
        if (index < 0) index = Math.max(0, oldTiers.filter((n) => n <= tier).length - 1);
        return cents[Math.min(index, cents.length - 1)] || 0;
      })]));
      batch.update(doc(db, PRICING_PRODUCTS, product.id), { prices: nextPrices, updatedBy: userUid, updatedAt: serverTimestamp() });
    });
  }
  batch.set(PRICING_CONFIG_REF, { ...nextConfig, catalogVersion: 2, updatedBy: userUid, updatedAt: serverTimestamp() });
  await batch.commit();
  return nextConfig;
}

export async function importLegacyCatalog(parsed, currentProducts, userUid, oldConfig = null) {
  if (!Array.isArray(parsed.produtos) || !Array.isArray(parsed.p) || parsed.produtos.length !== parsed.p.length || !Array.isArray(parsed.qs) || !parsed.qs.length) throw new Error('Arquivo sem estrutura válida de tabela Koleni.');
  if (parsed.produtos.length > 400) throw new Error('Importação acima do limite de 400 modelos por operação.');
  const config = cleanConfig({ ...parsed, catalogVersion: 2 });
  const requiredCodes = priceCodesForConfig(config);
  if (config.pricingEngine === 'shared-setup-v3' && (
    !Array.isArray(parsed.r) || !Array.isArray(parsed.dv) ||
    parsed.r.length !== parsed.produtos.length || parsed.dv.length !== parsed.produtos.length ||
    !Object.keys(config.tc).length
  )) throw new Error('Arquivo novo incompleto: faltam custos de arte e fatores de rateio por peça.');
  if (config.qs.length !== parsed.qs.length) throw new Error('Faixas de quantidade inválidas.');
  const importedNames = new Set(parsed.produtos.map(keyFromName));
  if (oldConfig && currentProducts.some((p) => !importedNames.has(keyFromName(p.name))) && JSON.stringify(oldConfig.qs) !== JSON.stringify(config.qs)) {
    throw new Error('Esta tabela usa faixas de quantidade diferentes e existem peças fora do arquivo. Ajuste as faixas gerais primeiro para evitar preços inconsistentes.');
  }
  const batch = writeBatch(db);
  const previousByName = new Map(currentProducts.map((p) => [keyFromName(p.name), p]));
  const newProducts = parsed.produtos.map((name, index) => {
    const old = previousByName.get(keyFromName(name)) || parsed.products?.find((item) => keyFromName(item.name) === keyFromName(name)) || parsed.productMeta?.[index];
    const p = normalizeProduct({
      ...old, name, prices: parsed.p[index], sortOrder: index, active: old?.active ?? true,
      belowMinFactor: parsed.r?.[index] ?? old?.belowMinFactor ?? 1,
      setupDivisors: parsed.dv?.[index] ?? old?.setupDivisors ?? [],
    }, old?.id || crypto.randomUUID());
    if (!p.name || requiredCodes.some((code)=>!Array.isArray(p.prices[code]) || p.prices[code].length !== config.qs.length || p.prices[code].some((n)=>!Number.isInteger(n)||n<1))) throw new Error(`Preços incompletos para ${name}: são exigidas ${requiredCodes.length} combinações.`);
    if (config.pricingEngine === 'shared-setup-v3' && (p.setupDivisors.length !== config.qs.length || p.setupDivisors.some((n)=>!(n>0)))) throw new Error(`Fatores de rateio incompletos para ${name}.`);
    batch.set(doc(db, PRICING_PRODUCTS, p.id), { ...p, updatedAt: serverTimestamp(), updatedBy: userUid }, { merge: true });
    return p;
  });
  batch.set(PRICING_CONFIG_REF, { ...config, catalogVersion: 2, updatedBy: userUid, updatedAt: serverTimestamp() });
  await batch.commit();
  return newProducts;
}