// components/admin/teams/TeamQuickLinks.tsx
//
// Les endroits où l'on va DEPUIS la fiche d'équipe.
//
// La fiche n'offrait qu'un lien, la page publique. Or les questions qu'on se
// pose ici mènent presque toujours ailleurs : « qu'est-ce que la capitaine voit
// de son côté ? » et « ses salons Discord existent-ils vraiment ? ». Les deux
// écrans existaient déjà ; il fallait connaître leur URL et retrouver l'équipe
// à la main dans une liste.
//
// Un lien qui ne mène nulle part vaut moins que pas de lien : la vue capitaine
// n'apparaît que si l'équipe a une capitaine désignée (`captain_id` NULL est un
// état légitime, cf. équipes créées par un manager).

import Link from 'next/link';
import { useAdminT } from '@/lib/i18n/useAdminT';
import nsAdminTeamEdit from '@/lib/i18n/locales/admin-fr/adminTeamEdit';

type Props = {
  teamId: string;
  slug: string | null;
  captainUserId: string | null;
};

const ICONS = {
  external:
    'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14',
  user: 'M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z',
  chat: 'M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.9 9.9 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z',
} as const;

function Row({
  href,
  label,
  icon,
  external,
  testId,
}: {
  href: string;
  label: string;
  icon: keyof typeof ICONS;
  external?: boolean;
  testId: string;
}) {
  return (
    <Link
      href={href}
      target={external ? '_blank' : undefined}
      data-testid={testId}
      className="group flex items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] border border-[var(--line,rgba(194,196,201,.12))] bg-[var(--s2,#1d1520)] px-4 py-3 transition-colors hover:border-[var(--line2,rgba(194,196,201,.2))]"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-8 w-8 items-center justify-center rounded-[var(--r-ctrl,4px)] bg-[var(--s3,#2f2732)]">
          <svg
            className="w-4 h-4 text-[var(--or-200,#eec4ff)]"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d={ICONS[icon]}
            />
          </svg>
        </div>
        <span className="text-sm text-[var(--t1,#f4edf7)]">{label}</span>
      </div>
      <svg
        className="w-4 h-4 text-[var(--t4,#807984)] transition-colors group-hover:text-[var(--t1,#f4edf7)]"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9 5l7 7-7 7"
        />
      </svg>
    </Link>
  );
}

export default function TeamQuickLinks({ teamId, slug, captainUserId }: Props) {
  const t = useAdminT(nsAdminTeamEdit);

  return (
    <section className="rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-6">
      <h2 className="mb-3 font-[family-name:var(--fd)] text-[12px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]">
        {t.quickLinksTitle}
      </h2>
      <div className="space-y-2">
        <Row
          href={`/team/${encodeURIComponent(slug || teamId)}`}
          label={t.publicPage}
          icon="external"
          external
          testId="quicklink-public"
        />
        {captainUserId && (
          <Row
            href={`/admin/users/${captainUserId}/captain-view`}
            label={t.captainViewLink}
            icon="user"
            testId="quicklink-captain-view"
          />
        )}
        <Row
          href={`/admin/discord/team-channels?team=${encodeURIComponent(teamId)}`}
          label={t.discordChannelsLink}
          icon="chat"
          testId="quicklink-discord"
        />
      </div>
    </section>
  );
}
