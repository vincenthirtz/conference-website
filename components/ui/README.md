# Kit UI partagé

Primitives communes aux deux espaces authentifiés (`/admin/*` et `/player/*`).
Livré en S5 de [`docs/PLAN-espace-unifie.md`](../../docs/PLAN-espace-unifie.md).

## Pourquoi

S1→S4 ont supprimé la duplication des **données** (l'admin lit les vrais
endpoints joueur via `?as=`). Restait la duplication des **composants** :
cinq interrupteurs quasi identiques mais divergents, quatre `EmptyState`
locaux, des pastilles recopiées avec leur propre table de couleurs. Chaque
copie était aussi un endroit où l'accessibilité pouvait se perdre en silence
(`role="switch"` sans `aria-checked`, anneau de focus oublié).

## Référence visuelle

Le look **`/admin`** fait foi (demande produit) : `emerald-600` actif,
`neutral-700` au repos, surfaces `neutral-800/40` bordées `neutral-700/50`.

## Contenu

| Primitive | Rôle | Remplace |
|---|---|---|
| `Switch` | interrupteur piste + pastille | 5 copies (Twitch, régie live, ScrimsHub, manage-team ×2, prefs notifs) |
| `Badge` | pastille rôle / statut, par `tone` | ~15 pastilles manuscrites |
| `EmptyState` | état vide titré | 4 définitions locales |
| `Modal` | modale + focus trap | — (déplacé depuis `admin/`) |
| `Tabs` | onglets + `useQueryTab` | — (déplacé) |
| `Skeleton` | squelettes de chargement | — (déplacé) |
| `StatusBadge` | statut de match (métier) | — (déplacé) |

`components/admin/{Modal,Tabs,Skeleton,StatusBadge,EmptyState}.tsx` sont
désormais de simples ré-exports dépréciés : les dizaines d'imports existants
continuent de marcher, les nouveaux appels visent `@/components/ui/*`.

## Hors périmètre (décision à prendre)

La **surface « carte »** n'est pas unifiée. L'espace joueur utilise
`rounded-2xl border-white/10 bg-white/[0.03] backdrop-blur-xl` à **132
endroits** ; l'admin n'a pas de surface unique équivalente. Converger
voudrait dire re-skinner l'espace joueur — c'est un chantier visuel à part
entière, sans filet de tests de composants, et sans rapport avec la
duplication de logique que ce plan visait. À arbitrer explicitement avant de
s'y lancer.

Restent aussi deux bascules non migrées, parce que ce ne sont pas des
interrupteurs piste + pastille : `/admin/map-pool` (pilule avec libellé) et
`/admin/tournament/[id]/prize-pool` (case à cocher `role="switch"`).
