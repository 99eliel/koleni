/** Parser de preços do HTML Koleni. NÃO executa scripts do arquivo recebido. */
function parseLiteral(fragment) {
  const quoted = fragment.replace(/([,{]\s*)([A-Za-z_$][\w$]*)\s*:/g, '$1"$2":');
  const numeric = quoted.replace(/\b(\d+(?:\.\d+)?)\s*\/\s*(1e4|100)\b/gi, (_, value, divisor) => String(Number(value) / Number(divisor)));
  return JSON.parse(numeric);
}

export function parseKoleniHtmlPricing(html, filename='') {
  if (typeof html !== 'string' || html.length > 10_000_000) throw new Error('O arquivo HTML excede 10 MB.');
  const declaration = html.match(/\bvar\s+D\s*=\s*(\{[^;]+\})\s*;/);
  if (!declaration) throw new Error('Não encontrei a tabela D no HTML recebido.');
  const constants = parseLiteral(declaration[1]);
  const produtos=[], p=[], r=[], dv=[];
  const row = /D\.produtos\.push\(("(?:\\.|[^"\\])*")\);D\.p\.push\((\{[^\n]+?\})\);D\.r\.push\((\d+(?:\.\d+)?\/1e4)\);D\.dv\.push\((\[[^\]]+\])\);/g;
  for (const match of html.matchAll(row)) {
    produtos.push(String(JSON.parse(match[1])).trim()); p.push(parseLiteral(match[2]));
    r.push(parseLiteral(match[3])); dv.push(parseLiteral(match[4]));
  }
  if (!produtos.length || produtos.length !== p.length || produtos.length !== r.length || produtos.length !== dv.length ||
      !Array.isArray(constants.qs) || !Object.keys(constants.tc || {}).length)
    throw new Error('Formato do HTML incompatível com a tabela de novembro. Nenhum preço foi importado.');
  return {
    version:3, pricingEngine:'shared-setup-v3', sourceFile:String(filename).slice(0,140),
    qs:constants.qs, avista:constants.avista, t3:constants.t3, parc:constants.parc,
    gerado:constants.gerado, band:constants.band, tc:constants.tc,
    produtos,p,r,dv,deliveryDays:30,validDays:15,artSizeCm:'10 × 10 cm',
  };
}
