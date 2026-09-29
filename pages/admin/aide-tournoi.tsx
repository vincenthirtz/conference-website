// pages/admin/aide-tournoi.tsx
// Doc staff-only consultable du parcours "gérer un tournoi depuis Discord".
// Ciblée par les deep-links du bot : /admin/aide-tournoi#<section-id> ou #cmd-<name>.
// Lecture seule : pas de mutation, pas de fetch côté client (props SSR).

import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { withStaffPage } from '@/utils/staff';
import Breadcrumb from '@/components/admin/Breadcrumb';
import { useAdminT, format } from '@/lib/i18n/useAdminT';
import tournamentHelp from '@/config/tournament-help.json';
import nsAdminAideTournoi from '@/lib/i18n/locales/admin-fr/adminAideTournoi';
import AdminPageHeader from '@/features/admin/_shared/ui/AdminPageHeader';
import AdminButton from '@/features/admin/_shared/ui/AdminButton';
import Chip, { type ChipTone } from '@/features/admin/_shared/ui/Chip';

type Dict = typeof nsAdminAideTournoi.fr;

type CommandRole = 'admin' | 'captain' | 'player' | 'public';

type CommandExample = {
  label: string;
  payload: unknown;
  expected: string;
};

type CommandImpact = {
  db: string[];
  ui: string[];
};

type HelpCommand = {
  name: string;
  signature: string;
  role: CommandRole;
  phase: string;
  prereqs: string[];
  endpoint: string | null;
  impact: CommandImpact;
  examples: CommandExample[];
  deeplink_admin: string;
};

type HelpSection = {
  id: string;
  title: string;
  description: string;
  commands: HelpCommand[];
};

type HelpInventory = {
  version: string;
  sections: HelpSection[];
};

type StaffShape = {
  id: string;
  role: string;
  display_name: string | null;
};

type Props = {
  staff: StaffShape;
  inventory: HelpInventory;
};

export const getServerSideProps = withStaffPage<{ inventory: HelpInventory }>(
  'caster',
  async () => {
    // Import direct : la fixture est embarquée dans le bundle SSR, pas de
    // round-trip HTTP ni besoin de la clé bot ici.
    return { inventory: tournamentHelp as HelpInventory };
  }
);

const roleLabel = (role: CommandRole, t: Dict): string => {
  switch (role) {
    case 'admin':
      return t.roleAdmin;
    case 'captain':
      return t.roleCaptain;
    case 'player':
      return t.rolePlayer;
    case 'public':
      return t.rolePublic;
    default:
      return role;
  }
};

const ROLE_TONE: Record<CommandRole, ChipTone> = {
  admin: 'err',
  captain: 'brand',
  player: 'ok',
  public: 'neutral',
};

// Jetons « Le Ruban » de la page.
const CARD =
  'rounded-[var(--r-card,14px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)]';
const LABEL =
  'font-[family-name:var(--fd)] text-[11px] font-bold uppercase tracking-[0.22em] text-[var(--t3,#a39ba6)] [font-stretch:75%]';
const CODE =
  'block font-mono rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)] break-words';

/**
 * Slug stable d'une commande utilisé pour l'ancre `id="cmd-<slug>"`.
 * Doit correspondre à la queue de `deeplink_admin` côté fixture/bot.
 */
function commandAnchorSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Extrait l'ancre cible depuis `deeplink_admin` (ex: "/admin/aide-tournoi#x" -> "x"). */
function deeplinkAnchor(deeplink: string): string {
  const hashIdx = deeplink.indexOf('#');
  return hashIdx >= 0
    ? deeplink.slice(hashIdx + 1)
    : commandAnchorSlug(deeplink);
}

/** Encode safely un payload JSON (gère null/undefined). */
function formatPayload(payload: unknown, noPayloadLabel: string): string {
  if (payload == null) return noPayloadLabel;
  try {
    return JSON.stringify(payload, null, 2);
  } catch {
    return String(payload);
  }
}

/**
 * Heuristique pour transformer un chemin UI affiché dans le JSON
 * (ex: "/tournoi/<slug>") en lien cliquable raisonnable.
 * - Si la valeur ne commence pas par "/", on n'en fait pas un lien.
 * - On remplace les segments `<...>` par une URL générique cliquable
 *   (qui mènera vers la page d'index si elle existe).
 */
function uiImpactToHref(label: string): string | null {
  if (!label.startsWith('/')) return null;
  // Strip placeholders <slug>, <id>, etc. et tronquer au premier segment dynamique.
  const cleaned = label
    .split('#')[0]
    .split('?')[0]
    .replace(/\/<[^>]+>.*$/, '');
  return cleaned.length > 0 ? cleaned : null;
}

function CommandCard({ command }: { command: HelpCommand }) {
  const t = useAdminT(nsAdminAideTournoi);
  const anchor = deeplinkAnchor(command.deeplink_admin);
  const [copied, setCopied] = useState<number | null>(null);
  const [openExampleIdx, setOpenExampleIdx] = useState<number | null>(null);

  async function copyPayload(text: string, idx: number) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(idx);
      window.setTimeout(() => {
        setCopied((v) => (v === idx ? null : v));
      }, 1500);
    } catch {
      /* clipboard refusé : on ignore */
    }
  }

  return (
    <article id={`cmd-${anchor}`} className={`scroll-mt-24 ${CARD} p-5`}>
      <header className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div className="min-w-0 flex-1">
          <code
            className={`${CODE} px-3 py-2 text-sm text-[var(--t1,#f4edf7)] md:text-base`}
          >
            {command.signature}
          </code>
        </div>
        <Chip tone={ROLE_TONE[command.role]}>{roleLabel(command.role, t)}</Chip>
      </header>

      {command.prereqs.length > 0 && (
        <div className="mt-4">
          <h4 className={`${LABEL} mb-1.5`}>{t.prereqs}</h4>
          <ul className="list-inside list-disc space-y-1 text-sm text-[var(--t2,#c7bfca)]">
            {command.prereqs.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <h4 className={`${LABEL} mb-1.5`}>{t.endpoint}</h4>
        {command.endpoint ? (
          <code
            className={`${CODE} break-all px-2.5 py-1.5 text-xs text-[var(--lf-200,#b3e7a3)] md:text-sm`}
          >
            {command.endpoint}
          </code>
        ) : (
          <p className="text-sm text-[var(--t3,#a39ba6)]">
            <span className="font-mono text-[var(--t4,#807984)]">—</span>{' '}
            <span className="text-[var(--warn,#f5a524)]">Discord-only</span>{' '}
            {t.apiNote}
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className={`${LABEL} mb-1.5`}>{t.impactDb}</h4>
          {command.impact.db.length > 0 ? (
            <ul className="space-y-1 text-sm text-[var(--t2,#c7bfca)]">
              {command.impact.db.map((row, i) => (
                <li key={i} className={`${CODE} px-2 py-1 text-xs`}>
                  {row}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm italic text-[var(--t4,#807984)]">
              {t.noneReadOnly}
            </p>
          )}
        </div>
        <div>
          <h4 className={`${LABEL} mb-1.5`}>{t.uiPages}</h4>
          {command.impact.ui.length > 0 ? (
            <ul className="space-y-1 text-sm text-[var(--t2,#c7bfca)]">
              {command.impact.ui.map((label, i) => {
                const href = uiImpactToHref(label);
                return (
                  <li key={i} className="flex items-baseline gap-1">
                    {href ? (
                      <Link
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-[var(--or-300,#dea3f6)] underline underline-offset-2 hover:text-[var(--or-200,#eec4ff)]"
                      >
                        {label}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-[var(--t3,#a39ba6)]">
                        {label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm italic text-[var(--t4,#807984)]">
              {t.noneFem}
            </p>
          )}
        </div>
      </div>

      {command.examples.length > 0 && (
        <div className="mt-5">
          <h4 className={`${LABEL} mb-2`}>
            {format(t.examplesLabel, { count: command.examples.length })}
          </h4>
          <ul className="space-y-2">
            {command.examples.map((ex, idx) => {
              const isOpen = openExampleIdx === idx;
              const payloadText = formatPayload(ex.payload, t.noPayload);
              return (
                <li
                  key={idx}
                  className="rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s2,#1d1520)]"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenExampleIdx((v) => (v === idx ? null : idx))
                    }
                    className="flex w-full items-center justify-between gap-3 rounded-[var(--r-ctrl,4px)] px-3 py-2 text-left text-sm transition-colors hover:bg-[rgba(180,103,209,.08)]"
                    aria-expanded={isOpen}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <svg
                        className={`h-3.5 w-3.5 shrink-0 text-[var(--t3,#a39ba6)] transition-transform ${isOpen ? 'rotate-90' : ''}`}
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M9 5l7 7-7 7"
                        />
                      </svg>
                      <span className="truncate text-[var(--t1,#f4edf7)]">
                        {ex.label}
                      </span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="space-y-3 border-t border-[var(--line2,rgba(194,196,201,.2))] px-3 pb-3 pt-2">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className={LABEL}>{t.payload}</span>
                          <AdminButton
                            variant="ghost"
                            size="xs"
                            onClick={() => copyPayload(payloadText, idx)}
                          >
                            {copied === idx ? t.copied : t.copy}
                          </AdminButton>
                        </div>
                        <pre className="overflow-x-auto whitespace-pre rounded-[var(--r-ctrl,4px)] border border-[var(--line2,rgba(194,196,201,.2))] bg-[var(--s1,#100812)] p-3 font-mono text-xs text-[var(--t2,#c7bfca)]">
                          {payloadText}
                        </pre>
                      </div>
                      <div>
                        <span className={`${LABEL} mb-1 block`}>
                          {t.expectedResult}
                        </span>
                        <p className="text-sm leading-relaxed text-[var(--t2,#c7bfca)]">
                          {ex.expected}
                        </p>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </article>
  );
}

function TableOfContents({
  sections,
  activeId,
  onJump,
}: {
  sections: HelpSection[];
  activeId: string | null;
  onJump: (id: string) => void;
}) {
  const t = useAdminT(nsAdminAideTournoi);
  return (
    <nav
      aria-label={t.tocAriaLabel}
      className={`${CARD} p-4 lg:sticky lg:top-24`}
    >
      <p className={`${LABEL} mb-3`}>{t.tocTitle}</p>
      <ol className="space-y-1">
        {sections.map((s) => {
          const isActive = activeId === s.id;
          return (
            <li key={s.id}>
              <a
                href={`#${s.id}`}
                onClick={(e) => {
                  e.preventDefault();
                  onJump(s.id);
                }}
                className={`block rounded-[var(--r-ctrl,4px)] border px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'border-[rgba(180,103,209,.45)] bg-[rgba(180,103,209,.12)] text-[var(--or-200,#eec4ff)]'
                    : 'border-transparent text-[var(--t2,#c7bfca)] hover:bg-[var(--s2,#1d1520)] hover:text-[var(--t1,#f4edf7)]'
                }`}
              >
                {s.title}
              </a>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function AdminAideTournoiPage({ inventory }: Props) {
  const t = useAdminT(nsAdminAideTournoi);
  const { version, sections } = inventory;
  const [activeId, setActiveId] = useState<string | null>(
    sections[0]?.id ?? null
  );
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({});

  // Scrollspy via IntersectionObserver.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        // Choisit l'entrée la plus haute encore visible.
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (visible.length > 0) {
          const id = (visible[0].target as HTMLElement).id;
          if (id) setActiveId(id);
        }
      },
      {
        // Le header sticky fait ~6rem ; on déclenche quand la section est au tiers haut.
        rootMargin: '-96px 0px -60% 0px',
        threshold: [0, 0.1, 0.25, 0.5],
      }
    );

    for (const section of sections) {
      const el = sectionRefs.current[section.id];
      if (el) observer.observe(el);
    }
    return () => observer.disconnect();
  }, [sections]);

  // Au mount, si l'URL contient un hash, on positionne `activeId` en conséquence
  // (le scroll est géré nativement par le navigateur grâce à `scroll-margin-top`).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    // Si le hash cible une commande (cmd-xxx), on remonte à sa section parente.
    const cmdMatch = hash.startsWith('cmd-') ? hash.slice(4) : null;
    if (cmdMatch) {
      for (const s of sections) {
        if (
          s.commands.some((c) => deeplinkAnchor(c.deeplink_admin) === cmdMatch)
        ) {
          setActiveId(s.id);
          return;
        }
      }
    } else if (sections.some((s) => s.id === hash)) {
      setActiveId(hash);
    }
  }, [sections]);

  function jumpToSection(id: string) {
    setActiveId(id);
    const el = sectionRefs.current[id];
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Met à jour le hash sans déclencher un nouveau scroll natif.
      if (typeof window !== 'undefined') {
        window.history.replaceState(null, '', `#${id}`);
      }
    }
  }

  const totalCommands = useMemo(
    () => sections.reduce((acc, s) => acc + s.commands.length, 0),
    [sections]
  );

  return (
    <>
      <Head>
        <title>{t.pageTitle}</title>
        <meta name="description" content={t.metaDescription} />
      </Head>

      <div className="min-h-screen px-4 pt-header pb-12 sm:px-6 lg:px-[30px]">
        <Breadcrumb
          items={[
            { label: t.breadcrumbAdmin, href: '/admin' },
            { label: t.breadcrumbCurrent },
          ]}
        />

        <p className={`${LABEL} mb-2`}>{t.docLabel}</p>
        <AdminPageHeader
          title={t.heading}
          subtitle={format(t.sectionsCount, {
            sections: sections.length,
            commands: totalCommands,
          })}
          badge={
            <Chip tone="neutral">{format(t.versionLabel, { version })}</Chip>
          }
        />
        <p className="-mt-3 mb-8 max-w-3xl text-[14px] text-[var(--t2,#c7bfca)]">
          {t.intro}
        </p>

        {/* Layout 2 colonnes sur grand écran : TOC sticky + corps */}
        <div className="grid grid-cols-1 lg:grid-cols-[16rem_1fr] gap-6">
          <aside>
            <TableOfContents
              sections={sections}
              activeId={activeId}
              onJump={jumpToSection}
            />
          </aside>

          <main className="space-y-12 min-w-0">
            {sections.map((section) => (
              <section
                key={section.id}
                id={section.id}
                ref={(el) => {
                  sectionRefs.current[section.id] = el;
                }}
                className="scroll-mt-24"
              >
                <h2 className="font-[family-name:var(--fd)] text-[22px] font-extrabold uppercase leading-tight tracking-[-0.01em] text-[var(--t1,#f4edf7)] [font-stretch:125%]">
                  {section.title}
                </h2>
                <p className="mt-2 max-w-3xl text-sm text-[var(--t3,#a39ba6)]">
                  {section.description}
                </p>

                <div className="mt-5 space-y-4">
                  {section.commands.map((command) => (
                    <CommandCard key={command.name} command={command} />
                  ))}
                </div>
              </section>
            ))}
          </main>
        </div>
      </div>
    </>
  );
}

export default AdminAideTournoiPage;
