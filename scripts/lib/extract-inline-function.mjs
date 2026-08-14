/**
 * Extract one named function declaration from an inline JavaScript source.
 * The scanner deliberately understands only the lexical constructs needed to
 * match braces without evaluating the source.
 */
export function extractInlineFunction(source, name) {
  if (typeof source !== 'string') throw new TypeError('source must be a string');
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) {
    throw new TypeError(`Invalid function name: ${String(name)}`);
  }

  const marker = `function ${name}(`;
  const start = source.indexOf(marker);
  if (start === -1) throw new Error(`${name} must exist in the inline source`);
  const openBrace = source.indexOf('{', start + marker.length);
  if (openBrace === -1) throw new Error(`${name} must have a function body`);

  let depth = 0;
  let quote = '';
  let escaped = false;
  let lineComment = false;
  let blockComment = false;

  for (let index = openBrace; index < source.length; index++) {
    const char = source[index];
    const next = source[index + 1];

    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index++;
      }
      continue;
    }
    if (quote) {
      if (escaped) {
        escaped = false;
      } else if (char === '\\') {
        escaped = true;
      } else if (char === quote) {
        quote = '';
      }
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index++;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index++;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === '{') depth++;
    if (char === '}') {
      depth--;
      if (depth === 0) return source.slice(start, index + 1);
    }
  }

  throw new Error(`${name} function body is incomplete`);
}

export function extractInlineFunctions(source, names) {
  if (!Array.isArray(names)) throw new TypeError('names must be an array');
  return names.map(name => extractInlineFunction(source, name));
}

