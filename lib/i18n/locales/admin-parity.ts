import { frDict } from './admin-fr';
import en from './admin-en.json';

/**
 * Garde-fou de compilation pour les locales ADMIN : le francais (recompose
 * depuis `admin-fr/<ns>.ts`) et `admin-en.json` doivent avoir exactement la
 * meme structure de cles.
 *
 * Comme `parity.ts`, ce module n'est importe par aucun code applicatif : il ne
 * finit jamais dans un bundle.
 */
const _frMatchesEn: typeof frDict = en;
const _enMatchesFr: typeof en = frDict;

void _frMatchesEn;
void _enMatchesFr;
