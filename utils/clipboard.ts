// utils/clipboard.ts
//
// Copier un texte dans le presse-papiers — y compris là où l'API moderne
// n'existe pas.
//
// POURQUOI UN MODULE. `navigator.clipboard` n'est disponible qu'en contexte
// SÉCURISÉ (https, localhost). Une régie ouverte en `http://192.168.x.x` sur le
// réseau local, ou un dock de navigateur OBS mal configuré, n'y a pas accès :
// les écrans de la diffusion échouaient alors à chaque copie d'URL d'overlay —
// le geste qu'on y fait le plus. Le bouton de copie de l'espace joueuse avait
// déjà le repli (`execCommand('copy')` sur une zone de texte hors écran) ; il
// vit désormais ici, pour tous.
//
// Rend `true` si la copie a réussi, `false` sinon — jamais d'exception : à
// l'appelant de dire l'échec (message, lien révélé…).

export async function copyText(value: string): Promise<boolean> {
  if (!value) return false;
  try {
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(value);
      return true;
    }
  } catch {
    // Refusé (permission, document non focalisé) : on tente le repli.
  }
  if (typeof document === 'undefined') return false;
  try {
    const textarea = document.createElement('textarea');
    textarea.value = value;
    textarea.setAttribute('readonly', '');
    textarea.style.position = 'absolute';
    textarea.style.left = '-9999px';
    document.body.appendChild(textarea);
    textarea.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
