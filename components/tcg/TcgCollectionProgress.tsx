// components/tcg/TcgCollectionProgress.tsx
//
// « Où j'en suis » : la collection possédée rapportée au vivier existant.
//
// POURQUOI CE COMPOSANT. La page affichait « 4 cartes différentes · 7
// exemplaires » — un compteur sans dénominateur. Un TCG vit de la complétion :
// sans horizon, 4 cartes ne veulent rien dire, et rien ne distingue le début
// de la fin. Le dénominateur est donc l'information, pas la décoration.
//
// LE TEXTE PORTE L'INFORMATION, LA BARRE L'ILLUSTRE. Une largeur et une
// couleur ne se lisent ni au lecteur d'écran ni en daltonisme. C'est déjà la
// règle du registre du porte-monnaie, où le signe d'un montant est porté par
// la couleur ET par le texte : on l'applique ici, la barre restant un
// redoublement visuel de ce qui est écrit à côté.
//
// UNE SEULE PALETTE DE RARETÉ. Les teintes viennent de `RARITY_TEXT`
// (TcgCard), lui-même aligné sur les badges de la fiche joueuse. Le remplissage
// des barres n'introduit AUCUNE classe de couleur : il utilise `bg-current`,
// donc littéralement la couleur de texte de la ligne. Une seconde liste de
// classes, même « assortie », finirait par diverger de la première — le travers
// que `utils/tcg/rarity.ts` évite déjà côté calcul.
//
// TOUT CHAMP PEUT MANQUER. L'API qui alimentera ce composant n'existe pas
// encore, et le vivier par rareté est plus coûteux à calculer que le total :
// une donnée absente masque sa ligne. Afficher « 0 / 0 » ou « NaN % » ferait
// passer une lacune de mesure pour un fait sur la collection de la lectrice —
// ici, une collection vide.

import type { JSX } from 'react';
import { RARITY_ORDER, type TcgRarity } from '@/utils/tcg/rarity';
import { RARITY_TEXT } from '@/components/tcg/TcgCard';

/** Décompte par rareté. Chaque palier est facultatif — voir `readCount`. */
export type TcgRarityCounts = Partial<Record<TcgRarity, number>>;

export type TcgCollectionProgressProps = {
  /** Ce que la joueuse possède. */
  owned?: {
    /** Nombre de sujets distincts possédés. */
    distinct?: number | null;
    /** Nombre d'exemplaires, doublons compris. */
    total?: number | null;
    /**
     * Distincts possédés par rareté.
     *
     * La PRÉSENCE de cet objet fait autorité : un palier absent de la table
     * vaut alors zéro possédé (fait réel). C'est l'objet lui-même manquant qui
     * signifie « inconnu » et masque la répartition.
     */
    byRarity?: TcgRarityCounts | null;
  } | null;
  /** Le vivier : ce qui existe et peut donc être obtenu. */
  pool?: {
    /** Nombre de sujets existants, toutes raretés confondues. */
    distinct?: number | null;
    /** Sujets existants par rareté, si le calcul est disponible. */
    byRarity?: TcgRarityCounts | null;
  } | null;
  /** Libellés traduits, fournis par la page hôte (aucune chaîne en dur ici). */
  labels: {
    /** Titre du bloc. */
    title: string;
    /** `{owned}` sur `{pool}` sujets distincts. */
    count: string;
    /** Pourcentage de complétion, `{percent}`. */
    percent: string;
    /** Exemplaires possédés, doublons compris, `{count}`. */
    copies: string;
    /** Nom accessible de la barre globale. */
    progressAria: string;
    /** Intitulé de la répartition par rareté. */
    byRarityTitle: string;
    /** Une ligne de rareté : `{owned}` / `{pool}`. */
    rarityCount: string;
    /** Collection complète — l'objectif atteint mérite d'être nommé. */
    complete: string;
    /** Noms des raretés, déjà construits par la page pour `TcgCard`. */
    rarity: Record<TcgRarity, string>;
  };
  className?: string;
};

/**
 * Un décompte exploitable, ou `null`.
 *
 * `null`, `undefined`, `NaN`, l'infini et les négatifs sont refusés : ce sont
 * des absences ou des corruptions, jamais « zéro ». Les traiter comme zéro est
 * précisément ce qui produit un « 0 / 0 » affiché avec aplomb.
 */
function readCount(value: unknown): number | null {
  if (typeof value !== 'number') return null;
  if (!Number.isFinite(value) || value < 0) return null;
  return Math.floor(value);
}

/** Substitution de gabarit, alignée sur `format` de `lib/i18n/useT`. */
function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(vars, key) ? String(vars[key]) : whole
  );
}

/**
 * Pourcentage de complétion, borné à [0, 100].
 *
 * DEUX GARDE-FOUS, pour deux mensonges différents :
 *   - `owned > pool` est possible en pratique (une joueuse a retiré son
 *     consentement, ou une équipe a été dissoute : le vivier rétrécit alors
 *     que les cartes distribuées restent). On borne à 100 plutôt que d'afficher
 *     « 117 % », mais le texte, lui, montre les nombres réels.
 *   - un arrondi ne doit jamais annoncer 100 % tant qu'il manque une carte :
 *     4799/4800 arrondit à 100 % et ferait croire la collection finie. On
 *     plafonne à 99 % tant que `owned < pool`.
 */
export function completionPercent(owned: number, pool: number): number {
  if (pool <= 0) return 0;
  if (owned >= pool) return 100;
  const raw = Math.round((owned / pool) * 100);
  return Math.min(99, Math.max(0, raw));
}

/**
 * Les lignes de rareté affichables.
 *
 * Exportée pour être testable sans rendu : c'est la seule vraie logique du
 * composant, et c'est là que se joue la règle « un champ manquant masque sa
 * ligne ».
 */
export function rarityRows(
  ownedByRarity: TcgRarityCounts | null | undefined,
  poolByRarity: TcgRarityCounts | null | undefined
): Array<{ rarity: TcgRarity; owned: number; pool: number }> {
  // Sans vivier par rareté, il n'y a pas de « sur combien » à donner : la
  // répartition entière disparaît plutôt que de s'afficher sans dénominateur.
  if (!poolByRarity) return [];

  const rows: Array<{ rarity: TcgRarity; owned: number; pool: number }> = [];
  for (const rarity of RARITY_ORDER) {
    const pool = readCount(poolByRarity[rarity]);
    // Un palier absent du vivier, ou vide, n'est pas un objectif : pas de
    // ligne « 0 / 0 ».
    if (pool === null || pool === 0) continue;
    // Le vivier connaît ce palier. Si la table des possédés existe, un palier
    // qui n'y figure pas vaut bien zéro : « 0 / 12 » est un fait utile, pas un
    // trou de mesure. Si elle n'existe pas, on ne sait rien : on n'invente pas.
    const owned = ownedByRarity
      ? (readCount(ownedByRarity[rarity]) ?? 0)
      : null;
    if (owned === null) continue;
    rows.push({ rarity, owned, pool });
  }
  return rows;
}

export default function TcgCollectionProgress({
  owned,
  pool,
  labels,
  className,
}: TcgCollectionProgressProps): JSX.Element | null {
  const ownedDistinct = readCount(owned?.distinct);
  const ownedTotal = readCount(owned?.total);
  const poolDistinct = readCount(pool?.distinct);

  // La barre globale exige les DEUX bornes, et un vivier non nul : c'est tout
  // l'objet du composant. Sans elles, on n'affiche pas une barre à zéro.
  const hasBar =
    ownedDistinct !== null && poolDistinct !== null && poolDistinct > 0;
  const percent = hasBar ? completionPercent(ownedDistinct, poolDistinct) : 0;
  const isComplete = hasBar && ownedDistinct >= poolDistinct;

  const rows = rarityRows(owned?.byRarity, pool?.byRarity);

  // Rien de mesurable : pas de cadre vide. Un bloc « Ta progression » sans
  // aucun chiffre poserait la question qu'il prétend résoudre.
  if (!hasBar && ownedTotal === null && rows.length === 0) return null;

  const countText = hasBar
    ? fill(labels.count, { owned: ownedDistinct, pool: poolDistinct })
    : null;
  const percentText = hasBar ? fill(labels.percent, { percent }) : null;

  return (
    <section
      className={`rounded-2xl border border-white/10 bg-white/[0.03] p-6 ${className ?? ''}`}
    >
      <h2 className="text-lg font-semibold text-white">{labels.title}</h2>

      {hasBar && (
        <div className="mt-4">
          {/* Les chiffres AVANT la barre : ils sont l'information, la barre
              n'en est que l'image. */}
          <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
            <p className="text-sm font-semibold text-white">{countText}</p>
            <p className="text-sm text-gray-400">{percentText}</p>
          </div>

          <div
            role="progressbar"
            aria-valuenow={ownedDistinct}
            aria-valuemin={0}
            aria-valuemax={poolDistinct}
            // `aria-valuetext` redit en toutes lettres ce que `valuenow` donne
            // en chiffre nu : « 12 sur 48 » s'entend mieux que « 12 ».
            aria-valuetext={`${countText} — ${percentText}`}
            aria-label={labels.progressAria}
            className="mt-2 h-3 w-full overflow-hidden rounded-full border border-white/10 bg-white/5"
          >
            <div
              // `motion-reduce:transition-none` : la barre s'anime quand la
              // largeur change (après l'ouverture d'un paquet), sauf pour qui
              // a demandé moins de mouvement.
              className="h-full rounded-full bg-gradient-to-r from-[var(--color-violet)] to-[var(--color-green)] transition-[width] duration-700 ease-out motion-reduce:transition-none"
              style={{ width: `${percent}%` }}
            />
          </div>

          {isComplete && (
            <p className="mt-2 text-sm font-semibold text-[var(--color-green)]">
              {labels.complete}
            </p>
          )}
        </div>
      )}

      {/* Les exemplaires n'ont PAS de barre : il n'existe aucun plafond au
          nombre de doublons, donc aucun dénominateur honnête. Simple chiffre. */}
      {ownedTotal !== null && (
        <p className="mt-3 text-xs text-gray-500">
          {fill(labels.copies, { count: ownedTotal })}
        </p>
      )}

      {rows.length > 0 && (
        <div className="mt-6">
          <h3 className="text-xs font-semibold uppercase tracking-[0.1em] text-gray-400">
            {labels.byRarityTitle}
          </h3>
          <ul className="mt-3 space-y-2">
            {rows.map((row) => {
              const rowPercent = completionPercent(row.owned, row.pool);
              return (
                // La teinte de la rareté est posée UNE fois, sur la ligne ; le
                // remplissage de la barre la reprend via `bg-current`. D'où
                // l'impossibilité qu'une barre contredise son libellé.
                <li key={row.rarity} className={RARITY_TEXT[row.rarity]}>
                  <div className="flex items-baseline justify-between gap-3 text-xs">
                    <span className="font-semibold uppercase tracking-[0.08em]">
                      {labels.rarity[row.rarity]}
                    </span>
                    {/* Le compte est écrit : la barre ci-dessous est donc
                        purement décorative et masquée aux lecteurs d'écran,
                        pour ne pas annoncer deux fois la même chose. */}
                    <span className="tabular-nums text-gray-300">
                      {fill(labels.rarityCount, {
                        owned: row.owned,
                        pool: row.pool,
                      })}
                    </span>
                  </div>
                  <div
                    aria-hidden
                    className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/5"
                  >
                    <div
                      className="h-full rounded-full bg-current transition-[width] duration-700 ease-out motion-reduce:transition-none"
                      style={{ width: `${rowPercent}%` }}
                    />
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
