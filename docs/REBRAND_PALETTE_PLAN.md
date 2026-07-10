# Plan de rebrand — nouvelle palette (violet / vert / jaune)

> **Statut : BROUILLON à valider.** Ce document est le plan de migration des
> couleurs de tout le site (public **et** admin) vers la palette du futur logo.
> Aucune ligne de style n'est encore modifiée. On valide la stratégie + les
> hex + les décisions ouvertes, PUIS on exécute lot par lot.

## 1. Constat — comment les couleurs vivent aujourd'hui

- **Hub unique** : [`styles/globals.css`](../styles/globals.css) (~1817 lignes).
  - Bloc `@theme { … }` → expose les utilitaires Tailwind v4 (`bg-neon-*`,
    `shadow-neon-*`, `animate-*`).
  - Bloc `:root { … }` → **source de vérité** : ~41 variables `--color-*`,
    `--brand-*`, `--gradient-*`, `--glow-*`. C'est le point de levier n°1.
- **Identité actuelle = néon cyberpunk** : cyan `#00f0ff`, magenta `#ff2ec8`,
  violet `#bb00ff`, + glows `rgba()` empilés (tight + bloom + shadow).
- **Couche whitelabel déjà en place** : `--brand-primary` (→ violet) et
  `--brand-accent` (→ magenta), surchargées par tenant via
  `pages/_document.tsx` sur `custom_domain`. **On réutilise ce mécanisme.**
- **`tailwind.config.ts`** : ne porte qu'une échelle `dark` (gris-violacés) +
  `backgroundImage` (madrid/online). Peu de couleur en dur ici.
- **Admin** : **pas de thème séparé** — partage `globals.css`. S'appuie surtout
  sur des gris neutres + quelques accents de marque. Il suit automatiquement dès
  que les tokens changent (à vérifier lot D).
- **Longue traîne** : ~**200 hex en dur** (63 dans `components/`, 140 dans
  `pages/**/*.tsx`) + ~**66 `rgba()`** de glow inline. C'est le vrai coût.

### Écart palette

| Ancien (néon) | Nouveau (logo) |
|---|---|
| Cyan `#00f0ff` | **supprimé** (plus de cyan de marque) |
| Magenta / rose `#ff2ec8` | → remplacé par **vert** ou **jaune** en accent |
| Violet `#bb00ff` | → **violet** (garde le rôle primaire, retinté) |
| — | **vert** (nouveau, secondaire) |
| — | **jaune** (nouveau, accent/highlight) |

> Conséquence : ce n'est **pas** un simple find-replace. Cyan disparaît ;
> vert et jaune sont neufs. Tous les gradients/glows tri-couleur
> (`--gradient-neon-tri`, `--shadow-neon-tri`, `--gradient-text`…) doivent être
> **recomposés**, pas juste re-mappés.

## 2. Nouvelle palette (hex À CONFIRMER depuis le fichier logo vectoriel)

Valeurs **estimées** depuis l'aperçu fourni — à remplacer par les hex exacts du
`.svg`/`.ai` du logo avant exécution :

| Rôle | Nom token | Hex (estimé) | Usage |
|---|---|---|---|
| Primaire | `--brand-primary` | `#B24BE0` (violet) | CTA, liens, focus, titres accentués |
| Secondaire | `--brand-secondary` | `#7CC868` (vert) | états positifs de marque, 2ᵉ accent, dégradés |
| Accent | `--brand-accent` | `#EFE83C` (jaune) | highlights, badges, hovers — **jamais texte sur clair** |

Pour chaque couleur, définir une **échelle** (50→900) — au moins
`{ light, base, deep }` — pour les surfaces, bordures, hovers et le dark mode.
Générer via une rampe perceptuelle (OKLCH) plutôt qu'un simple éclaircir/assombrir.

## 3. Stratégie — token-first, puis sweep

1. **Fonder les tokens** (globals.css) : réécrire les ~15 hex de marque du
   `:root` + `@theme`. ~70 % du rendu bascule ici sans toucher un seul composant.
2. **Recomposer néon/glow** : re-tinter les `--glow-*` / `--shadow-neon-*` /
   gradients tri-couleur avec violet/vert/jaune (ou les atténuer — cf. décision D1).
3. **Sweeper la longue traîne** : remplacer les ~200 hex + ~66 `rgba()` inline
   par les tokens. C'est mécanique mais volumineux → délégué par zone.
4. **Vérifier** : contraste WCAG, régression visuelle Playwright, garde-fou
   « token sans fallback » (cf. gotcha thème Bibimbox — un `var()` non défini
   casse toute la déclaration).

## 4. Décisions à trancher AVANT d'exécuter

- **D1 — On garde l'esthétique néon/glow ?**
  - (a) La conserver mais retintée violet/vert/jaune (fidèle à l'ADN cyberpunk).
  - (b) L'atténuer vers un rendu plus « clean / flat » (le vert+jaune passent
    mal en néon saturé, risque kitsch).
  - *Reco : (a) pour le violet, glows plus doux pour vert/jaune.*
- **D2 — Rôle du jaune.** Highlight/badge uniquement, ou vraie 3ᵉ couleur de
  surface ? Le jaune est **inutilisable en texte sur fond clair** (contraste).
  *Reco : accent décoratif + dark uniquement.*
- **D3 — Collision sémantique.** Aujourd'hui vert = succès, jaune/orange =
  warning, rouge = erreur. Si vert **et** jaune deviennent des couleurs de
  **marque**, il faut **séparer** les tokens `--status-success/-warning/-error`
  des tokens `--brand-*` pour qu'un « ✓ succès » ne se confonde pas avec le vert
  de marque. *Reco : introduire un namespace `--status-*` distinct.*
- **D4 — Portée admin.** Rebrand complet de l'admin ou accents seulement (garder
  la sobriété grise fonctionnelle) ? *Reco : accents + focus/liens, garder les
  gris.*
- **D5 — Whitelabel.** La nouvelle palette devient le **défaut** des 2 vars
  existantes ; ajouter `--brand-secondary` à la couche surchargée par tenant.

## 5. Découpage en lots (chaque lot = un commit/PR autonome)

- **Lot A — Fondation tokens** *(globals.css `:root` + `@theme` + `tailwind.config.ts`)*
  - Nouvelles échelles violet/vert/jaune, remap `--brand-*`, `--color-*` legacy
    pointés vers les nouveaux ou marqués `@deprecated`.
  - Ajouter le namespace `--status-*` (D3).
  - **Zéro régression attendue** hors couleur : c'est le pivot.
- **Lot B — Néon / glows / gradients** recomposés (D1). Le plus « créatif ».
- **Lot C — Sweep longue traîne public** : `components/` + `pages/**` (hors
  admin) → hex/rgba inline remplacés par tokens. Délégué à `public-ui`.
- **Lot D — Admin** : accents, focus, liens, boutons ; vérifier lisibilité des
  gris. Délégué à `admin-ui`.
- **Lot E — Sémantique & dataviz** : tokens `--status-*`, couleurs de séries de
  graphes/brackets/stats (utiliser la skill `dataviz` pour une rampe cohérente
  et accessible). Attention aux collisions vert/jaune (D3).
- **Lot F — Assets** : swap du logo, favicon (violet/vert/jaune), images OG,
  bannières (`madrid`/`online` dans tailwind.config), éventuels PNG teintés.

## 6. Vérification (avant chaque merge)

- **Contraste WCAG AA** : tout texte ≥ 4.5:1 (≥ 3:1 gros texte). Le **jaune** et
  le **vert clair** sur blanc échouent → cantonnés aux accents/dark. Auditer avec
  un check automatisable.
- **Garde-fou token** : `grep` des `var(--…)` sans fallback introduits, +
  vérifier qu'aucun token supprimé n'est encore référencé (sinon déclaration
  cassée en silence — gotcha connu).
- **Régression visuelle** : screenshots Playwright avant/après sur les pages
  clés (accueil, tournoi public, espace capitaine, dashboard admin, un graphe).
- **Dark + light** : les deux thèmes doivent tenir.

## 7. Risques

- **Volume de la longue traîne** (~200 hex) : sous-estimer = rebrand « à moitié »
  avec des restes cyan/magenta visibles. Le `grep` de tokens legacy est la
  checklist de complétude.
- **Jaune + accessibilité** : piège récurrent, à cadrer dès le Lot A (D2).
- **Collision vert marque / vert succès** (D3) : sans séparation, l'UI devient
  ambiguë (« est-ce validé ou juste stylé ? »).
- **Néon vert/jaune** : peut virer kitsch ; valider un échantillon avant de
  généraliser (Lot B).

## 8. Prochaine étape

1. Récupérer les **hex exacts** depuis le logo vectoriel (remplacer les estimés §2).
2. Trancher **D1–D5**.
3. Lancer le **Lot A** (fondation tokens) — isolé, réversible, sans toucher aux
   composants.
