import fr from './fr.json';
import en from './en.json';

/**
 * Garde-fou de compilation : `fr.json` et `en.json` doivent avoir exactement
 * la meme structure de cles. Si une cle manque ou diverge d'un cote, l'une de
 * ces deux affectations echoue au typecheck.
 */
const _frMatchesEn: typeof fr = en;
const _enMatchesFr: typeof en = fr;

void _frMatchesEn;
void _enMatchesFr;
