// pages/team/[slug]/edit.tsx — éditeur de la page publique d'une équipe,
// RÉSERVÉ à qui a `edit_public_page` (capitaine, manager, délégation J3).
//
// Coquille (lot P10) : le SSR passe par `defineSubjectPage` et le service
// `loadTeamPageEditor` (plus d'accès base ici) ; l'écran vit dans
// features/player/team/ui/pageEditor (archétype Fiche du kit Le Ruban).
//
// Act-as staff : `?as=<id>&act=1` (staff ≥ admin, tenant actif) ouvre
// l'éditeur au nom d'une personne habilitée ; l'entrée est journalisée, et
// chaque enregistrement l'est par sa route (`act_as_player`). La fiche
// publique `/team/[slug]` est hors de ce périmètre.

import Head from 'next/head';
import { PlayerAreaProvider } from '@/components/player/PlayerAreaContext';
import { loadTeamPageEditor } from '@/features/player/team/service/pageEditor';
import type { TeamPageEditorData } from '@/features/player/team/schemas';
import TeamPageEditorScreen from '@/features/player/team/ui/pageEditor/TeamPageEditorScreen';
import { format, useT } from '@/lib/i18n/useT';
import nsTeamEdit from '@/lib/i18n/locales/fr/teamEdit';
import {
  defineSubjectPage,
  type SubjectPageScope,
} from '@/utils/player/subjectPage';

type Props = TeamPageEditorData & { subjectScope: SubjectPageScope };

const slugOf = (params: unknown) =>
  (params as { slug?: string } | undefined)?.slug;

export const getServerSideProps = defineSubjectPage<TeamPageEditorData>({
  endpoint: '/team/[slug]/edit',
  actAs: true,
  loginNext: (ctx) =>
    `/team/${encodeURIComponent(slugOf(ctx.params) ?? '')}/edit`,
  load: async (ctx, sctx) => {
    const slug = slugOf(ctx.params);
    if (!slug) return { notFound: true };
    const outcome = await loadTeamPageEditor(sctx, slug);
    if (outcome.kind === 'not_found') return { notFound: true };
    if (outcome.kind === 'forbidden') {
      return {
        redirect: {
          destination: `/team/${encodeURIComponent(slug)}`,
          permanent: false,
        },
      };
    }
    return { props: outcome.data };
  },
});

export default function TeamPublicEditPage({ subjectScope, ...data }: Props) {
  const t = useT(nsTeamEdit);
  return (
    <PlayerAreaProvider
      subjectId={subjectScope.subjectId}
      actAs={subjectScope.actAs}
    >
      <Head>
        <title>{format(t.headTitle, { name: data.team.name })}</title>
      </Head>
      <TeamPageEditorScreen {...data} />
    </PlayerAreaProvider>
  );
}
