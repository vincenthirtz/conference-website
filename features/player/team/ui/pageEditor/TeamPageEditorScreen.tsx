// features/player/team/ui/pageEditor/TeamPageEditorScreen.tsx — branche
// l'état (`useTeamPageEditor`) sur la vue Fiche de l'éditeur (lot P10).

import { useTeamPageEditor } from '../../hooks/useTeamPageEditor';
import type { TeamPageEditorData } from '../../schemas';
import TeamPageEditorView from './TeamPageEditorView';

export default function TeamPageEditorScreen({
  team,
  tcgImageUrl,
  members,
}: TeamPageEditorData) {
  const editor = useTeamPageEditor(team);
  return (
    <TeamPageEditorView
      editor={editor}
      team={team}
      tcgImageUrl={tcgImageUrl}
      members={members}
    />
  );
}
