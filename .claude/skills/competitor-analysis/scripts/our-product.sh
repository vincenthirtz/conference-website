#!/usr/bin/env bash
# our-product.sh [fichier-sortie.md]
#
# Inventaire de NOTRE produit (conference-website + bot docker-box), lu dans le
# CODE, avec la preuve (fichier) de chaque ligne. La comparaison avec un
# concurrent ne doit jamais reposer sur la mémoire d'une conversation : un plan
# « gratuit » qui ne l'est plus, une capacité retirée… se lisent ici.
#
# À lancer depuis la racine de conference-website.
set -uo pipefail

ROOT="$(git rev-parse --show-toplevel 2>/dev/null || pwd)"
cd "$ROOT" || exit 1
OUT="${1:-/dev/stdout}"
BOT="$ROOT/../docker-box/services/discord-bot"

{
echo "# Inventaire produit — $(date +%Y-%m-%d) (commit $(git rev-parse --short HEAD))"
echo

echo "## Barème et capacités par plan"
echo
echo '_Source : `utils/billing/planFeatures.ts` (PLAN_PRICES_EUR, FEATURES)._'
echo
node --import ./scripts/register-ts.mjs -e '
  const m = await import("./utils/billing/planFeatures.ts");
  const plans = Object.keys(m.PLAN_PRICES_EUR);
  const price = (p) => m.PLAN_PRICES_EUR[p] === null ? "sur devis" : m.PLAN_PRICES_EUR[p] === 0 ? "offert" : `${m.PLAN_PRICES_EUR[p]} €/an (≈ ${Math.round(m.PLAN_PRICES_EUR[p] / 12)} €/mois)`;
  console.log("| Capacité | " + plans.map((p) => m.PLAN_LABELS[p] ?? p).join(" | ") + " |");
  console.log("|---|" + plans.map(() => "---").join("|") + "|");
  console.log("| Prix | " + plans.map(price).join(" | ") + " |");
  const rows = Object.keys(m.tenantFeatures({ plan: "circuit", plan_status: "active", plan_expires_at: null }));
  for (const k of rows) {
    const cells = plans.map((p) => {
      const v = m.tenantFeatures({ plan: p, plan_status: "active", plan_expires_at: null })[k];
      return v === true ? "✓" : v === false ? "—" : v === Infinity ? "∞" : String(v);
    });
    console.log(`| ${k} | ${cells.join(" | ")} |`);
  }
' 2>/dev/null || echo "(lecture du barème impossible : vérifier utils/billing/planFeatures.ts)"
echo

echo "## Jeux configurés"
echo
for f in config/games/*.ts; do
  [ "$(basename "$f")" = "index.ts" ] && continue
  label=$(grep -m1 -oE "label: '[^']+'" "$f" | sed "s/label: '//; s/'$//")
  echo "- ${label:-$(basename "$f" .ts)} (\`$f\`)"
done
echo

echo "## Surface"
echo
printf -- "- Pages publiques (hors admin/api) : %s\n" "$(find pages -name '*.tsx' ! -path 'pages/admin/*' ! -path 'pages/api/*' | wc -l | tr -d ' ')"
printf -- "- Écrans admin : %s\n" "$(find pages/admin -name '*.tsx' | wc -l | tr -d ' ')"
for area in bot/v1 admin public/v1 player teams cron; do
  printf -- "- Routes API \`/api/%s\` : %s\n" "$area" "$(find "pages/api/$area" -name '*.ts' 2>/dev/null | wc -l | tr -d ' ')"
done
if [ -d "$BOT" ]; then
  printf -- "- Bot Discord : %s commandes slash de premier niveau déclarées (\`services/discord-bot\`)\n" \
    "$(grep -h -A2 'new SlashCommandBuilder' "$BOT"/*.js | grep -oE "setName\('[a-z0-9-]+'\)" | sort -u | wc -l | tr -d ' ')"
fi
echo

echo "## Capacités (✓ = preuve trouvée dans le code)"
echo
# capf <libellé> <fichier> [fichier…] : ✓ si l'un des fichiers CANONIQUES existe.
capf() {
  local label="$1"; shift
  for f in "$@"; do
    if [ -e "$f" ]; then echo "- ✓ $label — \`$f\`"; return; fi
  done
  echo "- — $label (fichier attendu absent : $1)"
}
# capg <libellé> <motif grep -E> <chemins…> : pour ce qui n'a pas de fichier
# canonique, surtout les ABSENCES à confirmer (un — ici se revérifie à la main).
capg() {
  local label="$1" pattern="$2"; shift 2
  local hit
  hit=$(grep -rlE "$pattern" "$@" 2>/dev/null | grep -vE '\.test\.ts$' | head -1)
  if [ -n "$hit" ]; then echo "- ✓ $label — \`$hit\` (indice : à confirmer)"; else echo "- — $label (aucune trace, à confirmer)"; fi
}
echo "### Organisation"
capf "Brackets élimination simple/double" utils/bracket/generateBracket.ts
capf "Système suisse" utils/swiss/runNextRound.ts
capf "Poules / round robin" utils/groups/roundRobin.ts
capf "Check-in (lien joueuse)" pages/api/checkin/[token].ts pages/checkin/[token].tsx
capf "Inscription d'équipe publique" pages/api/demandes/register-team.ts
capf "Draft de héros (moteur)" utils/draftEngine.ts
capf "Veto de maps" pages/api/admin/matches/[matchId]/veto.ts pages/api/bot/v1/matches/[matchId]/veto.ts
capf "Presets de partie personnalisée" utils/matches/resolveMatchPreset.ts
capf "Grille de disponibilités pour scrims" pages/api/teams/scrim-plannings/index.ts
capf "Export agenda ICS" pages/api/player/agenda.ics.ts pages/api/tournament/[id]/calendar.ics.ts
echo "### Intégrité"
capf "Litiges, arbitrage et SLA" utils/disputes/arbitrationMetrics.ts
capf "Preuves (captures) de résultat" pages/api/admin/matches/[matchId]/evidence.ts
capf "Réconciliation automatique des scores" utils/matches/reconcile.ts
capf "Compte Battle.net vérifié (OAuth, anti-smurf)" pages/api/auth/battlenet
capf "Liste noire d'équipes / organisations" utils/moderation/entityBlacklist.ts
echo "### Communauté et joueuses"
capf "Rating Glicko-2" utils/rating/glicko2.ts
capf "Ligues et saisons" utils/leagues/computeStandings.ts
capf "Scrims (recherche, résultat, ladder)" pages/api/teams/scrim-searches.ts utils/scrims/scrimResult.ts
capf "Marché joueuses libres / annonces d'équipes" pages/api/public/free-players/index.ts pages/api/public/team-openings/index.ts
capf "Découverte joueuses (opt-in, connectée)" pages/api/player/discovery/search.ts
capf "Messagerie" pages/api/player/messages.ts
capf "TCG (cartes à collectionner)" pages/api/player/tcg/wallet.ts
capf "Palmarès" pages/palmares.tsx
capf "Classement public" pages/leaderboard.tsx
capf "Image de partage joueuse (OG)" pages/api/og/player/[userId].tsx
capg "Pronostics spectateurs (hors prédictions Twitch)" "pronostic" pages components utils
capg "Annuaire public de clubs / structures" "clubs?Directory|annuaire des (clubs|structures)" pages components
capg "Carte interactive des événements" "leaflet|maplibre|mapbox" pages components
capg "Catalogue de tournois inter-espaces" "crossTenantTournaments|tournamentsNetwork|network/tournaments" pages utils
echo "### Diffusion"
capf "Overlay OBS de régie" pages/overlay/[runId].tsx
capf "Direction automatique de régie" utils/broadcast/autoDirector.ts
capf "Cockpit caster" pages/caster/cockpit.tsx
capf "Prédictions Twitch" pages/api/admin/twitch/predictions/index.ts
echo "### Argent"
capf "Paiement de plan (HelloAsso)" utils/billing/tenantPlanBilling.ts
capf "Cagnotte cash-prize crowdfundée" pages/api/helloasso/prize-checkout.ts utils/billing/prizePoolFunding.ts
capg "Droit d'inscription payant à un tournoi" "entry_fee|registration_fee" utils pages/api
echo "### Plateforme"
capf "Multi-espaces en marque blanche" utils/tenant.ts
capf "Domaines personnalisés" pages/api/cron/domain-verify.ts
capf "API publique v1" utils/publicApi.ts
capf "GraphQL" pages/api/graphql.ts
capf "Webhooks sortants" pages/api/admin/webhooks/index.ts
capf "Portail développeur" pages/developpeurs.tsx
capf "Notifications push web" pages/api/player/push
capf "FR/EN (i18n maison)" lib/i18n/LanguageProvider.tsx
capf "Bandeau de consentement avant mesure d'audience" components/CookieBanner/CookieBanner.tsx
echo

echo "## Cohérence du discours commercial"
echo
echo "Montants en euros écrits en dur dans les pages publiques, à confronter au barème ci-dessus :"
echo
grep -rnoE "[0-9]{2,4} ?€|€ ?[0-9]{2,4}" pages/organisateurs.tsx pages/index.tsx pages/developpeurs.tsx lib/i18n/locales/fr/organisateurs* 2>/dev/null | head -20 | sed 's/^/- /'
} > "$OUT"

[ "$OUT" != "/dev/stdout" ] && echo "✓ inventaire écrit dans $OUT"
exit 0
