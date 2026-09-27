// pages/tournament/[id]/inscription-solo.tsx
//
// Inscription INDIVIDUELLE à un tournoi — le parcours d'un événement « chacune
// pour soi » (cf. `tournaments.solo_mode`).
//
// POURQUOI UNE PAGE À PART, et pas un mode du wizard /team/create.
//   Le wizard d'équipe pose trois questions qui n'ont aucun sens ici : un nom
//   d'équipe, un roster, un capitanat. Le plier en « mode solo » aurait voulu
//   dire traverser ses trois étapes, sa validation par étape et son stepper
//   pour n'en garder qu'un tiers — au risque d'abîmer le chemin d'inscription
//   principal de la Cup, qui est critique. Ici : un écran, trois champs.
//
// CE QUI SE PASSE DERRIÈRE, ET QU'ON NE DIT PAS À LA PARTICIPANTE.
//   Le POST part vers /api/teams/create-with-member, exactement comme une
//   inscription d'équipe — avec un roster d'UNE joueuse, elle-même capitaine.
//   La « team » créée porte son pseudo. C'est délibéré : tout l'aval (phases,
//   lobbies FFA, classement, palmarès) raisonne en équipes, et rien n'a à
//   connaître ce parcours. Le drapeau `solo_mode` du tournoi coupe la seule
//   conséquence indésirable de cette représentation — l'émission de
//   `team.created`, donc le provisionnement d'un rôle et de deux salons
//   Discord par inscrite.
//
// GARDES.
//   404 si le tournoi n'existe pas, n'est pas public, ou n'est PAS en solo :
//   cette page ne doit jamais servir de porte dérobée pour s'inscrire seule à
//   un tournoi par équipes. Le formulaire ne s'affiche que si les inscriptions
//   sont ouvertes (`status === 'published'`) ; sinon la page explique, elle ne
//   disparaît pas — le lien peut circuler avant l'ouverture.

import type { GetStaticPaths, GetStaticProps } from 'next';
import Link from 'next/link';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import Heading from '@/components/Typography/heading';
import Paragraph from '@/components/Typography/paragraph';
import { DEFAULT_TENANT_ID } from '@/utils/tenant';
import { findTournamentByIdOrSlug } from '@/utils/tournamentLookup';
import {
  validateFieldDefinitions,
  type RegistrationField,
} from '@/utils/registrationFields';
import { logger } from '@/utils/logger';
import { useT } from '@/lib/i18n/useT';
import nsSoloSignup from '@/lib/i18n/locales/fr/soloSignup';
import SoloSignupForm from '@/components/SoloSignup/SoloSignupForm';

type TournamentLite = {
  id: string;
  slug: string | null;
  name: string;
  status: string;
  visibility: string | null;
  solo_mode: boolean | null;
  registration_fields: unknown;
};

type Props = {
  tournamentId: string;
  tournamentName: string;
  tournamentPath: string;
  /** Inscriptions ouvertes : seul `published` accepte une inscription. */
  open: boolean;
  registrationFields: RegistrationField[];
  seo: SeoProps;
};

function buildSeo(name: string): SeoProps {
  return {
    title: {
      fr: `Inscription individuelle – ${name}`,
      en: `Individual sign-up – ${name}`,
    },
    description: {
      fr: `Inscris-toi seule à ${name} — pas besoin d'équipe : pseudo, BattleTag, email, et c'est parti.`,
      en: `Enter ${name} on your own — no team needed: handle, BattleTag, email, and you're in.`,
    },
    type: 'website',
  };
}

export const getStaticPaths: GetStaticPaths = async () => {
  return { paths: [], fallback: 'blocking' };
};

export const getStaticProps: GetStaticProps<Props> = async (ctx) => {
  const id = ctx.params?.id;
  if (!id || Array.isArray(id)) {
    return { notFound: true, revalidate: 60 };
  }

  const tenantId = DEFAULT_TENANT_ID;

  const tournament = await findTournamentByIdOrSlug<TournamentLite>(
    id,
    'id, slug, name, status, visibility, solo_mode, registration_fields',
    tenantId
  );
  if (!tournament) {
    return { notFound: true, revalidate: 60 };
  }
  if (tournament.visibility && tournament.visibility !== 'public') {
    return { notFound: true, revalidate: 60 };
  }
  // Le garde qui compte : hors mode solo, cette page n'existe pas.
  if (tournament.solo_mode !== true) {
    return { notFound: true, revalidate: 60 };
  }

  // Champs personnalisés : normalisés ICI, côté serveur, comme le fait
  // /api/tournaments. La colonne est un jsonb libre, et `validateFieldDefinitions`
  // tire zod — ~250 ko qui n'ont rien à faire dans le bundle d'une page publique.
  const defs = validateFieldDefinitions(tournament.registration_fields);
  if (!defs.ok) {
    logger.error(
      '[inscription-solo] registration_fields invalides',
      tournament.id,
      defs.error
    );
  }

  return {
    props: {
      tournamentId: tournament.id,
      tournamentName: tournament.name,
      tournamentPath: `/tournament/${tournament.slug || tournament.id}`,
      open: tournament.status === 'published',
      registrationFields: defs.ok ? defs.fields : [],
      seo: buildSeo(tournament.name),
    },
    revalidate: 60,
  };
};

export default function SoloSignupPage({
  tournamentId,
  tournamentName,
  tournamentPath,
  open,
  registrationFields,
}: Props) {
  const t = useT(nsSoloSignup);

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="relative overflow-hidden">
        <div className="pointer-events-none absolute inset-0" aria-hidden>
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-[var(--color-violet)]/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-[var(--color-green)]/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-2xl px-6 pt-header-lg pb-10 text-center">
          <p className="inline-flex items-center rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.badge}
          </p>
          <Heading level="h1" className="text-brand-gradient mt-4">
            {t.title}
          </Heading>
          <Paragraph className="mx-auto mt-3 max-w-xl text-gray-200">
            {tournamentName}
          </Paragraph>
          <Paragraph className="mx-auto mt-1 max-w-xl text-gray-400">
            {t.subtitle}
          </Paragraph>
        </div>
      </div>

      <section className="mx-auto max-w-2xl px-6 pb-16">
        {open ? (
          <SoloSignupForm
            tournamentId={tournamentId}
            tournamentName={tournamentName}
            registrationFields={registrationFields}
          />
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
            <h2 className="text-lg font-semibold">{t.closedTitle}</h2>
            <p className="mt-2 text-sm text-gray-300">{t.closedBody}</p>
          </div>
        )}

        <p className="mt-8 text-center text-sm">
          <Link
            href={tournamentPath}
            className="text-gray-400 underline-offset-4 hover:text-white hover:underline"
          >
            {t.backToTournament}
          </Link>
        </p>
      </section>
    </div>
  );
}
