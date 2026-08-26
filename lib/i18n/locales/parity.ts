import { frDict } from './fr';
import en from './en';

/**
 * Garde-fou de compilation : le francais (recompose depuis `fr/<ns>.ts`) et
 * l'anglais (recompose depuis `en/<ns>.ts`) doivent avoir exactement la meme
 * structure de cles. Si une cle
 * manque ou diverge d'un cote, l'une de ces deux affectations echoue au
 * typecheck.
 *
 * Ce module n'est importe par AUCUN code applicatif : il ne finit donc jamais
 * dans un bundle, malgre son import du dictionnaire francais complet.
 */
const _frMatchesEn: typeof frDict = en;
const _enMatchesFr: typeof en = frDict;

void _frMatchesEn;
void _enMatchesFr;
