// pages/developpeurs/reference.tsx
//
// Référence d'API générée automatiquement depuis la spec OpenAPI (`docs/openapi/`, filtrée
// à la surface publique). Rendu 100 % côté serveur (getStaticProps) — aucun
// renderer client (swagger-ui/redoc) : incompatible avec le CSP strict à nonce
// et fragile sous React 19. La spec ne bouge qu'au déploiement.

import Link from 'next/link';
import type { GetStaticProps } from 'next';
import type { SeoProps } from '@/components/Seo/DefaultSeo';
import { useT } from '@/lib/i18n/useT';
import { buildPublicSpec } from '@/utils/openapi/publicSpec';
import nsDeveloppeursReference from '@/lib/i18n/locales/fr/developpeursReference';

type Json = Record<string, any>;
type RefDict = typeof nsDeveloppeursReference.fr;

const METHODS = ['get', 'post', 'put', 'patch', 'delete'] as const;
type Method = (typeof METHODS)[number];

const METHOD_STYLE: Record<Method, string> = {
  get: 'bg-emerald-500/15 text-emerald-300',
  post: 'bg-amber-500/15 text-amber-300',
  put: 'bg-sky-500/15 text-sky-300',
  patch: 'bg-violet-500/15 text-violet-300',
  delete: 'bg-rose-500/15 text-rose-300',
};

type Operation = {
  method: Method;
  path: string;
  op: Json;
  params: Json[];
  anchor: string;
};

function slugify(s: string): string {
  return s
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function resolveRef(components: Json, ref: string): Json | undefined {
  const tail = ref.replace(/^#\/components\//, '');
  const slash = tail.indexOf('/');
  if (slash === -1) return undefined;
  const type = tail.slice(0, slash);
  const name = tail.slice(slash + 1);
  return components?.[type]?.[name];
}

function schemaNameFromRef(ref: string): string {
  return ref.split('/').pop() ?? ref;
}

// Short human type label for a schema; a $ref renders as a link to its section.
function TypeLabel({ schema }: { schema: Json | undefined }) {
  if (!schema) return <span className="text-gray-500">—</span>;

  // OpenAPI 3.1 : « nullable » s'écrit `type: [x, 'null']`, ou
  // `anyOf: [<schéma>, { type: 'null' }]` autour d'une référence.
  if (Array.isArray(schema.anyOf)) {
    const nonNull = schema.anyOf.filter((s: Json) => s?.type !== 'null');
    if (nonNull.length === 1 && nonNull.length < schema.anyOf.length) {
      return (
        <span className="text-gray-300">
          <TypeLabel schema={nonNull[0]} /> | null
        </span>
      );
    }
  }
  if (Array.isArray(schema.type) && schema.type.includes('null')) {
    const rest = schema.type.filter((t: string) => t !== 'null');
    return (
      <span className="text-gray-300">
        <TypeLabel
          schema={{
            ...schema,
            type: rest.length === 1 ? rest[0] : rest.join(' | '),
            enum: Array.isArray(schema.enum)
              ? schema.enum.filter((v: unknown) => v !== null)
              : schema.enum,
          }}
        />{' '}
        | null
      </span>
    );
  }

  if (typeof schema.$ref === 'string') {
    const name = schemaNameFromRef(schema.$ref);
    return (
      <a href={`#schema-${name}`} className="text-purple-300 hover:underline">
        {name}
      </a>
    );
  }
  // `oneOf` : alternatives de schémas (`A | B`) ou liste de constantes
  // documentées une à une (catalogue de codes).
  if (Array.isArray(schema.oneOf)) {
    const consts = schema.oneOf.every((s: Json) => s && 'const' in s);
    return (
      <span className="text-gray-300">
        {consts ? 'enum(' : ''}
        {schema.oneOf.map((s: Json, i: number) => (
          <span key={i}>
            {i > 0 ? ' | ' : ''}
            {consts ? (
              <code className="text-purple-200">{String(s.const)}</code>
            ) : (
              <TypeLabel schema={s} />
            )}
          </span>
        ))}
        {consts ? ')' : ''}
      </span>
    );
  }
  if (schema.type === 'array') {
    return (
      <span className="text-gray-300">
        array&lt;
        <TypeLabel schema={schema.items} />
        &gt;
      </span>
    );
  }
  if (Array.isArray(schema.enum)) {
    return (
      <span className="text-gray-300">
        enum(
        {schema.enum.map((v: unknown, i: number) => (
          <span key={i}>
            {i > 0 ? ' | ' : ''}
            <code className="text-purple-200">{String(v)}</code>
          </span>
        ))}
        )
      </span>
    );
  }
  const base = schema.type ?? (schema.properties ? 'object' : 'any');
  const suffix = schema.format ? ` <${schema.format}>` : '';
  return (
    <span className="text-gray-300">
      {base}
      {suffix}
    </span>
  );
}

// `code` en ligne : le seul balisage reconnu à l'intérieur d'un paragraphe.
// Rendu en nœuds React — aucun HTML de la spec n'est injecté tel quel.
function InlineText({ text }: { text: string }) {
  const parts = text.split('`');
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code
            key={i}
            className="rounded bg-white/10 px-1 py-0.5 text-[0.9em] text-purple-200"
          >
            {part}
          </code>
        ) : (
          <span key={i}>{part}</span>
        )
      )}
    </>
  );
}

type RichBlock =
  | { kind: 'heading'; text: string }
  | { kind: 'paragraph'; text: string }
  | { kind: 'list'; items: string[] };

/**
 * Découpe une description de la spec en blocs : titres `## `, listes `- `
 * (lignes indentées = suite de l'élément), paragraphes (lignes jointes). C'est
 * tout le Markdown que la spec s'autorise (cf. `x-public-description` dans
 * docs/openapi/root.yaml).
 */
function parseRichText(text: string): RichBlock[] {
  const blocks: RichBlock[] = [];
  let paragraph: string[] = [];
  let list: string[] | null = null;
  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
      paragraph = [];
    }
    if (list) {
      blocks.push({ kind: 'list', items: list });
      list = null;
    }
  };
  for (const raw of text.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      flush();
    } else if (line.startsWith('## ')) {
      flush();
      blocks.push({ kind: 'heading', text: line.slice(3).trim() });
    } else if (line.startsWith('- ')) {
      if (paragraph.length) {
        blocks.push({ kind: 'paragraph', text: paragraph.join(' ') });
        paragraph = [];
      }
      list = list ?? [];
      list.push(line.slice(2).trim());
    } else if (list && /^\s/.test(line)) {
      list[list.length - 1] += ` ${line.trim()}`;
    } else {
      if (list) {
        blocks.push({ kind: 'list', items: list });
        list = null;
      }
      paragraph.push(line.trim());
    }
  }
  flush();
  return blocks;
}

function RichText({
  text,
  headingPrefix,
}: {
  text: string | undefined;
  /** Préfixe d'ancre des titres ; sans lui, les titres ne sont pas ancrés. */
  headingPrefix?: string;
}) {
  if (!text) return null;
  return (
    <div className="space-y-2">
      {parseRichText(text).map((block, i) => {
        if (block.kind === 'heading') {
          return (
            <h3
              key={i}
              id={
                headingPrefix
                  ? `${headingPrefix}-${slugify(block.text)}`
                  : undefined
              }
              className="scroll-mt-24 pt-4 text-lg font-semibold text-white"
            >
              <InlineText text={block.text} />
            </h3>
          );
        }
        if (block.kind === 'list') {
          return (
            <ul key={i} className="list-disc space-y-1 pl-5">
              {block.items.map((item, j) => (
                <li key={j}>
                  <InlineText text={item} />
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={i}>
            <InlineText text={block.text} />
          </p>
        );
      })}
    </div>
  );
}

/** Exemples d'un « media type » : `example` seul ou `examples` nommés. */
function mediaExamples(
  media: Json | undefined
): Array<{ label?: string; value: unknown }> {
  if (!media) return [];
  const out: Array<{ label?: string; value: unknown }> = [];
  if (media.example !== undefined) out.push({ value: media.example });
  for (const [name, ex] of Object.entries<Json>(media.examples ?? {})) {
    out.push({ label: ex?.summary ?? name, value: ex?.value });
  }
  return out;
}

function ExampleBlocks({ media, t }: { media: Json | undefined; t: RefDict }) {
  const examples = mediaExamples(media);
  if (examples.length === 0) return null;
  return (
    <div className="mt-2 space-y-1">
      {examples.map((ex, i) => (
        <details key={i}>
          <summary className="cursor-pointer text-xs text-gray-400 hover:text-gray-200">
            {ex.label ? `${t.exampleLabel} — ${ex.label}` : t.exampleLabel}
          </summary>
          <pre className="mt-1 overflow-x-auto rounded-lg bg-black/40 p-3 font-mono text-xs text-gray-200">
            {typeof ex.value === 'string'
              ? ex.value
              : JSON.stringify(ex.value, null, 2)}
          </pre>
        </details>
      ))}
    </div>
  );
}

function PropertiesTable({ schema, t }: { schema: Json; t: RefDict }) {
  const props = schema.properties as Json | undefined;
  if (!props) return null;
  const required = new Set<string>(
    Array.isArray(schema.required) ? schema.required : []
  );
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-left text-sm">
        <thead>
          <tr className="border-b border-white/10 text-gray-400">
            <th scope="col" className="py-2 pr-4 font-semibold">
              {t.thProperty}
            </th>
            <th scope="col" className="py-2 pr-4 font-semibold">
              {t.thType}
            </th>
            <th scope="col" className="py-2 font-semibold">
              {t.thDesc}
            </th>
          </tr>
        </thead>
        <tbody>
          {Object.entries(props).map(([name, sub]) => (
            <tr key={name} className="border-b border-white/5 align-top">
              <td className="py-2 pr-4">
                <code className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200">
                  {name}
                </code>
                {required.has(name) && (
                  <span className="ml-1.5 text-[10px] uppercase tracking-wide text-amber-300/80">
                    {t.requiredYes}
                  </span>
                )}
              </td>
              <td className="py-2 pr-4 font-mono text-xs">
                <TypeLabel schema={sub as Json} />
              </td>
              <td className="py-2 text-gray-400">
                {(sub as Json)?.description ?? ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function jsonSchema(content: Json | undefined): Json | undefined {
  return content?.['application/json']?.schema;
}

function OperationCard({
  entry,
  components,
  t,
}: {
  entry: Operation;
  components: Json;
  t: RefDict;
}) {
  const { method, path, op, params, anchor } = entry;
  const security = Array.isArray(op.security) ? op.security : undefined;
  const requiresToken =
    security && security.some((r: Json) => r && Object.keys(r).length > 0);
  const bodySchema = jsonSchema(op.requestBody?.content);

  return (
    <article
      id={anchor}
      className="scroll-mt-24 space-y-4 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
    >
      <div className="flex flex-wrap items-center gap-2">
        <span
          className={`rounded-md px-2 py-1 text-xs font-bold uppercase tracking-wide ${METHOD_STYLE[method]}`}
        >
          {method}
        </span>
        <code className="break-all font-mono text-sm text-purple-200">
          {path}
        </code>
        <span
          className={`rounded-md border px-2 py-1 text-xs ${
            requiresToken
              ? 'border-amber-400/30 bg-amber-500/10 text-amber-200'
              : 'border-white/10 bg-white/[0.05] text-gray-400'
          }`}
        >
          {requiresToken ? t.authToken : t.authNone}
        </span>
        {op.deprecated === true && (
          <span className="rounded-md border border-rose-400/30 bg-rose-500/10 px-2 py-1 text-xs text-rose-200">
            {t.deprecatedBadge}
          </span>
        )}
      </div>

      {op.summary && <p className="text-sm text-gray-200">{op.summary}</p>}
      {op.description && (
        <div className="text-sm text-gray-400">
          <RichText text={op.description} />
        </div>
      )}

      {params.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
            {t.parametersLabel}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-gray-400">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    {t.thParam}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    {t.thIn}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    {t.thType}
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    {t.thDesc}
                  </th>
                </tr>
              </thead>
              <tbody>
                {params.map((p) => (
                  <tr
                    key={`${p.in}-${p.name}`}
                    className="border-b border-white/5 align-top"
                  >
                    <td className="py-2 pr-4">
                      <code className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200">
                        {p.name}
                      </code>
                      {p.required && (
                        <span className="ml-1.5 text-[10px] uppercase tracking-wide text-amber-300/80">
                          {t.requiredYes}
                        </span>
                      )}
                    </td>
                    <td className="py-2 pr-4 text-gray-400">
                      {p.in === 'path'
                        ? t.inPath
                        : p.in === 'header'
                          ? t.inHeader
                          : t.inQuery}
                    </td>
                    <td className="py-2 pr-4 font-mono text-xs">
                      <TypeLabel schema={p.schema} />
                    </td>
                    <td className="py-2 text-gray-400">
                      <RichText text={p.description} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {bodySchema && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
            {t.requestBodyLabel}
          </p>
          {bodySchema.properties ? (
            <PropertiesTable schema={bodySchema} t={t} />
          ) : (
            <p className="font-mono text-xs text-gray-300">
              <TypeLabel schema={bodySchema} />
            </p>
          )}
          <ExampleBlocks
            media={op.requestBody?.content?.['application/json']}
            t={t}
          />
        </div>
      )}

      {op.responses && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-[0.14em] text-gray-400">
            {t.responsesLabel}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-sm">
              <thead>
                <tr className="border-b border-white/10 text-gray-400">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    {t.thStatus}
                  </th>
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    {t.thSchema}
                  </th>
                  <th scope="col" className="py-2 font-semibold">
                    {t.thDesc}
                  </th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(op.responses).map(([code, raw]) => {
                  let resp = raw as Json;
                  if (typeof resp?.$ref === 'string')
                    resp = resolveRef(components, resp.$ref) ?? {};
                  const schema = jsonSchema(resp?.content);
                  return (
                    <tr
                      key={code}
                      className="border-b border-white/5 align-top"
                    >
                      <td className="py-2 pr-4 font-mono text-gray-200">
                        {code}
                      </td>
                      <td className="py-2 pr-4 font-mono text-xs">
                        {schema ? (
                          <TypeLabel schema={schema} />
                        ) : (
                          <span className="text-gray-500">—</span>
                        )}
                      </td>
                      <td className="py-2 text-gray-400">
                        <RichText text={resp?.description} />
                        {resp?.headers && (
                          <div className="mt-2">
                            <p className="text-xs font-semibold text-gray-400">
                              {t.headersLabel}
                            </p>
                            <ul className="mt-1 space-y-1">
                              {Object.entries<Json>(resp.headers).map(
                                ([name, rawHeader]) => {
                                  const header =
                                    typeof rawHeader?.$ref === 'string'
                                      ? (resolveRef(
                                          components,
                                          rawHeader.$ref
                                        ) ?? {})
                                      : rawHeader;
                                  return (
                                    <li key={name} className="text-xs">
                                      <code className="rounded bg-white/10 px-1 py-0.5 text-purple-200">
                                        {name}
                                      </code>
                                      <div className="mt-1 text-gray-400">
                                        <RichText text={header?.description} />
                                      </div>
                                    </li>
                                  );
                                }
                              )}
                            </ul>
                          </div>
                        )}
                        <ExampleBlocks
                          media={resp?.content?.['application/json']}
                          t={t}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </article>
  );
}

type PageProps = { spec: Json };

export const getStaticProps: GetStaticProps<PageProps> = async () => {
  // JSON round-trip strips any `undefined` (Next refuses to serialise those).
  const spec = JSON.parse(JSON.stringify(buildPublicSpec()));
  return { props: { spec } };
};

function ApiReferencePage({ spec }: PageProps) {
  const t = useT(nsDeveloppeursReference);
  const components: Json = spec.components ?? {};
  const paths: Json = spec.paths ?? {};
  const baseUrl = spec.servers?.[0]?.url ?? '';

  const operations: Operation[] = [];
  for (const [path, itemRaw] of Object.entries(paths)) {
    const item = itemRaw as Json;
    const pathParams = Array.isArray(item.parameters) ? item.parameters : [];
    for (const method of METHODS) {
      const op = item[method] as Json | undefined;
      if (!op) continue;
      const opParams = Array.isArray(op.parameters) ? op.parameters : [];
      const params = [...pathParams, ...opParams].map((p: Json) =>
        typeof p?.$ref === 'string' ? (resolveRef(components, p.$ref) ?? p) : p
      );
      operations.push({
        method,
        path,
        op,
        params,
        anchor: `op-${slugify(op.operationId || `${method}-${path}`)}`,
      });
    }
  }

  const schemas: [string, Json][] = Object.entries(components.schemas ?? {});
  const securitySchemes: [string, Json][] = Object.entries(
    components.securitySchemes ?? {}
  );

  return (
    <div className="min-h-screen bg-neutral-950 text-white">
      <div className="relative overflow-hidden">
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-purple-600/30 blur-3xl" />
          <div className="absolute right-10 top-10 h-[360px] w-[360px] rounded-full bg-pink-500/20 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-5xl px-6 pt-header-xl pb-10">
          <Link
            href="/organisateurs#developpeurs"
            className="text-sm text-gray-300 hover:text-white"
          >
            {t.backToGuide}
          </Link>
          <p className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/5 px-4 py-2 text-xs uppercase tracking-[0.18em] text-gray-200">
            {t.heroBadge} · v{spec.info?.version}
          </p>
          <h1 className="mt-3 text-4xl font-bold leading-tight sm:text-5xl">
            {t.heroTitle}
          </h1>
          <p className="mt-4 max-w-3xl text-lg text-gray-300">
            {t.heroSubtitle}
          </p>
          <div className="mt-6 flex flex-wrap items-center gap-3">
            {baseUrl && (
              <span className="rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm">
                <span className="text-gray-400">{t.baseUrlLabel} </span>
                <code className="font-mono text-purple-200">{baseUrl}</code>
              </span>
            )}
            {/* Raw link to the JSON API route (not a page) — opens the spec in a new tab. */}
            <a
              href="/api/public/openapi"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-2 rounded-lg bg-purple-500 px-4 py-2 text-sm font-semibold text-white transition hover:bg-purple-400"
            >
              {t.downloadLabel}
            </a>
          </div>
        </div>
      </div>

      <main className="mx-auto grid max-w-6xl gap-10 px-4 pb-24 sm:px-6 lg:grid-cols-[220px_1fr]">
        {/* TOC */}
        <nav aria-label={t.tocLabel} className="hidden lg:block">
          <div className="sticky top-24 space-y-1 text-sm">
            {spec.info?.description && (
              <a
                href="#guide-heading"
                className="block rounded-md px-2 py-1 text-gray-300 hover:bg-white/5 hover:text-white"
              >
                {t.guideLabel}
              </a>
            )}
            {securitySchemes.length > 0 && (
              <a
                href="#auth-heading"
                className="block rounded-md px-2 py-1 text-gray-300 hover:bg-white/5 hover:text-white"
              >
                {t.securityLabel}
              </a>
            )}
            {components.schemas?.PublicApiErrorCode && (
              <a
                href="#schema-PublicApiErrorCode"
                className="block rounded-md px-2 py-1 text-gray-300 hover:bg-white/5 hover:text-white"
              >
                {t.errorCodesLabel}
              </a>
            )}
            {operations.map((e) => (
              <a
                key={e.anchor}
                href={`#${e.anchor}`}
                className="flex items-center gap-2 rounded-md px-2 py-1 text-gray-400 hover:bg-white/5 hover:text-white"
              >
                <span
                  className={`rounded px-1 text-[10px] font-bold uppercase ${METHOD_STYLE[e.method]}`}
                >
                  {e.method}
                </span>
                <span className="truncate font-mono text-xs">
                  {e.path.replace('/api/public', '')}
                </span>
              </a>
            ))}
          </div>
        </nav>

        <div className="space-y-12">
          {spec.info?.description && (
            <section
              aria-labelledby="guide-heading"
              className="space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5 text-sm text-gray-300"
            >
              <h2 id="guide-heading" className="text-2xl font-bold text-white">
                {t.guideLabel}
              </h2>
              <RichText text={spec.info.description} headingPrefix="guide" />
            </section>
          )}

          {securitySchemes.length > 0 && (
            <section aria-labelledby="auth-heading" className="space-y-5">
              <h2 id="auth-heading" className="text-2xl font-bold">
                {t.securityLabel}
              </h2>
              {securitySchemes.map(([name, scheme]) => (
                <article
                  key={name}
                  id={`security-${name}`}
                  className="scroll-mt-24 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                >
                  <h3 className="font-mono text-base font-semibold text-purple-200">
                    {name}
                  </h3>
                  <div className="text-sm text-gray-400">
                    <RichText text={scheme.description} />
                  </div>
                </article>
              ))}
            </section>
          )}

          <section aria-labelledby="endpoints-heading" className="space-y-5">
            <h2 id="endpoints-heading" className="text-2xl font-bold">
              {t.endpointsLabel}
            </h2>
            {operations.map((e) => (
              <OperationCard
                key={e.anchor}
                entry={e}
                components={components}
                t={t}
              />
            ))}
          </section>

          {schemas.length > 0 && (
            <section aria-labelledby="schemas-heading" className="space-y-5">
              <h2 id="schemas-heading" className="text-2xl font-bold">
                {t.schemasLabel}
              </h2>
              {schemas.map(([name, schema]) => (
                <article
                  key={name}
                  id={`schema-${name}`}
                  className="scroll-mt-24 space-y-3 rounded-2xl border border-white/10 bg-white/[0.03] p-5"
                >
                  <h3 className="font-mono text-base font-semibold text-purple-200">
                    {name}
                  </h3>
                  {schema.description && (
                    <div className="text-sm text-gray-400">
                      <RichText text={schema.description} />
                    </div>
                  )}
                  {schema.properties ? (
                    <PropertiesTable schema={schema} t={t} />
                  ) : Array.isArray(schema.oneOf) &&
                    schema.oneOf.every((v: Json) => v && 'const' in v) ? (
                    <div className="overflow-x-auto">
                      <table className="w-full border-collapse text-left text-sm">
                        <thead>
                          <tr className="border-b border-white/10 text-gray-400">
                            <th scope="col" className="py-2 pr-4 font-semibold">
                              {t.thValue}
                            </th>
                            <th scope="col" className="py-2 font-semibold">
                              {t.thDesc}
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {schema.oneOf.map((v: Json) => (
                            <tr
                              key={String(v.const)}
                              className="border-b border-white/5 align-top"
                            >
                              <td className="py-2 pr-4">
                                <code className="rounded bg-white/10 px-1.5 py-0.5 text-purple-200">
                                  {String(v.const)}
                                </code>
                              </td>
                              <td className="py-2 text-gray-400">
                                <RichText text={v.description} />
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <p className="font-mono text-xs text-gray-300">
                      <TypeLabel schema={schema} />
                    </p>
                  )}
                </article>
              ))}
            </section>
          )}

          <p className="text-xs text-gray-500">{t.generatedNote}</p>
        </div>
      </main>
    </div>
  );
}

const referenceSeo: SeoProps = {
  title: {
    fr: 'Référence API publique',
    en: 'Public API reference',
  },
  description: {
    fr: "Référence complète de l'API publique de l'OW Women's Cup, générée depuis la spec OpenAPI : endpoints, paramètres, corps de requête, réponses et schémas.",
    en: "Full reference for the OW Women's Cup public API, generated from the OpenAPI spec: endpoints, parameters, request bodies, responses and schemas.",
  },
};

ApiReferencePage.seo = referenceSeo;

export default ApiReferencePage;
