// components/admin/tcg/TcgCataloguePanel.tsx
//
// Onglet « Vue TCG » : tout ce que l'espace peut donner, et — quand on nomme
// une joueuse — ce qu'elle possède.
//
// POURQUOI LES DEUX ENSEMBLE. « Combien de cartes existent ? » et « lesquelles
// lui manquent ? » sont la même question posée depuis deux places. Les séparer
// en deux écrans obligerait à compter de tête pour répondre à la seconde, qui
// est celle qu'on pose quand une joueuse écrit pour dire qu'elle est bloquée.
//
// LE VIVIER, PAS L'HISTORIQUE. Les cartes listées sont celles qu'un paquet peut
// donner aujourd'hui. Une carte retirée du vivier ne figure plus ici, même si
// elle dort encore dans des collections : ce panneau décrit ce que l'espace
// PROPOSE.
//
// Le sélecteur de joueuse est celui de la correction de solde — même droit
// (`manage_tcg`), même recherche cantonnée à l'espace. En écrire un second
// aurait fait diverger deux fois la même précaution.

import { useMemo, useState } from 'react';
import Image from 'next/image';
import { useTcgCatalogue } from '@/features/admin/tcg/hooks/useTcgAdmin';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import AlertBanner from '@/components/admin/AlertBanner';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import {
  rubanCard,
  rubanEyebrowSnug,
  rubanMuted,
} from '@/features/admin/_shared/ui/ruban';
import TcgPlayerPicker, {
  type PickedUser,
} from '@/components/admin/tcg/TcgPlayerPicker';
import { isOptimizableImageUrl } from '@/utils/images/optimizableImage';
import TcgCardFallback from '@/components/tcg/TcgCardFallback';
import type { TcgCardKind } from '@/utils/tcg/subjectKey';
import nsAdminTcgPage from '@/lib/i18n/locales/admin-fr/adminTcgPage';
import nsAdminTcgGrant from '@/lib/i18n/locales/admin-fr/adminTcgGrant';

// Importé, jamais recopié : ce type a vécu ici en double de celui du serveur,
// et c'est cette copie qui ignorait les mascottes. `subjectKey.ts` est pur
// (aucune lecture, aucun import serveur), donc sans effet sur le bundle client.
type CatalogueKind = TcgCardKind;

type CatalogueCard = {
  key: string;
  kind: CatalogueKind;
  id: string;
  label: string;
  imageUrl: string | null;
  owned: boolean;
  holders: number;
};

type CatalogueResponse = {
  cards: CatalogueCard[];
  total: number;
  ownedCount: number;
  userId: string | null;
};

// L'ORDRE EST CELUI DE L'AFFICHAGE, et il décide aussi de ce qui EXISTE :
// un type absent d'ici n'a pas de groupe, donc ses cartes ne sont rendues
// nulle part — sans erreur, sans compteur faux, simplement absentes.
//
// `association` n'est pas un type de carte mais un GROUPE d'affichage : ses
// cartes sont des `fanart` de catégorie `association` (cf. `groupOf`).
type CatalogueGroup = CatalogueKind | 'association';
const KIND_ORDER: CatalogueGroup[] = [
  'player',
  'team',
  'map',
  'fanart',
  'association',
  'mascot',
];

function groupOf(card: { kind: CatalogueKind; category?: string }) {
  return card.kind === 'fanart' && card.category === 'association'
    ? 'association'
    : card.kind;
}

export default function TcgCataloguePanel() {
  const t = useAdminT(nsAdminTcgPage);
  const tGrant = useAdminT(nsAdminTcgGrant);

  const [user, setUser] = useState<PickedUser | null>(null);
  const catalogue = useTcgCatalogue<CatalogueResponse>(user?.id ?? null);
  const data: CatalogueResponse | null = catalogue.data ?? null;
  const error = catalogue.error
    ? catalogue.error.message || t.catalogueError
    : null;
  const busy = catalogue.isFetching;
  // `true` masque les cartes déjà possédées : la question « que lui manque-t-il »
  // se pose plus souvent que « qu'a-t-elle déjà ».
  const [missingOnly, setMissingOnly] = useState(false);

  const groups = useMemo(() => {
    const cards = data?.cards ?? [];
    const shown = missingOnly ? cards.filter((c) => !c.owned) : cards;
    return KIND_ORDER.map((kind) => ({
      kind,
      cards: shown.filter((c) => groupOf(c) === kind),
    })).filter((g) => g.cards.length > 0);
  }, [data, missingOnly]);

  const kindLabel = (kind: CatalogueGroup): string =>
    kind === 'association'
      ? t.catalogueKindAssociation
      : kind === 'player'
        ? t.catalogueKindPlayers
        : kind === 'team'
          ? t.catalogueKindTeams
          : kind === 'map'
            ? t.catalogueKindMaps
            : kind === 'mascot'
              ? t.catalogueKindMascots
              : t.catalogueKindFanart;

  return (
    <div>
      <AlertBanner message={error} variant="error" className="mb-4" />
      <p className={`mb-4 text-sm ${rubanMuted}`}>{t.catalogueIntro}</p>

      <div className={`mb-5 p-4 ${rubanCard}`}>
        <TcgPlayerPicker
          labels={tGrant}
          value={user}
          onChange={setUser}
          inputId="tcg-catalogue-player"
        />
        {user && (
          <AdminButton
            variant="ghost"
            size="xs"
            onClick={() => setUser(null)}
            className="mt-3"
          >
            {t.catalogueClearPlayer}
          </AdminButton>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-neutral-300" aria-live="polite">
          {busy
            ? t.catalogueLoading
            : data
              ? user
                ? format(t.catalogueCountForPlayer, {
                    owned: data.ownedCount,
                    total: data.total,
                  })
                : format(t.catalogueCount, { total: data.total })
              : ''}
        </p>
        {user && (
          <label className="flex items-center gap-2 text-sm text-neutral-300">
            <input
              type="checkbox"
              checked={missingOnly}
              onChange={(e) => setMissingOnly(e.target.checked)}
              className="accent-[var(--or,#b467d1)]"
            />
            {t.catalogueMissingOnly}
          </label>
        )}
      </div>

      {groups.map((group) => (
        // `content-visibility: auto` : un groupe hors de l'écran n'est ni mis
        // en page ni peint. Les 30 maps sont des SVG voxel de 120 à 175 Ko,
        // coûteux à dessiner, et ils étaient tous rendus d'emblée sous 56
        // joueuses. La taille intrinsèque évite une barre de défilement qui
        // saute pendant qu'on descend.
        <section
          key={group.kind}
          className="mb-7 [content-visibility:auto] [contain-intrinsic-size:auto_900px]"
        >
          <h3 className={`mb-2 ${rubanEyebrowSnug}`}>
            {kindLabel(group.kind)} · {group.cards.length}
          </h3>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {group.cards.map((card) => (
              <li
                key={card.key}
                data-testid="tcg-catalogue-card"
                className={`rounded-[var(--r-ctrl,4px)] border p-2 ${
                  user && card.owned
                    ? 'border-[rgba(127,202,101,.45)] bg-[rgba(127,202,101,.05)]'
                    : 'border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)]'
                }`}
              >
                <span className="relative block aspect-[3/4] overflow-hidden rounded-[3px] bg-[var(--s1,#100812)]">
                  {card.imageUrl ? (
                    <Image
                      src={card.imageUrl}
                      alt=""
                      fill
                      sizes="(min-width: 1024px) 18vw, 45vw"
                      loading="lazy"
                      decoding="async"
                      className="object-cover"
                      // Hôte hors optimiseur (logo d'équipe distant…) : servie
                      // telle quelle plutôt que laissée vide.
                      unoptimized={!isOptimizableImageUrl(card.imageUrl)}
                    />
                  ) : (
                    // Même repli que la carte des joueuses (TcgCard).
                    <TcgCardFallback name={card.label} size="sm" />
                  )}
                </span>
                <span className="mt-1.5 block truncate text-xs text-neutral-200">
                  {card.label}
                </span>
                {user && (
                  <span
                    className={`mt-0.5 block text-[11px] ${
                      card.owned ? 'text-emerald-300' : 'text-neutral-500'
                    }`}
                  >
                    {card.owned ? t.catalogueOwned : t.catalogueMissing}
                  </span>
                )}
                {/* La rareté RÉELLE : une commune que personne n'a tirée est
                    plus rare, dans les faits, qu'une légendaire répandue. */}
                <span
                  className={`mt-0.5 block text-[11px] ${
                    card.holders === 0 ? 'text-amber-300' : 'text-neutral-500'
                  }`}
                >
                  {card.holders === 0
                    ? t.catalogueNoHolder
                    : format(t.catalogueHolders, { count: card.holders })}
                </span>
              </li>
            ))}
          </ul>
        </section>
      ))}

      {!busy && data && groups.length === 0 && (
        <p className={`py-10 text-center text-sm ${rubanMuted}`}>
          {missingOnly ? t.catalogueNothingMissing : t.catalogueEmpty}
        </p>
      )}
    </div>
  );
}
