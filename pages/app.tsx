// pages/app.tsx
//
// Page publique qui présente la PWA (web app installable) à la communauté.
// Lien depuis le footer ("Installer l'app"). Objectif : faire installer
// l'app par les joueuses, capitaines, staff et casters — explique ce qu'on
// peut y faire et propose un bouton d'install in-page (via le deferred
// `beforeinstallprompt` event capté localement).
//
// Pas de SSR pour le bouton — la disponibilité dépend de l'état du browser
// (déjà installée ? mode incognito ? PWA criteria pas remplis ?). Le bouton
// se révèle uniquement quand l'event a été capté ; sinon on rend des
// instructions textuelles fallback ("menu Chrome → Installer l'app").

import Link from 'next/link';
import { useEffect, useState, type JSX } from 'react';
import type { SeoProps } from '@/components/Seo/DefaultSeo';

// Type local pour `beforeinstallprompt` (pas dans lib.dom standard).
type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

type Feature = {
  title: string;
  description: string;
  icon: (className: string) => JSX.Element;
};

const FEATURES: Feature[] = [
  {
    title: 'Notifs en temps réel',
    description:
      'Match imminent, check-in ouvert, score reporté, scrim acceptée : sois alertée même quand l’onglet est fermé.',
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
        <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
      </svg>
    ),
  },
  {
    title: 'Compteur taskbar',
    description:
      'L’icône épinglée affiche un compteur rouge avec ton nombre de notifs non-lues. Plus besoin de checker l’onglet.',
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="14" height="14" rx="2" />
        <circle cx="18" cy="6" r="3.5" fill="#ff2ec8" stroke="none" />
      </svg>
    ),
  },
  {
    title: 'Fonctionne hors ligne',
    description:
      'Wifi qui flanche au pire moment ? Tes actions critiques (check-in, score) sont mises en file et envoyées dès le retour de la connexion.',
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M5 12.55a11 11 0 0 1 14 0" />
        <path d="M8.5 16.05a6 6 0 0 1 7 0" />
        <line x1="3" y1="3" x2="21" y2="21" />
        <line x1="12" y1="20" x2="12.01" y2="20" />
      </svg>
    ),
  },
  {
    title: 'Boutons d’action dans les notifs',
    description:
      'Clique "Voir le match" ou "Ouvrir le ticket" directement dans la notification, sans avoir à naviguer.',
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M9 12l2 2 4-4" />
        <circle cx="12" cy="12" r="10" />
      </svg>
    ),
  },
  {
    title: 'Raccourcis depuis l’icône',
    description:
      'Clic droit sur l’icône épinglée = menu raccourcis : Tournois, Notifications, Espace joueur, Cockpit caster — un clic, t’es au bon endroit.',
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
      </svg>
    ),
  },
  {
    title: 'Écran qui reste allumé',
    description:
      'En cockpit caster pendant un BO3 de 40 min sans frappe clavier ? L’écran ne s’éteint pas tant que tu es sur la page.',
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
      </svg>
    ),
  },
  {
    title: 'UI sans barre Chrome',
    description:
      'Une fois installée, plus de barre d’adresse ni d’onglets : c’est juste l’app, comme un client desktop natif.',
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <rect x="3" y="4" width="18" height="16" rx="2" />
        <line x1="3" y1="9" x2="21" y2="9" />
      </svg>
    ),
  },
  {
    title: 'Update sans effort',
    description:
      'Quand une nouvelle version arrive, un petit banner te le dit. Tu cliques "Recharger" quand ça t’arrange — pas d’app store, pas d’attente.',
    icon: (cls) => (
      <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="23 4 23 10 17 10" />
        <polyline points="1 20 1 14 7 14" />
        <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
      </svg>
    ),
  },
];

type AudienceCard = {
  emoji: string;
  title: string;
  description: string;
  bullets: string[];
  cta: { href: string; label: string };
};

const AUDIENCES: AudienceCard[] = [
  {
    emoji: '\u{1F3AE}',
    title: 'Joueuses & capitaines',
    description: 'Pilote ton tournoi depuis ton téléphone ou ton bureau.',
    bullets: [
      'Notifs match imminent / check-in ouvert / score reporté',
      'Invitations scrim et confirmations',
      'Compteur sur l’icône taskbar pour tes actions en attente',
      'Espace équipe, messagerie inter-capitaines, scrims',
    ],
    cta: { href: '/player', label: 'Mon espace joueuse' },
  },
  {
    emoji: '\u{1F399}\u{FE0F}',
    title: 'Casters',
    description: 'Reste concentrée sur ton match, l’app gère le reste.',
    bullets: [
      'Cockpit caster : segments du jour, briefing, hotkeys',
      'Écran qui reste allumé pendant un BO sans clavier',
      'Notifs assignations, signaux Director et cues urgents',
      'Raccourci direct vers le cockpit depuis l’icône épinglée',
    ],
    cta: { href: '/caster/cockpit', label: 'Cockpit cast' },
  },
  {
    emoji: '\u{1F6E0}\u{FE0F}',
    title: 'Staff & admins',
    description: 'Le back-office complet, déclinable en PWA.',
    bullets: [
      'Notifs match, score reporté, disputes, scrim, support',
      'Compteur précis sur l’icône d’actions à traiter',
      'Boutons d’action directement dans les notifs',
      'Raccourcis Tournois / Notifs / Support / Cockpit',
    ],
    cta: { href: '/admin', label: 'Espace admin' },
  },
];

type FaqItem = { q: string; a: string };

const FAQ: FaqItem[] = [
  {
    q: 'Sur quels appareils ça marche ?',
    a: 'Windows 11 (Edge / Chrome), macOS, Linux, Android et iOS ≥ 16.4. Sur iOS, certaines fonctionnalités (badge taskbar, action buttons) sont limitées par Apple — l’essentiel marche partout.',
  },
  {
    q: 'Comment installer ?',
    a: 'Depuis cette page ou n’importe quelle page du site : clique sur l’icône d’installation à droite de la barre d’adresse, ou ouvre le menu Chrome / Edge → "Installer l’application". Sur Android, "Ajouter à l’écran d’accueil". Sur iOS, partager → "Sur l’écran d’accueil".',
  },
  {
    q: 'Pourquoi pas une vraie app sur le Store ?',
    a: 'Une PWA évite les frais Apple / Google Play, les délais de validation, et te livre les updates en quelques secondes (vs des jours sur les stores). Le code tourne en navigateur — pas de download de 80 Mo, pas d’autorisations système intrusives.',
  },
  {
    q: 'Et mes données ?',
    a: 'Aucune. La PWA est exactement le même site, juste épinglé en icône. On stocke ton token de session (auth Supabase) en local pour ne pas devoir te reconnecter à chaque fois, et c’est tout.',
  },
  {
    q: 'Comment désinstaller ?',
    a: 'Sur Windows : clic droit sur l’icône taskbar → Désinstaller. Sur macOS : depuis le menu de l’app → Désinstaller. Android : appui long sur l’icône → Désinstaller. Tes données restent sur le site (la PWA n’est qu’un raccourci).',
  },
  {
    q: 'Je peux activer les notifs sans installer ?',
    a: 'Oui — depuis ton espace admin / caster / joueur, le banner d’activation des notifications marche aussi en navigateur classique. L’install ajoute juste l’icône taskbar, les raccourcis et le mode hors-ligne.',
  },
];

function AppPage() {
  const [installPrompt, setInstallPrompt] =
    useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const onBefore = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as BeforeInstallPromptEvent);
    };
    const onInstalled = () => {
      setInstalled(true);
      setInstallPrompt(null);
    };
    // Détecte une PWA déjà installée et lancée en mode standalone — pas la
    // peine de re-proposer l’install.
    if (
      window.matchMedia?.('(display-mode: standalone)').matches ||
      // @ts-expect-error iOS Safari only
      window.navigator.standalone === true
    ) {
      setInstalled(true);
    }

    window.addEventListener('beforeinstallprompt', onBefore);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onBefore);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);

  const canInstall = !!installPrompt && !installed;

  const handleInstall = async () => {
    if (!installPrompt) return;
    try {
      await installPrompt.prompt();
      const choice = await installPrompt.userChoice;
      if (choice.outcome === 'accepted') {
        setInstalled(true);
      }
    } catch {
      // Race / navigation pendant le prompt — ignored.
    } finally {
      setInstallPrompt(null);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      {/* ─── HERO ─── */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-cyan-500/25 blur-3xl" />
          <div className="absolute right-0 top-20 h-[360px] w-[360px] rounded-full bg-fuchsia-500/20 blur-3xl" />
          <div className="absolute left-1/3 bottom-0 h-[300px] w-[300px] rounded-full bg-violet-600/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-6xl px-6 pt-32 pb-20 text-center">
          <p className="mx-auto inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            <span className="rounded-full bg-gradient-to-r from-cyan-400 to-fuchsia-500 px-2 py-[2px] text-[10px] font-semibold text-black">
              PWA
            </span>
            <span>Application installable</span>
          </p>
          <h1 className="mt-5 text-4xl font-bold leading-tight sm:text-5xl md:text-6xl">
            <span className="bg-gradient-to-r from-cyan-300 via-fuchsia-400 to-violet-400 bg-clip-text text-transparent">
              Vis le tournoi
            </span>
            <br />
            sans rater un match
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-lg text-gray-200">
            L&apos;app OW Women&apos;s Cup s&apos;installe en un clic sur ton bureau ou ton
            téléphone. Notifs, raccourcis, compteur sur l&apos;icône, mode hors-ligne — tout ce qu&apos;une app native fait, sans le passage par le store.
          </p>

          <div className="mt-9 flex flex-wrap items-center justify-center gap-3">
            {installed ? (
              <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/40 bg-cyan-500/10 px-5 py-3 text-sm font-medium text-cyan-200">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
                App installée — tu y es déjà
              </div>
            ) : canInstall ? (
              <button
                type="button"
                onClick={handleInstall}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-violet-600 px-6 py-3 text-sm font-bold text-black shadow-lg shadow-fuchsia-500/30 transition hover:scale-105"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Installer l&apos;app
              </button>
            ) : (
              <a
                href="#install"
                className="inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/5 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
              >
                Comment installer ?
              </a>
            )}
            <a
              href="#fonctionnalites"
              className="inline-flex items-center gap-2 rounded-full border border-white/15 px-6 py-3 text-sm font-semibold text-white transition hover:border-white/40 hover:bg-white/10"
            >
              Voir les fonctionnalités
            </a>
          </div>

          {!canInstall && !installed && (
            <p className="mx-auto mt-5 max-w-lg text-xs text-gray-400">
              Ton navigateur n&apos;a pas (encore) proposé l&apos;install. Utilise le
              menu de Chrome / Edge → &laquo;&nbsp;Installer l&apos;application&nbsp;&raquo;,
              ou consulte la FAQ ci-dessous.
            </p>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-6xl space-y-20 px-4 pb-24 sm:px-6">
        {/* ─── FEATURES ─── */}
        <section id="fonctionnalites">
          <h2 className="text-3xl font-bold mb-3">Ce qu&apos;elle change</h2>
          <p className="mb-10 text-gray-400">
            Pas un wrapper. Vraiment l&apos;app que tu attendais.
          </p>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {FEATURES.map((f) => (
              <div
                key={f.title}
                className="rounded-2xl border border-white/10 bg-gradient-to-br from-white/5 to-transparent p-5 transition hover:border-fuchsia-400/40 hover:bg-white/[0.07]"
              >
                <div className="mb-3 inline-flex items-center justify-center rounded-xl bg-gradient-to-br from-cyan-500/20 to-fuchsia-500/20 p-2.5 text-cyan-300">
                  {f.icon('w-6 h-6')}
                </div>
                <h3 className="mb-1 text-base font-semibold">{f.title}</h3>
                <p className="text-sm leading-snug text-gray-400">
                  {f.description}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ─── AUDIENCES ─── */}
        <section id="audiences">
          <h2 className="text-3xl font-bold mb-3">Selon ce que tu fais</h2>
          <p className="mb-10 text-gray-400">
            L&apos;app s&apos;adapte à ton rôle. Trois entrées, une seule install.
          </p>
          <div className="grid gap-6 md:grid-cols-3">
            {AUDIENCES.map((a) => (
              <article
                key={a.title}
                className="flex flex-col rounded-3xl border border-white/10 bg-gradient-to-b from-[#0F1F3A]/60 via-[#1A0F2E]/60 to-[#2C0B2C]/60 p-6 shadow-xl"
              >
                <div className="text-3xl mb-3" aria-hidden="true">
                  {a.emoji}
                </div>
                <h3 className="text-xl font-bold mb-2">{a.title}</h3>
                <p className="text-sm text-gray-300 mb-4">{a.description}</p>
                <ul className="space-y-2 text-sm text-gray-200 mb-6 flex-1">
                  {a.bullets.map((b) => (
                    <li key={b} className="flex items-start gap-2">
                      <svg className="w-4 h-4 mt-0.5 flex-shrink-0 text-cyan-300" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      <span>{b}</span>
                    </li>
                  ))}
                </ul>
                <Link
                  href={a.cta.href}
                  className="mt-auto inline-flex items-center justify-center gap-1 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-sm font-semibold text-white transition hover:border-fuchsia-400/50 hover:bg-fuchsia-500/10"
                >
                  {a.cta.label} <span aria-hidden="true">↗</span>
                </Link>
              </article>
            ))}
          </div>
        </section>

        {/* ─── INSTALL ─── */}
        <section id="install" className="rounded-3xl border border-white/10 bg-gradient-to-r from-cyan-500/10 via-fuchsia-500/10 to-violet-500/10 p-8 sm:p-12">
          <h2 className="text-3xl font-bold mb-6">Comment l&apos;installer ?</h2>
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
            {[
              {
                label: 'Windows / macOS',
                body:
                  'Chrome ou Edge → icône d’install à droite de la barre d’adresse, OU menu ⋮ → "Installer l’application".',
              },
              {
                label: 'Android',
                body:
                  'Chrome → menu ⋮ → "Ajouter à l’écran d’accueil". L’app apparaît comme une appli normale.',
              },
              {
                label: 'iOS / iPadOS',
                body:
                  'Safari → bouton Partager ↗ → "Sur l’écran d’accueil". iOS ≥ 16.4 pour les notifs.',
              },
              {
                label: 'Linux',
                body:
                  'Chrome ou Edge supportent l’install standalone (menu ⋮ → "Installer"). Firefox : pas encore.',
              },
            ].map((s) => (
              <div key={s.label}>
                <h3 className="text-sm font-semibold uppercase tracking-wider text-cyan-300 mb-2">
                  {s.label}
                </h3>
                <p className="text-sm text-gray-200 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>
          {canInstall && (
            <div className="mt-8 text-center">
              <button
                type="button"
                onClick={handleInstall}
                className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-cyan-400 via-fuchsia-500 to-violet-600 px-6 py-3 text-sm font-bold text-black shadow-lg shadow-fuchsia-500/30 transition hover:scale-105"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Installer maintenant
              </button>
            </div>
          )}
        </section>

        {/* ─── FAQ ─── */}
        <section id="faq">
          <h2 className="text-3xl font-bold mb-3">Questions fréquentes</h2>
          <p className="mb-8 text-gray-400">
            Doutes ? Voici ce que les autres ont demandé.
          </p>
          <div className="divide-y divide-white/10 rounded-2xl border border-white/10 bg-white/[0.02]">
            {FAQ.map((item) => (
              <details
                key={item.q}
                className="group px-5 py-4 [&_summary::-webkit-details-marker]:hidden"
              >
                <summary className="flex cursor-pointer items-center justify-between gap-4 text-sm font-semibold text-white">
                  <span>{item.q}</span>
                  <svg
                    className="w-4 h-4 flex-shrink-0 transition-transform group-open:rotate-180 text-gray-400"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <polyline points="6 9 12 15 18 9" />
                  </svg>
                </summary>
                <p className="mt-3 text-sm leading-relaxed text-gray-300">
                  {item.a}
                </p>
              </details>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

const appSeo: SeoProps = {
  title: "Installer l'app — OW Women's Cup",
  description:
    "Installe la PWA OW Women's Cup pour recevoir tes notifs match, scrim et check-in en temps réel, même hors-ligne. Compatible Windows, macOS, Android et iOS.",
};

AppPage.seo = appSeo;

export default AppPage;
