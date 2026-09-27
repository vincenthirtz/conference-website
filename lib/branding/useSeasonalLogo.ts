// lib/branding/useSeasonalLogo.ts
//
// Le logo d'événement du jour (cf. utils/seasonalLogo.ts), côté client.
//
// POURQUOI CÔTÉ CLIENT. Les pages publiques sont statiques ou ISR : un logo
// résolu au rendu serveur serait figé jusqu'à la prochaine régénération, et le
// logo d'Octobre rose resterait en ligne en novembre sur toutes les pages que
// personne n'a revisitées. Seul le navigateur connaît la bonne date.
//
// UNE REQUÊTE PAR CHARGEMENT. La navbar, la barre joueuse et l'overlay
// partagent la même promesse de module ; une navigation client ne refait rien.
//
// LE CLIGNOTEMENT. Le HTML arrive avec le logo par défaut (le serveur ne sait
// rien), puis bascule. Pour que cette bascule n'ait lieu qu'à la PREMIÈRE
// visite, la dernière réponse est gardée en localStorage et appliquée dès le
// montage — dans un effet, jamais au premier rendu, sinon l'hydratation
// divergerait du HTML serveur.

import { useEffect, useState } from 'react';

export type SeasonalLogoView = { url: string; name: string };

const STORAGE_KEY = 'seasonal-logo';

let pending: Promise<SeasonalLogoView | null> | null = null;

function readCache(): SeasonalLogoView | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<SeasonalLogoView> | null;
    return v && typeof v.url === 'string' && typeof v.name === 'string'
      ? { url: v.url, name: v.name }
      : null;
  } catch {
    return null;
  }
}

function writeCache(v: SeasonalLogoView | null) {
  try {
    if (v) window.localStorage.setItem(STORAGE_KEY, JSON.stringify(v));
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // Navigation privée, stockage plein : le cache n'est qu'un confort.
  }
}

function fetchSeasonalLogo(): Promise<SeasonalLogoView | null> {
  if (!pending) {
    pending = fetch('/api/seasonal-logo')
      .then((r) => (r.ok ? r.json() : null))
      .then((json: { logo?: SeasonalLogoView | null } | null) => {
        const logo = json?.logo ?? null;
        writeCache(logo);
        return logo;
      })
      // Réseau en panne : on garde ce que le cache disait, sans le réécrire.
      .catch(() => readCache());
  }
  return pending;
}

/**
 * Le logo d'événement actif, ou `null` (→ logo par défaut).
 *
 * `enabled: false` pour un espace en marque blanche : il a son propre logo, et
 * les événements de la Cup ne le concernent pas.
 */
export function useSeasonalLogo(enabled = true): SeasonalLogoView | null {
  const [logo, setLogo] = useState<SeasonalLogoView | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let alive = true;
    setLogo(readCache());
    void fetchSeasonalLogo().then((v) => {
      if (alive) setLogo(v);
    });
    return () => {
      alive = false;
    };
  }, [enabled]);

  return enabled ? logo : null;
}
