#!/usr/bin/env bash
# scripts/e2e-supabase-start.sh — démarrage robuste de la Supabase jetable des e2e (CI).
#
# POURQUOI. Huit tranches (parfois sur deux branches) tirent en même temps les
# images Supabase depuis public.ecr.aws, qui bride les accès anonymes
# (« toomanyrequests: Rate exceeded »). Un `supabase start` interrompu en plein
# démarrage laisse des conteneurs qui tiennent encore leurs ports : l'essai
# suivant échoue alors sur « address already in use » (54322) et la tranche
# meurt au bout d'une minute sans avoir joué un seul test.
#
# CE QUE FAIT LE SCRIPT.
# - décale le premier essai selon la tranche (SHARD_INDEX) pour étaler les
#   téléchargements ;
# - jusqu'à 4 essais ; entre deux, arrêt complet + suppression des conteneurs
#   `supabase_*` (libère les ports), puis attente croissante avec gigue.
#
# Écrit la sortie dans $1 (journal) et le code de retour dans $2.
set -u

LOG="$1"
EXIT_FILE="$2"
EXCLUDE="studio,postgres-meta,imgproxy,edge-runtime,logflare,vector,supavisor"
MAX_ATTEMPTS=4

sleep $(( (${SHARD_INDEX:-1} - 1) * 4 ))

status=1
for attempt in $(seq 1 "$MAX_ATTEMPTS"); do
  echo "=== supabase start — essai $attempt/$MAX_ATTEMPTS" >> "$LOG"
  if supabase start -x "$EXCLUDE" >> "$LOG" 2>&1; then
    status=0
    break
  fi
  status=$?
  echo "=== échec (code $status) — nettoyage avant nouvel essai" >> "$LOG"
  supabase stop --no-backup >> "$LOG" 2>&1 || true
  ids=$(docker ps -aq --filter "name=supabase_" 2>/dev/null || true)
  if [ -n "$ids" ]; then
    # shellcheck disable=SC2086
    docker rm -f $ids >> "$LOG" 2>&1 || true
  fi
  if [ "$attempt" -lt "$MAX_ATTEMPTS" ]; then
    sleep $(( attempt * 15 + RANDOM % 10 ))
  fi
done

echo "$status" > "$EXIT_FILE"
exit "$status"
