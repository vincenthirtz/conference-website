// pages/admin/aide-tournoi.tsx
// Doc staff-only consultable du parcours "gérer un tournoi depuis Discord".
// Ciblée par les deep-links du bot : /admin/aide-tournoi#<section-id> ou #cmd-<name>.
// Lecture seule : pas de mutation, pas de fetch côté client (props SSR).

import Head from 'next/head';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { withStaffPage } from '@/utils/staff';
import Breadcrumb from '@/components/admin/Breadcrumb';
import tournamentHelp from '@/config/tournament-help.json';

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

const ROLE_LABEL: Record<CommandRole, string> = {
  admin: 'Admin',
  captain: 'Capitaine',
  player: 'Joueuse',
  public: 'Public',
};

const ROLE_BADGE_CLASS: Record<CommandRole, string> = {
  admin: 'bg-red-500/15 text-red-300 border-red-500/40',
  captain: 'bg-blue-500/15 text-blue-300 border-blue-500/40',
  player: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40',
  public: 'bg-neutral-500/15 text-neutral-300 border-neutral-500/40',
};

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
  return hashIdx >= 0 ? deeplink.slice(hashIdx + 1) : commandAnchorSlug(deeplink);
}

/** Encode safely un payload JSON (gère null/undefined). */
function formatPayload(payload: unknown): string {
  if (payload == null) return '(aucun payload)';
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
    <article
      id={`cmd-${anchor}`}
      className="scroll-mt-24 rounded-2xl border border-neutral-700/60 bg-neutral-800/40 p-5 shadow-sm"
    >
      <header className="flex items-start justify-between gap-4 flex-wrap mb-3">
        <div className="min-w-0 flex-1">
          <code className="block font-mono text-sm md:text-base text-white bg-neutral-900/70 border border-neutral-700/60 rounded-lg px-3 py-2 break-words">
            {command.signature}
          </code>
        </div>
        <span
          className={`shrink-0 inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold border ${ROLE_BADGE_CLASS[command.role]}`}
        >
          {ROLE_LABEL[command.role]}
        </span>
      </header>

      {command.prereqs.length > 0 && (
        <div className="mt-4">
          <h4 className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
            Prérequis
          </h4>
          <ul className="list-disc list-inside text-sm text-neutral-300 space-y-1">
            {command.prereqs.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <h4 className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
          Endpoint
        </h4>
        {command.endpoint ? (
          <code className="block font-mono text-xs md:text-sm text-emerald-300 bg-neutral-900/70 border border-neutral-700/60 rounded-md px-2.5 py-1.5 break-all">
            {command.endpoint}
          </code>
        ) : (
          <p className="text-sm text-neutral-400">
            <span className="font-mono text-neutral-500">—</span>{' '}
            <span className="text-amber-300/80">Discord-only</span> (aucun
            appel API site)
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <h4 className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
            Impact DB
          </h4>
          {command.impact.db.length > 0 ? (
            <ul className="text-sm text-neutral-300 space-y-1">
              {command.impact.db.map((row, i) => (
                <li key={i} className="font-mono text-xs bg-neutral-900/50 border border-neutral-700/40 rounded px-2 py-1">
                  {row}
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500 italic">Aucun (lecture seule)</p>
          )}
        </div>
        <div>
          <h4 className="text-xs uppercase tracking-wider text-neutral-500 mb-1.5">
            Pages UI affectées
          </h4>
          {command.impact.ui.length > 0 ? (
            <ul className="text-sm text-neutral-300 space-y-1">
              {command.impact.ui.map((label, i) => {
                const href = uiImpactToHref(label);
                return (
                  <li key={i} className="flex items-baseline gap-1">
                    {href ? (
                      <Link
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-mono text-xs text-sky-300 hover:text-sky-200 underline underline-offset-2"
                      >
                        {label}
                      </Link>
                    ) : (
                      <span className="font-mono text-xs text-neutral-400">
                        {label}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-neutral-500 italic">Aucune</p>
          )}
        </div>
      </div>

      {command.examples.length > 0 && (
        <div className="mt-5">
          <h4 className="text-xs uppercase tracking-wider text-neutral-500 mb-2">
            Exemples ({command.examples.length})
          </h4>
          <ul className="space-y-2">
            {command.examples.map((ex, idx) => {
              const isOpen = openExampleIdx === idx;
              const payloadText = formatPayload(ex.payload);
              return (
                <li
                  key={idx}
                  className="rounded-xl border border-neutral-700/50 bg-neutral-900/40"
                >
                  <button
                    type="button"
                    onClick={() =>
                      setOpenExampleIdx((v) => (v === idx ? null : idx))
                    }
                    className="w-full flex items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-neutral-800/40 rounded-xl"
                    aria-expanded={isOpen}
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <svg
                        className={`w-3.5 h-3.5 shrink-0 text-neutral-400 transition-transform ${isOpen ? 'rotate-90' : ''}`}
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
                      <span className="truncate text-neutral-200">{ex.label}</span>
                    </span>
                  </button>

                  {isOpen && (
                    <div className="px-3 pb-3 pt-1 border-t border-neutral-700/40 space-y-3">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs uppercase tracking-wider text-neutral-500">
                            Payload
                          </span>
                          <button
                            type="button"
                            onClick={() => copyPayload(payloadText, idx)}
                            className="text-xs px-2 py-0.5 rounded-md border border-neutral-700 bg-neutral-800 hover:bg-neutral-700 text-neutral-200"
                          >
                            {copied === idx ? 'Copié !' : 'Copier'}
                          </button>
                        </div>
                        <pre className="font-mono text-xs text-neutral-200 bg-neutral-950 border border-neutral-800 rounded-md p-3 overflow-x-auto whitespace-pre">
                          {payloadText}
                        </pre>
                      </div>
                      <div>
                        <span className="block text-xs uppercase tracking-wider text-neutral-500 mb-1">
                          Résultat attendu
                        </span>
                        <p className="text-sm text-neutral-300 leading-relaxed">
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
  return (
    <nav
      aria-label="Sommaire"
      className="lg:sticky lg:top-24 rounded-2xl border border-neutral-700/60 bg-neutral-900/50 backdrop-blur p-4"
    >
      <p className="text-xs uppercase tracking-wider text-neutral-500 mb-3">
        Sommaire
      </p>
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
                className={`block rounded-lg px-3 py-2 text-sm transition-colors ${
                  isActive
                    ? 'bg-emerald-500/15 text-emerald-200 border border-emerald-500/30'
                    : 'text-neutral-300 hover:bg-neutral-800/70 border border-transparent'
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
        if (s.commands.some((c) => deeplinkAnchor(c.deeplink_admin) === cmdMatch)) {
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
        <title>Aide tournoi (Discord) – Admin</title>
        <meta
          name="description"
          content="Parcours complet pour gérer un tournoi depuis le bot Discord, sans toucher à l'UI admin."
        />
      </Head>

      <div className="min-h-screen bg-gradient-to-br from-neutral-950 via-neutral-900 to-neutral-950 text-white">
        <div className="w-full px-4 sm:px-6 lg:px-8 pt-20 pb-12 max-w-7xl mx-auto">
          <Breadcrumb
            items={[
              { label: 'Admin', href: '/admin' },
              { label: 'Aide tournoi (Discord)' },
            ]}
          />

          {/* Header */}
          <header className="mb-8">
            <p className="text-sm text-neutral-400">Documentation staff</p>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight mt-1">
              Aide tournoi (Discord)
            </h1>
            <p className="text-sm text-neutral-400 mt-2 max-w-3xl">
              Parcours complet pour gérer un tournoi depuis le bot, sans
              toucher à l&apos;UI. Chaque commande indique son rôle, son endpoint,
              ses impacts DB/UI et un exemple de payload.
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2 text-xs">
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-300 font-mono">
                version {version}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-neutral-800 border border-neutral-700 text-neutral-400">
                {sections.length} sections · {totalCommands} commandes
              </span>
            </div>
          </header>

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
                  <h2 className="text-2xl font-bold tracking-tight">
                    {section.title}
                  </h2>
                  <p className="text-sm text-neutral-400 mt-2 max-w-3xl">
                    {section.description}
                  </p>

                  <div className="mt-5 space-y-4">
                    {section.commands.map((command) => (
                      <CommandCard
                        key={command.name}
                        command={command}
                      />
                    ))}
                  </div>
                </section>
              ))}
            </main>
          </div>
        </div>
      </div>
    </>
  );
}

export default AdminAideTournoiPage;
