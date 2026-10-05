// hooks/usePublicFormGuard.ts
//
// Anti-spam des formulaires publics SANS COMPTE : honeypot + captcha HMAC
// maison (/api/captcha). Chaque formulaire recopiait les mêmes trois états et
// les deux mêmes `fetch` — inscription joueuse libre, renvoi de lien… Un seul
// endroit désormais, avec les deux règles qui comptaient :
//
//   - captcha récupéré PARESSEUSEMENT, à la première interaction (`ensure`,
//     branché sur `onFocus`) : afficher la page ne déclenche aucune requête ;
//   - captcha à USAGE UNIQUE : après un refus serveur, `refresh` en redemande
//     un, sans quoi la nouvelle tentative échouerait à coup sûr.
//
// `payload` est ce que les routes attendent, tel quel :
// `{ honeypot, captchaToken, captchaAnswer }`.

import { useCallback, useRef, useState } from 'react';

type Captcha = { token: string; question: string };

const CAPTCHA_URL = '/api/captcha';

export function usePublicFormGuard() {
  const [honeypot, setHoneypot] = useState('');
  const [captcha, setCaptcha] = useState<Captcha | null>(null);
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const fetchedRef = useRef(false);

  const refresh = useCallback(async () => {
    try {
      const res = await fetch(CAPTCHA_URL);
      const data = await res.json();
      if (res.ok) {
        setCaptcha({ token: data.token, question: data.question });
        setCaptchaAnswer('');
        return;
      }
    } catch {
      /* signalé à la soumission si toujours absent */
    }
    // Échec : la prochaine interaction retentera.
    fetchedRef.current = false;
  }, []);

  const ensure = useCallback(() => {
    if (fetchedRef.current) return;
    fetchedRef.current = true;
    void refresh();
  }, [refresh]);

  return {
    honeypot,
    setHoneypot,
    /** Question à afficher, `null` tant que le captcha n'est pas chargé. */
    question: captcha?.question ?? null,
    captchaAnswer,
    setCaptchaAnswer,
    ensure,
    refresh,
    payload: {
      honeypot,
      captchaToken: captcha?.token,
      captchaAnswer,
    },
  };
}
