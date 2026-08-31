// scripts/generate-brand-images.cjs
//
// Génère les visuels de marque dérivés du logo officiel
// `public/img/logos/2026-logo.png` (carré, 500×500) :
//
//   1. `public/img/og-cover.png`    — 1200×630, carte de partage réseaux sociaux
//                                     (og:image / twitter:image, cf. components/Seo/DefaultSeo)
//   2. `public/img/brand-cover.png` — 1200×1200, visuel décoratif des panneaux
//                                     « À propos » (logo centré : reste lisible
//                                     recadré en `object-cover`, portrait comme paysage)
//
// Dans les deux cas le logo est posé sur le dégradé violet de la marque avec un
// halo derrière lui — sans ce halo, les arcs gris foncé du blason se noient.
//
// Ré-exécuter après tout changement de logo :  node scripts/generate-brand-images.cjs

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

async function loadLogo(size) {
  return sharp(path.join(ROOT, 'public/img/logos/2026-logo.png'))
    .resize(size, size, {
      fit: 'contain',
      background: { r: 0, g: 0, b: 0, alpha: 0 },
    })
    .toBuffer();
}

// Carte de partage social 1200×630 : logo sur disque blanc + wordmark.
async function generateOgCover() {
  const logo = await loadLogo(LOGO);
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

// Visuel décoratif carré 1200×1200. Carré et logo centré à dessein : les
// emplacements qui l'utilisent le recadrent en `object-cover` en portrait
// (carte mobile « À propos ») comme en paysage (poster vidéo, panneau équipe),
// et le logo doit survivre aux deux recadrages.
async function generateBrandCover() {
  const S = 1200;
  const LOGO_SQ = 520;
  const bg = `<svg xmlns="http://www.w3.org/2000/svg" width="${S}" height="${S}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0a0a12"/>
      <stop offset="50%" stop-color="#1b0f2b"/>
      <stop offset="100%" stop-color="#310b41"/>
    </linearGradient>
    <radialGradient id="glow" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#8f21bf" stop-opacity="0.26"/>
      <stop offset="100%" stop-color="#8f21bf" stop-opacity="0"/>
    </radialGradient>
    <radialGradient id="halo" cx="0.5" cy="0.5" r="0.5">
      <stop offset="0%" stop-color="#ffffff" stop-opacity="0.10"/>
      <stop offset="65%" stop-color="#ffffff" stop-opacity="0.03"/>
      <stop offset="100%" stop-color="#ffffff" stop-opacity="0"/>
    </radialGradient>
  </defs>
  <rect width="${S}" height="${S}" fill="url(#g)"/>
  <rect width="${S}" height="${S}" fill="url(#glow)"/>
  <circle cx="${S / 2}" cy="${S / 2}" r="400" fill="url(#halo)"/>
  <circle cx="${S / 2}" cy="${S / 2}" r="330" fill="none" stroke="#a62edb" stroke-opacity="0.35" stroke-width="2"/>
  <circle cx="${S / 2}" cy="${S / 2}" r="392" fill="none" stroke="#4dff8a" stroke-opacity="0.18" stroke-width="2"/>
</svg>`;

  const logo = await loadLogo(LOGO_SQ);
  const out = path.join(ROOT, 'public/img/brand-cover.png');

  await sharp(Buffer.from(bg))
    .composite([
      {
        input: logo,
        top: Math.round((S - LOGO_SQ) / 2),
        left: Math.round((S - LOGO_SQ) / 2),
      },
    ])
    .png({ compressionLevel: 9 })
    .toFile(out);

  console.log(`brand-cover généré : ${out} (${S}×${S})`);
}

async function main() {
  await generateOgCover();
  await generateBrandCover();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
