#!/usr/bin/env bash
# collect.sh <url> <dossier-sortie>
#
# Collecte PASSIVE et publique d'un site concurrent : ce qu'un navigateur
# anonyme reçoit, rien de plus. Pas de connexion, pas d'appel au backend du
# concurrent, pas de formulaire soumis.
#
# Produit dans <dossier-sortie> :
#   headers.txt        en-têtes HTTP de la page d'accueil
#   index.html         HTML brut (utile pour détecter SPA / SSR)
#   robots.txt         tel quel
#   sitemap-urls.txt   URLs du sitemap (index de sitemaps suivi sur 1 niveau)
#   assets.txt         scripts et feuilles de style référencés par l'accueil
#   assets/            scripts JS téléchargés (bundle), pour probe-bundle.mjs
#   stack.txt          signaux techniques (hébergeur, framework, analytics…)
set -uo pipefail

URL="${1:?usage: collect.sh <url> <dossier-sortie>}"
OUT="${2:?usage: collect.sh <url> <dossier-sortie>}"
UA='Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128 Safari/537.36'
BASE="$(printf '%s' "$URL" | sed -E 's#^(https?://[^/]+).*#\1#')"
mkdir -p "$OUT/assets"

fetch() { curl -sL --max-time 30 -A "$UA" "$@"; }

echo "→ accueil"
fetch -D "$OUT/headers-all.txt" "$URL" -o "$OUT/index.html"
# Avec des redirections, -D empile les en-têtes de chaque saut : garder le dernier.
python3 - "$OUT/headers-all.txt" "$OUT/headers.txt" <<'PY'
import re, sys
raw = open(sys.argv[1], encoding="utf-8", errors="ignore").read()
blocks = [b for b in re.split(r"\r?\n\r?\n", raw) if b.strip().startswith("HTTP/")]
open(sys.argv[2], "w").write((blocks[-1] if blocks else raw).strip() + "\n")
PY

echo "→ robots.txt / sitemap"
fetch "$BASE/robots.txt" -o "$OUT/robots.txt"
if grep -qi '<html' "$OUT/robots.txt"; then
  echo "(robots.txt absent : le site renvoie une page HTML)" > "$OUT/robots.txt"
elif [ ! -s "$OUT/robots.txt" ]; then
  echo "(robots.txt vide : aucune règle, aucun sitemap déclaré)" > "$OUT/robots.txt"
fi
SITEMAPS=$(grep -i '^sitemap:' "$OUT/robots.txt" 2>/dev/null | awk '{print $2}' | tr -d '\r')
[ -z "$SITEMAPS" ] && SITEMAPS="$BASE/sitemap.xml"
: > "$OUT/sitemap-urls.txt"
for sm in $SITEMAPS; do
  body=$(fetch "$sm")
  if printf '%s' "$body" | grep -q '<sitemapindex'; then
    for child in $(printf '%s' "$body" | grep -o '<loc>[^<]*' | sed 's/<loc>//'); do
      fetch "$child" | grep -o '<loc>[^<]*' | sed 's/<loc>//' >> "$OUT/sitemap-urls.txt"
    done
  else
    printf '%s' "$body" | grep -q '<urlset' \
      && printf '%s' "$body" | grep -o '<loc>[^<]*' | sed 's/<loc>//' >> "$OUT/sitemap-urls.txt"
  fi
done
sort -u -o "$OUT/sitemap-urls.txt" "$OUT/sitemap-urls.txt"

echo "→ ressources de l'accueil"
grep -oE '(src|href)="[^"]+\.(js|mjs|css)[^"]*"' "$OUT/index.html" \
  | sed -E 's/^(src|href)="//; s/"$//' | sort -u > "$OUT/assets.txt"
while read -r a; do
  case "$a" in
    http*) u="$a" ;;
    //*) u="https:$a" ;;
    /*) u="$BASE$a" ;;
    *) u="$BASE/$a" ;;
  esac
  case "$u" in
    *.js*|*.mjs*)
      host=$(printf '%s' "$u" | sed -E 's#^https?://([^/]+).*#\1#')
      basehost=$(printf '%s' "$BASE" | sed -E 's#^https?://##')
      # Seuls les scripts du site lui-même (pas les tiers : GTM, CDN…)
      if [ "$host" = "$basehost" ] || [ "$host" = "www.$basehost" ]; then
        fetch "$u" -o "$OUT/assets/$(basename "${u%%\?*}")"
      fi
      ;;
  esac
done < "$OUT/assets.txt"

echo "→ signaux techniques"
{
  echo "# En-têtes notables"
  grep -iE '^(server|x-powered-by|x-vercel|x-nf-|x-amz|cf-ray|via|x-hcdn|x-cache|content-security-policy|strict-transport|set-cookie):' "$OUT/headers.txt" | sed -E 's/(set-cookie: [^=]+)=.*/\1=…/I'
  echo
  echo "# HTML initial"
  printf 'taille=%s octets\n' "$(wc -c < "$OUT/index.html" | tr -d ' ')"
  printf 'texte visible sans JS (approx.)=%s caractères\n' "$(python3 -c 'import re,sys; h=open(sys.argv[1],encoding="utf-8",errors="ignore").read(); h=re.sub(r"(?is)<(script|style|noscript)[^>]*>.*?</\1>","",h); t=re.sub(r"(?s)<[^>]+>"," ",h); print(len(" ".join(t.split())))' "$OUT/index.html")"
  grep -qiE '<div id="(root|app|__next)"></div>' "$OUT/index.html" && echo "coquille SPA vide (contenu rendu côté client → SEO faible)"
  grep -q '__NEXT_DATA__\|/_next/' "$OUT/index.html" && echo "framework: Next.js"
  grep -q 'data-server-rendered\|__NUXT__' "$OUT/index.html" && echo "framework: Nuxt/Vue SSR"
  grep -qi 'vite' "$OUT/index.html" && echo "build: Vite"
  grep -qi 'wp-content' "$OUT/index.html" && echo "CMS: WordPress"
  grep -qi 'horizons' "$OUT/index.html" "$OUT/headers.txt" && echo "générateur: Hostinger Horizons (site généré par IA)"
  grep -qi 'webflow' "$OUT/index.html" && echo "CMS: Webflow"
  grep -qi 'framer' "$OUT/index.html" && echo "CMS: Framer"
  echo
  echo "# Mesure d'audience / traceurs dans le HTML initial (avant tout consentement)"
  grep -oiE 'googletagmanager\.com|GTM-[A-Z0-9]{5,}|\bG-[A-Z0-9]{6,}|gtag\(|google-analytics|plausible|umami|matomo|hotjar|clarity\.ms|connect\.facebook\.net|analytics\.tiktok' "$OUT/index.html" | sort -u
  grep -qiE 'tarteaucitron|axeptio|didomi|cookiebot|onetrust|klaro|cookieconsent' "$OUT/index.html" \
    && echo "(outil de consentement détecté dans le HTML)" \
    || echo "(aucun outil de consentement détecté dans le HTML initial : à vérifier au rendu)"
  echo
  echo "# Métadonnées SEO"
  grep -oE '<title>[^<]*|<meta (name|property)="(description|og:[a-z]+)"[^>]*>' "$OUT/index.html"
  printf 'urls dans le sitemap=%s\n' "$(wc -l < "$OUT/sitemap-urls.txt" | tr -d ' ')"
} > "$OUT/stack.txt"

echo "✓ collecte terminée dans $OUT"
echo "  $(wc -l < "$OUT/sitemap-urls.txt" | tr -d ' ') URLs de sitemap, $(ls "$OUT/assets" | wc -l | tr -d ' ') script(s) téléchargé(s)"
