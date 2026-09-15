// scripts/openapi/bot-inventory.mjs
//
// Régénère le tableau récapitulatif des routes bot dans
// docs/BOT_API_CONTRACT.md (entre les balises BEGIN/END GENERATED), depuis les
// options `withBotRoute` des handlers (cf. utils/openapi/botInventory.ts).
//
//   npm run contract:bot-inventory

import fs from 'node:fs';
import path from 'node:path';

const { extractBotRoutes, renderBotInventory, replaceInventoryBlock } =
  await import('../../utils/openapi/botInventory.ts');

const file = path.join(process.cwd(), 'docs', 'BOT_API_CONTRACT.md');
const routes = extractBotRoutes();
const next = replaceInventoryBlock(
  fs.readFileSync(file, 'utf8'),
  renderBotInventory(routes)
);
fs.writeFileSync(file, next);
console.log(
  `bot inventory: ${routes.length} routes → docs/BOT_API_CONTRACT.md`
);
