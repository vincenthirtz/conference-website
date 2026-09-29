// features/player/tcg/ui/PacksPanel.tsx — paquets fermés, solde, barème et
// achat (lot P14). Présentationnel : les gestes arrivent en props.
//
// L'OUVERTURE ET L'ACHAT SONT DES ACTIONS SÉPARÉES, comme côté serveur :
// acheter crée un paquet FERMÉ, ouvrir le consomme. La monnaie se GAGNE (match,
// scrim, drop…) : rien ici ne se relie à un paiement.

import type { Ref } from 'react';
import { Button, Card } from '@/features/ruban';
import { Skeleton } from '@/components/ui/Skeleton';
import { TcgAmount } from '@/components/tcg/TcgCoin';
import { format, useT } from '@/lib/i18n/useT';
import nsPlayerTcg from '@/lib/i18n/locales/fr/playerTcg';
import { packOriginLabel, type Earn, type Pack } from '../model';

export default function PacksPanel({
  headingRef,
  isLoading,
  unopenedCount,
  balance,
  earn,
  boosterPrice,
  packs,
  hasMorePacks,
  busy,
  twitchAnchor,
  onBuy,
  onOpen,
  onMorePacks,
}: {
  headingRef: Ref<HTMLHeadingElement>;
  isLoading: boolean;
  unopenedCount: number;
  balance: number;
  earn: Earn | null;
  boosterPrice: number | null;
  packs: Pack[];
  hasMorePacks: boolean;
  busy: string | null;
  /** Ancre de la carte Twitch, `null` ⇒ pas de lien depuis le barème. */
  twitchAnchor: string | null;
  onBuy: () => void;
  onOpen: (packId: string) => void;
  onMorePacks: () => void;
}) {
  const t = useT(nsPlayerTcg);
  return (
    <Card as="section" padding="sm" className="sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
        <div>
          <h2
            ref={headingRef}
            tabIndex={-1}
            className="scroll-mt-24 rounded text-lg font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--or,#b467d1)]"
          >
            {t.packsTitle}
          </h2>
          {isLoading ? (
            <Skeleton className="mt-2 h-4 w-40" />
          ) : (
            <p className="mt-1 text-sm text-[var(--t3,#a39ba6)]">
              {unopenedCount === 0
                ? t.packsNone
                : format(
                    unopenedCount > 1
                      ? t.packsUnopened_other
                      : t.packsUnopened_one,
                    { count: unopenedCount }
                  )}
            </p>
          )}
        </div>
        {/* Aligné à gauche sur mobile : à 400 px, un bloc calé à droite sous
            un titre calé à gauche se lit en zigzag. */}
        <div className="sm:text-right">
          <p className="flex items-center gap-2 text-sm text-[var(--t2,#c7bfca)] sm:justify-end">
            <span className="text-xs uppercase tracking-wide text-[var(--t3,#a39ba6)]">
              {t.balanceLabel}
            </span>
            {/* Un solde illisible n'est JAMAIS « 0 » : pendant la lecture, un
                squelette ; en échec, l'écran d'erreur remplace ce panneau. */}
            {isLoading ? (
              <Skeleton className="h-5 w-14" />
            ) : (
              <TcgAmount
                value={balance}
                size={18}
                className="text-base font-semibold text-[var(--t1,#f4edf7)]"
              />
            )}
          </p>
          {earn !== null && (
            <p className="mt-1 max-w-md text-xs text-[var(--t3,#a39ba6)] sm:ml-auto">
              {/* Le drop n'est mentionné QUE s'il est branché. */}
              {typeof earn.twitchDrop === 'number'
                ? format(t.earnHintWithDrop, {
                    match: earn.matchWin,
                    scrim: earn.scrimWin,
                    drop: earn.twitchDrop,
                  })
                : format(t.earnHint, {
                    match: earn.matchWin,
                    scrim: earn.scrimWin,
                  })}
              {twitchAnchor !== null && (
                <>
                  {' '}
                  <a
                    href={`#${twitchAnchor}`}
                    className="font-semibold text-[var(--or-300,#dea3f6)] underline underline-offset-2 hover:text-[var(--or-200,#eec4ff)]"
                  >
                    {t.twitchEarnLink}
                  </a>
                </>
              )}
            </p>
          )}
          {/* Prix inconnu = bouton absent : « Acheter (— pièces) » proposerait
              une dépense dont on ignore le montant. */}
          {boosterPrice !== null && (
            <Button
              variant="ghost"
              className="mt-3"
              onClick={onBuy}
              disabled={busy !== null}
              aria-busy={busy === 'buy'}
            >
              {busy === 'buy' ? (
                t.buying
              ) : (
                <span className="inline-flex items-center gap-2">
                  {t.buyBoosterShort}
                  <TcgAmount value={boosterPrice} size={15} />
                </span>
              )}
            </Button>
          )}
        </div>
      </div>

      {packs.length > 0 && (
        <ul className="mt-5 grid grid-cols-1 gap-2 min-[400px]:grid-cols-2 sm:flex sm:flex-wrap">
          {packs.map((pack) => (
            <li key={pack.id}>
              <Button
                variant="secondary"
                onClick={() => onOpen(pack.id)}
                disabled={busy !== null}
                aria-busy={busy === pack.id}
                className="!h-auto min-h-11 w-full flex-col !items-start py-2 text-left sm:w-auto sm:flex-row sm:!items-center"
              >
                {busy === pack.id ? t.packOpening : t.packOpen}
                {/* Un `switch` et non un ternaire : un paquet `welcome` se
                    serait affiché « Gagné en match ». */}
                <span className="text-xs font-normal normal-case tracking-normal text-[var(--t2,#c7bfca)]">
                  {packOriginLabel(pack.source, t)}
                </span>
              </Button>
            </li>
          ))}
        </ul>
      )}
      {hasMorePacks && (
        <Button
          variant="ghost"
          size="sm"
          className="mt-3"
          onClick={onMorePacks}
          disabled={busy !== null}
        >
          {busy === 'more-packs' ? t.collectionLoadingMore : t.packsLoadMore}
        </Button>
      )}
    </Card>
  );
}
