// scripts/openapi/infer-responses.cjs
//
// Déduit du CODE les schémas des réponses de succès (2xx) de pages/api/**, et
// les écrit dans docs/openapi/inferred-responses.json. L'assembleur
// (utils/openapi/assemble.ts) les utilise là où la spec écrite n'a qu'un
// schéma générique (`type: object` sans propriétés) ou pas de schéma du tout.
//
// Principe : l'API du compilateur TypeScript (paquet @typescript/typescript6,
// déjà présent pour tsc 6 — aucune dépendance ajoutée) donne le TYPE de
// l'argument de chaque `res.json(…)` / `res.status(2xx).json(…)`. Ce type est
// converti en JSON Schema. Rien n'est écrit à la main : la doc suit le code.
//
// Attribution à une méthode HTTP (un handler peut en servir plusieurs) :
//   - `if (req.method === 'X') { … }`, `case 'X':` sur req.method ;
//   - drapeaux `const isList = req.method === 'GET'` puis `if (isList)` ;
//   - fonctions nommées : attribuées depuis leurs sites d'appel ;
//   - code qui suit `if (req.method === 'X') { … return }` : les autres
//     méthodes déclarées ;
//   - handler à méthode unique : cette méthode.
// Une réponse qu'aucune règle n'attribue n'est PAS documentée (jamais de
// supposition) ; elle apparaît dans `unattributed`.
//
// Types `any`/`unknown` → `{}` (valeur libre) : la spec n'invente pas.
//
//   npm run openapi:responses          # régénère
//   npm run openapi:responses -- --check  # échoue si le fichier est périmé

const ts = require('@typescript/typescript6');
const fs = require('node:fs');
const path = require('node:path');

const OUTPUT = path.join('docs', 'openapi', 'inferred-responses.json');
const METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];
/** Surfaces dont les réponses sont déjà décrites par zod (x-zod) : exclues. */
const EXCLUDED = [/^api\/public\/v1\//];
const MAX_DEPTH = 8;

function listHandlers(root) {
  const base = path.join(root, 'pages');
  const out = [];
  (function walk(dir) {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith('.ts') && !e.name.endsWith('.d.ts')) out.push(p);
    }
  })(path.join(base, 'api'));
  return out.filter((f) => {
    const rel = path.relative(base, f).replace(/\\/g, '/');
    return !EXCLUDED.some((re) => re.test(rel));
  });
}

function apiPathOf(root, file) {
  let p = path.relative(path.join(root, 'pages'), file).replace(/\\/g, '/');
  p = p.replace(/\.ts$/, '').replace(/\/index$/, '');
  p = p.replace(/\[\.\.\.(.+?)\]/g, '{$1}').replace(/\[(.+?)\]/g, '{$1}');
  return `/${p}`;
}

function createChecker(root, files) {
  const cfgPath = path.join(root, 'tsconfig.json');
  const cfg = ts.getParsedCommandLineOfConfigFile(
    cfgPath,
    {},
    { ...ts.sys, onUnRecoverableConfigFileDiagnostic: () => {} }
  );
  const program = ts.createProgram(files, { ...cfg.options, noEmit: true });
  return { program, checker: program.getTypeChecker() };
}

/* ------------------------------------------------------------------------ *
 * Attribution des réponses aux méthodes HTTP
 * ------------------------------------------------------------------------ */

function declaredMethods(sf) {
  const txt = sf.getFullText();
  const ms = new Set();
  const opt = /methods:\s*\[([^\]]*)\]/.exec(txt);
  if (opt) for (const x of opt[1].matchAll(/'([A-Z]+)'/g)) ms.add(x[1]);
  for (const x of txt.matchAll(
    /\.method\s*[!=]==?\s*'([A-Z]+)'|case\s+'([A-Z]+)'\s*:/g
  )) {
    ms.add(x[1] || x[2]);
  }
  return [...ms].filter((m) => METHODS.includes(m));
}

/** Méthodes testées POSITIVEMENT par une condition (résout les drapeaux). */
function methodsOfCondition(expr, checker) {
  const out = new Set();
  const text = expr.getText();
  if (/!==?|!\s*[A-Za-z(]/.test(text)) return out; // négation : pas d'attribution
  (function visit(n) {
    if (
      ts.isBinaryExpression(n) &&
      [
        ts.SyntaxKind.EqualsEqualsEqualsToken,
        ts.SyntaxKind.EqualsEqualsToken,
      ].includes(n.operatorToken.kind) &&
      /\.method\b/.test(n.getText())
    ) {
      const m = /'([A-Z]+)'/.exec(n.getText());
      if (m) out.add(m[1]);
    } else if (ts.isIdentifier(n)) {
      const sym = checker.getSymbolAtLocation(n);
      const decl = sym?.valueDeclaration;
      if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
        const init = decl.initializer.getText();
        if (/\.method\b/.test(init) && !/!==?/.test(init)) {
          for (const m of init.matchAll(/'([A-Z]+)'/g)) out.add(m[1]);
        }
      }
    }
    ts.forEachChild(n, visit);
  })(expr);
  return out;
}

function returnsEarly(stmt) {
  let found = false;
  (function visit(n) {
    if (ts.isReturnStatement(n)) found = true;
    if (!found && !ts.isFunctionLike(n)) ts.forEachChild(n, visit);
  })(stmt);
  return found;
}

function attributeMethods(node, sf, checker, declared, depth = 0) {
  let n = node;
  while (n && n !== sf) {
    const p = n.parent;
    if (p && ts.isIfStatement(p) && p.thenStatement === n) {
      const ms = methodsOfCondition(p.expression, checker);
      if (ms.size) return ms;
    }
    if (p && ts.isCaseClause(p)) {
      const sw = p.parent.parent;
      let switched = sw.expression.getText();
      // `const method = req.method; switch (method)` : suivre la variable.
      if (ts.isIdentifier(sw.expression)) {
        const decl = checker.getSymbolAtLocation(
          sw.expression
        )?.valueDeclaration;
        if (decl && ts.isVariableDeclaration(decl) && decl.initializer) {
          switched = decl.initializer.getText();
        }
      }
      if (/\.method\b/.test(switched)) {
        const m = /'([A-Z]+)'/.exec(p.expression.getText());
        if (m) return new Set([m[1]]);
      }
    }
    // Code qui SUIT un `if (method === X) { … return }` dans le même bloc.
    if (p && ts.isBlock(p)) {
      const idx = p.statements.indexOf(n);
      const excluded = new Set();
      let guarded = false;
      for (const prev of p.statements.slice(0, Math.max(idx, 0))) {
        if (ts.isIfStatement(prev) && returnsEarly(prev.thenStatement)) {
          for (const m of methodsOfCondition(prev.expression, checker))
            excluded.add(m);
          // Garde négative `if (method !== 'GET' && method !== 'POST') return`
          // qui écarte tout le reste : la suite vaut pour les méthodes gardées.
          const cond = prev.expression.getText();
          if (/\bmethod\s*!==?/.test(cond)) {
            const kept = [
              ...cond.matchAll(/\bmethod\s*!==?\s*'([A-Z]+)'/g),
            ].map((m) => m[1]);
            if (kept.length && kept.every((m) => declared.includes(m))) {
              guarded = true;
              for (const m of declared) if (!kept.includes(m)) excluded.add(m);
            }
          }
        }
      }
      if (excluded.size || guarded) {
        const rest = declared.filter((m) => !excluded.has(m));
        if (rest.length === 1 || (guarded && rest.length > 0))
          return new Set(rest);
      }
    }
    if (ts.isFunctionLike(n) && depth < 4) {
      let name = null;
      if (ts.isFunctionDeclaration(n) && n.name) name = n.name.text;
      else if (p && ts.isVariableDeclaration(p) && ts.isIdentifier(p.name))
        name = p.name.text;
      if (name) {
        const res = new Set();
        let called = false;
        (function visit(x) {
          if (
            ts.isCallExpression(x) &&
            ts.isIdentifier(x.expression) &&
            x.expression.text === name
          ) {
            called = true;
            const ms = attributeMethods(x, sf, checker, declared, depth + 1);
            if (ms) for (const m of ms) res.add(m);
          }
          ts.forEachChild(x, visit);
        })(sf);
        if (called) return res.size ? res : null;
      }
    }
    n = p;
  }
  return null;
}

/* ------------------------------------------------------------------------ *
 * Type TypeScript → JSON Schema
 * ------------------------------------------------------------------------ */

function toSchema(type, checker, stack = [], depth = 0) {
  const F = ts.TypeFlags;
  if (depth > MAX_DEPTH || stack.includes(type)) return {};
  if (type.flags & (F.Any | F.Unknown)) return {};
  if (type.flags & F.Null) return { type: 'null' };
  if (type.flags & F.StringLiteral)
    return { type: 'string', const: type.value };
  if (type.flags & F.NumberLiteral)
    return { type: 'number', const: type.value };
  if (type.flags & F.BooleanLiteral) {
    return { type: 'boolean', const: checker.typeToString(type) === 'true' };
  }
  if (type.flags & (F.String | F.TemplateLiteral)) return { type: 'string' };
  if (type.flags & F.Number) return { type: 'number' };
  if (type.flags & (F.BigInt | F.BigIntLiteral)) return { type: 'integer' };
  if (type.flags & F.Boolean) return { type: 'boolean' };
  if (type.flags & F.EnumLiteral && type.isUnion?.()) {
    return toSchema(
      checker.getBaseTypeOfLiteralType(type),
      checker,
      stack,
      depth
    );
  }

  const next = [...stack, type];
  if (type.isUnion()) {
    const parts = type.types.filter(
      (t) => !(t.flags & (F.Undefined | F.Void | F.Never))
    );
    const hasNull = parts.some((t) => t.flags & F.Null);
    const nonNull = parts.filter((t) => !(t.flags & F.Null));
    let schema;
    const bools = nonNull.filter((t) => t.flags & F.BooleanLiteral);
    if (nonNull.length && nonNull.every((t) => t.flags & F.StringLiteral)) {
      schema = { type: 'string', enum: nonNull.map((t) => t.value).sort() };
    } else if (
      nonNull.length &&
      nonNull.every((t) => t.flags & F.NumberLiteral)
    ) {
      schema = {
        type: 'number',
        enum: nonNull.map((t) => t.value).sort((a, b) => a - b),
      };
    } else if (bools.length === 2 && nonNull.length === 2) {
      schema = { type: 'boolean' };
    } else {
      const variants = [];
      const seen = new Set();
      const rest =
        bools.length === 2
          ? nonNull.filter((t) => !(t.flags & F.BooleanLiteral))
          : nonNull;
      if (bools.length === 2) variants.push({ type: 'boolean' });
      for (const t of rest) {
        const s = toSchema(t, checker, next, depth + 1);
        const k = JSON.stringify(s);
        if (!seen.has(k)) {
          seen.add(k);
          variants.push(s);
        }
      }
      if (variants.some((v) => Object.keys(v).length === 0)) return {};
      schema = variants.length === 1 ? variants[0] : { anyOf: variants };
    }
    if (!hasNull) return schema;
    if (schema.type && !schema.anyOf) {
      return {
        ...schema,
        type: [schema.type, 'null'],
        ...(schema.enum ? { enum: [...schema.enum, null] } : {}),
      };
    }
    return { anyOf: [...(schema.anyOf ?? [schema]), { type: 'null' }] };
  }

  if (checker.isArrayType(type) || checker.isTupleType(type)) {
    const args = checker.getTypeArguments(type);
    if (checker.isTupleType(type)) {
      return {
        type: 'array',
        items: args.length
          ? { anyOf: args.map((a) => toSchema(a, checker, next, depth + 1)) }
          : {},
      };
    }
    return {
      type: 'array',
      items: toSchema(args[0], checker, next, depth + 1),
    };
  }

  if (type.flags & F.Object || type.isIntersection()) {
    const symName = type.getSymbol()?.getName();
    if (symName === 'Date') return { type: 'string', format: 'date-time' };
    if (type.getCallSignatures().length) return {};
    const props = checker.getPropertiesOfType(type);
    const schema = { type: 'object' };
    const properties = {};
    const required = [];
    for (const prop of props) {
      const decl = prop.valueDeclaration ?? prop.declarations?.[0];
      const pType = decl
        ? checker.getTypeOfSymbolAtLocation(prop, decl)
        : checker.getTypeOfSymbol(prop);
      if (pType.getCallSignatures().length) continue;
      const optional =
        (prop.flags & ts.SymbolFlags.Optional) !== 0 ||
        (pType.isUnion() &&
          pType.types.some((t) => t.flags & (F.Undefined | F.Void)));
      properties[prop.getName()] = toSchema(pType, checker, next, depth + 1);
      if (!optional) required.push(prop.getName());
    }
    if (Object.keys(properties).length) schema.properties = properties;
    if (required.length) schema.required = required;
    const index = checker
      .getIndexInfosOfType(type)
      .find((i) => i.keyType.flags & ts.TypeFlags.String);
    if (index)
      schema.additionalProperties = toSchema(
        index.type,
        checker,
        next,
        depth + 1
      );
    return schema;
  }
  return {};
}

/* ------------------------------------------------------------------------ */

function inferResponses(root = process.cwd()) {
  const files = listHandlers(root);
  const { program, checker } = createChecker(root, files);
  const responses = {};
  const unattributed = [];
  for (const file of files.sort()) {
    const sf = program.getSourceFile(file);
    if (!sf) continue;
    const declared = declaredMethods(sf);
    const url = apiPathOf(root, file);
    (function visit(node) {
      if (
        ts.isCallExpression(node) &&
        ts.isPropertyAccessExpression(node.expression) &&
        node.expression.name.text === 'json' &&
        node.arguments.length === 1
      ) {
        const recv = node.expression.expression;
        let status = 200;
        if (
          ts.isCallExpression(recv) &&
          ts.isPropertyAccessExpression(recv.expression) &&
          recv.expression.name.text === 'status'
        ) {
          const arg = recv.arguments[0];
          status = arg && ts.isNumericLiteral(arg) ? Number(arg.text) : NaN;
        }
        if (status >= 200 && status < 300) {
          let methods = attributeMethods(node, sf, checker, declared);
          if ((!methods || !methods.size) && declared.length === 1)
            methods = new Set(declared);
          if (!methods || !methods.size) {
            const line =
              sf.getLineAndCharacterOfPosition(node.getStart()).line + 1;
            unattributed.push(
              `${path.relative(root, file).replace(/\\/g, '/')}:${line}`
            );
          } else {
            const schema = toSchema(
              checker.getTypeAtLocation(node.arguments[0]),
              checker
            );
            for (const m of methods) {
              const key = `${m} ${url}`;
              const byStatus = (responses[key] ??= {});
              const list = (byStatus[status] ??= []);
              const k = JSON.stringify(schema);
              if (!list.some((s) => JSON.stringify(s) === k)) list.push(schema);
            }
          }
        }
      }
      ts.forEachChild(node, visit);
    })(sf);
  }
  // Plusieurs réponses du même code → anyOf ; tri stable pour un diff lisible.
  const out = {};
  for (const key of Object.keys(responses).sort()) {
    out[key] = {};
    for (const status of Object.keys(responses[key]).sort()) {
      const list = responses[key][status].sort((a, b) =>
        JSON.stringify(a).localeCompare(JSON.stringify(b))
      );
      out[key][status] = list.length === 1 ? list[0] : { anyOf: list };
    }
  }
  return { responses: out, unattributed: unattributed.sort() };
}

function serialize(result) {
  return `${JSON.stringify(result, null, 1)}\n`;
}

module.exports = { inferResponses, serialize, OUTPUT };

if (require.main === module) {
  const root = process.cwd();
  const file = path.join(root, OUTPUT);
  const next = serialize(inferResponses(root));
  if (process.argv.includes('--check')) {
    const current = fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '';
    if (current !== next) {
      console.error(
        'openapi: docs/openapi/inferred-responses.json est périmé — lancer `npm run openapi:responses`.'
      );
      process.exit(1);
    }
    console.log('openapi: réponses déduites à jour.');
  } else {
    fs.writeFileSync(file, next);
    const r = JSON.parse(next);
    console.log(
      `openapi: ${Object.keys(r.responses).length} opérations → ${OUTPUT} (${r.unattributed.length} réponses non attribuées)`
    );
  }
}
