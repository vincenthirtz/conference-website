import { Html, Head, Main, NextScript } from 'next/document';
import type { DocumentContext, DocumentInitialProps } from 'next/document';
import Document from 'next/document';
import type { AppType } from 'next/app';
import type { ComponentProps, ComponentType } from 'react';
import { resolveTenantIdByHost, readTenantBranding } from '@/utils/tenant';
import type { TenantBranding } from '@/utils/tenant';
import { TENANT_BRANDING_ISLAND_ID } from '@/lib/branding/TenantBrandingProvider';

interface MyDocumentProps extends DocumentInitialProps {
  nonce: string;
  /**
   * Branding WHITELABEL résolu au SSR depuis le host de la requête. `null` pour
   * le tenant par défaut (aucune injection → rendu byte-identique).
   */
  branding: TenantBranding | null;
}

/**
 * Sérialise le branding pour l'île JSON en neutralisant `</script>` (seule
 * séquence pouvant casser un `<script>`). Les couleurs sont déjà sanitizées en
 * hex strict et le logo en chemin/https côté `readTenantBranding`.
 */
function serializeBranding(branding: TenantBranding): string {
  return JSON.stringify(branding).replace(/</g, '\\u003c');
}

/** Construit la déclaration `:root` d'override, uniquement pour les vars posées. */
function brandCssVars(branding: TenantBranding): string {
  const decls: string[] = [];
  if (branding.primaryColor) {
    decls.push(`--brand-primary:${branding.primaryColor};`);
  }
  if (branding.accentColor) {
    decls.push(`--brand-accent:${branding.accentColor};`);
  }
  // `:root:root` : spécificité (0,0,2) > le `:root` (0,0,1) de globals.css, donc
  // l'override gagne quel que soit l'ordre d'injection des feuilles de style.
  return decls.length ? `:root:root{${decls.join('')}}` : '';
}

export default class MyDocument extends Document<MyDocumentProps> {
  static async getInitialProps(ctx: DocumentContext): Promise<MyDocumentProps> {
    // Résolution du branding AVANT le rendu du HTML de l'app : on lit le host
    // (comme pages/sitemap.xml.ts) puis on résout le tenant custom-domain. En
    // build statique (`ctx.req` absent) → pas de branding → défaut.
    let branding: TenantBranding | null = null;
    const headers = ctx.req?.headers as
      | Record<string, string | string[] | undefined>
      | undefined;
    if (headers) {
      const rawHost = headers['x-forwarded-host'] ?? headers['host'];
      const host = Array.isArray(rawHost) ? rawHost[0] : rawHost;
      const tenantId = await resolveTenantIdByHost(host);
      if (tenantId) {
        branding = await readTenantBranding(tenantId);
      }
    }

    // `enhanceApp` : injecte `branding` comme prop de <App> côté SERVEUR pour que
    // le premier rendu (Navbar/Footer/SEO) reflète déjà le branding. Le provider
    // relira la même valeur via l'île JSON à l'hydratation → aucun mismatch.
    const originalRenderPage = ctx.renderPage;
    ctx.renderPage = () =>
      originalRenderPage({
        enhanceApp: (App: AppType) => {
          // Cast borné (pas de `any`) : `_app` accepte une prop supplémentaire
          // `branding` que le type public d'AppType n'expose pas.
          const AppWithBranding = App as ComponentType<
            ComponentProps<AppType> & { branding: TenantBranding | null }
          >;
          return function EnhancedApp(props: ComponentProps<AppType>) {
            return <AppWithBranding {...props} branding={branding} />;
          };
        },
      });

    const initialProps = await Document.getInitialProps(ctx);
    const nonce =
      (ctx.req?.headers as Record<string, string | undefined>)?.['x-nonce'] ??
      '';
    return { ...initialProps, nonce, branding };
  }

  render() {
    const { nonce, branding } = this.props;
    const cssVars = branding ? brandCssVars(branding) : '';
    return (
      <Html lang="fr">
        <Head nonce={nonce}>
          {/* Character encoding */}
          <meta charSet="utf-8" />

          {/* WHITELABEL — override des tokens de marque (couleurs) résolu au
              SSR depuis le custom_domain. Émis uniquement si un branding existe :
              sur le tenant par défaut, rien n'est injecté (rendu inchangé). */}
          {cssVars && (
            <style
              nonce={nonce}
              dangerouslySetInnerHTML={{ __html: cssVars }}
            />
          )}

          {/* Preconnect to embed origins used on the homepage so the TCP/TLS
              handshake is paid in parallel with the HTML, not after JS hydration. */}
          <link
            rel="preconnect"
            href="https://player.twitch.tv"
            crossOrigin=""
          />
          <link
            rel="preconnect"
            href="https://www.youtube.com"
            crossOrigin=""
          />
          <link rel="dns-prefetch" href="https://static-cdn.jtvnw.net" />
          <link rel="dns-prefetch" href="https://i.ytimg.com" />

          {/* RSS Feed discovery */}
          <link
            rel="alternate"
            type="application/rss+xml"
            title="Actualités OW Women's Cup"
            href="/api/news/rss"
          />

          {/* Sitemap discovery */}
          <link
            rel="sitemap"
            type="application/xml"
            title="Sitemap"
            href="/sitemap.xml"
          />

          {/* Apple touch icon and web app meta */}
          <link
            rel="apple-touch-icon"
            sizes="180x180"
            href="/apple-touch-icon.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="32x32"
            href="/favicon-32x32.png"
          />
          <link
            rel="icon"
            type="image/png"
            sizes="16x16"
            href="/favicon-16x16.png"
          />
          {/* Manifest link managed in _app.tsx via next/head with key dedup
              to avoid duplicate <link rel="manifest"> on scoped routes. */}

          {/* Additional SEO meta tags */}
          <meta
            name="robots"
            content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1"
          />
          <meta name="googlebot" content="index, follow" />
          <meta name="author" content="OW Women's Cup" />
          <meta name="publisher" content="OW Women's Cup" />

          {/* Geo targeting for France */}
          <meta name="geo.region" content="FR" />
          <meta name="geo.placename" content="France" />
          <meta name="language" content="French" />
          <meta httpEquiv="content-language" content="fr-FR" />
        </Head>
        <body>
          <Main />
          {/* WHITELABEL — île JSON lue par TenantBrandingProvider à
              l'hydratation. Non exécutable (type application/json), donc hors
              périmètre script-src ; on porte tout de même le nonce. */}
          {branding && (
            <script
              id={TENANT_BRANDING_ISLAND_ID}
              type="application/json"
              nonce={nonce}
              dangerouslySetInnerHTML={{ __html: serializeBranding(branding) }}
            />
          )}
          <NextScript nonce={nonce} />
        </body>
      </Html>
    );
  }
}
