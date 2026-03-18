import { Html, Head, Main, NextScript } from 'next/document';
import type { DocumentContext, DocumentInitialProps } from 'next/document';
import Document from 'next/document';

interface MyDocumentProps extends DocumentInitialProps {
  nonce: string;
}

export default class MyDocument extends Document<MyDocumentProps> {
  static async getInitialProps(ctx: DocumentContext): Promise<MyDocumentProps> {
    const initialProps = await Document.getInitialProps(ctx);
    const nonce = (ctx.req?.headers as Record<string, string | undefined>)?.['x-nonce'] ?? '';
    return { ...initialProps, nonce };
  }

  render() {
    const { nonce } = this.props;
    return (
      <Html lang="fr">
        <Head nonce={nonce}>
          {/* Character encoding */}
          <meta charSet="utf-8" />

          {/* Preconnect to external domains for performance */}
          <link rel="preconnect" href="https://fonts.googleapis.com" />
          <link
            rel="preconnect"
            href="https://fonts.gstatic.com"
            crossOrigin="anonymous"
          />

          {/* RSS Feed discovery */}
          <link
            rel="alternate"
            type="application/rss+xml"
            title="Actualités OW Women's Cup"
            href="/api/news/rss"
          />

          {/* Apple touch icon and web app meta */}
          <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
          <link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
          <link rel="manifest" href="/site.webmanifest" />

          {/* Additional SEO meta tags */}
          <meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1" />
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
          <NextScript nonce={nonce} />
        </body>
      </Html>
    );
  }
}
