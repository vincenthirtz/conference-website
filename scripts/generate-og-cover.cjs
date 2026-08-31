// scripts/generate-og-cover.cjs
//
// Génère `public/img/og-cover.png` — la carte de partage réseaux sociaux par
// défaut (og:image / twitter:image, 1200×630) utilisée par components/Seo/DefaultSeo.
//
// La source est le logo officiel `public/img/logos/2026-logo.png` (carré, 500×500) :
// il est posé sur un disque blanc (sans ça les arcs gris foncé du blason se
// noient dans le fond) au-dessus du dégradé violet de la marque.
//
// Ré-exécuter après tout changement de logo :  node scripts/generate-og-cover.cjs

const sharp = require('sharp');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const W = 1200;
const H = 630;
const LOGO = 330; // côté du logo, centré dans le disque
const CY = 252; // centre vertical du disque
const R = 198; // rayon du disque blanc

const background = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0a12"/>
      <stop offset="55%" stop-color="#1b0f2b"/>
      <stop offset="100%" stop-color="#310b41"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.4" r="0.55">
      <stop offset="0%" stop-color="#a62edb" stop-opacity="0.42"/>
      <stop offset="100%" stop-color="#a62edb" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#g)"/>
  <rect width="${W}" height="${H}" fill="url(#glow)"/>
  <rect x="0" y="0" width="${W}" height="8" fill="#a62edb"/>
  <rect x="0" y="${H - 8}" width="${W}" height="8" fill="#4dff8a"/>
  <circle cx="${W / 2}" cy="${CY}" r="${R + 10}" fill="#a62edb" fill-opacity="0.25"/>
  <circle cx="${W / 2}" cy="${CY}" r="${R}" fill="#ffffff"/>
</svg>`;

const wordmark = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <text x="${W / 2}" y="530" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="64" font-weight="700" fill="#ffffff" letter-spacing="1">OW Women&#8217;s Cup</text>
  <text x="${W / 2}" y="580" text-anchor="middle" font-family="Helvetica Neue, Helvetica, Arial, sans-serif"
        font-size="26" font-weight="500" fill="#dcacf1" letter-spacing="6">OWWOMENSCUP.FR</text>
</svg>`;

async function main() {
  const logo = await sharp(path.join(ROOT, 'public/img/logos/2026-logo.png'))
    .resize(LOGO, LOGO, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();

  const out = path.join(ROOT, 'public/img/og-cover.png');
  await sharp(Buffer.from(background))
    .composite([
      { input: logo, top: Math.round(CY - LOGO / 2), left: Math.round((W - LOGO) / 2) },
      { input: Buffer.from(wordmark), top: 0, left: 0 },
    ])
    .png({ compressionLevel: 9 })
    .toFile(out);

  console.log(`og-cover généré : ${out} (${W}×${H})`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
