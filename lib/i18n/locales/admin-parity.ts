import fr from './admin-fr.json';
import en from './admin-en.json';

/**
 * Garde-fou de compilation pour les locales ADMIN : `admin-fr.json` et
 * `admin-en.json` doivent avoir exactement la même structure de clés. Si une
 * clé manque ou diverge d'un côté, l'une de ces deux affectations échoue au
 * typecheck. (Pendant la phase FR-first, les VALEURS sont identiques des deux
 * côtés — seule la structure est contrainte ici, comme pour les locales
 * publiques : cf. `parity.ts`.)
 */
const _frMatchesEn: typeof fr = en;
const _enMatchesFr: typeof en = fr;

void _frMatchesEn;
void _enMatchesFr;
