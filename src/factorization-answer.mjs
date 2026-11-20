// Coefficients are stored in ascending order: [constant, x, x², ...].
export const factorizationLimits = Object.freeze({
  length: 160, degree: 8, coefficient: 1_000_000, operations: 512
});

class InputError extends Error {}

function fail(reason) { throw new InputError(reason); }

function bounded(n) {
  if (Math.abs(n) > factorizationLimits.coefficient) fail('limit');
  return n || 0;
}

function trimZeros(p) {
  while (p.length > 1 && p.at(-1) === 0) p.pop();
  return p;
}

function gcd(a, b) {
  while (b) [a, b] = [b, a % b];
  return Math.abs(a);
}

// All V1 targets split into constants and primitive linear factors over Z.
// A sum is one factor. Products, unary signs and squares preserve the
// boundaries the student actually wrote, even when factors are regrouped.
export function parseFactorizationAnswer(raw) {
  try {
    if (typeof raw !== 'string') fail('syntax');
    if (raw.length > factorizationLimits.length) fail('limit');
    const tokens = raw.replaceAll('−', '-').match(/\d+|[^\s]/gu) || [];
    let pos = 0;
    let operations = 0;
    function spend(cost) {
      operations += cost;
      if (operations > factorizationLimits.operations) fail('limit');
    }
    function product(left, right) {
      const a = left.value, b = right.value;
      if (a.length + b.length - 2 > factorizationLimits.degree) fail('limit');
      spend(a.length * b.length);
      const p = Array(a.length + b.length - 1).fill(0);
      for (let i = 0; i < a.length; i++) {
        for (let j = 0; j < b.length; j++) {
          // Both operands are bounded by 10^6 before every multiplication.
          p[i+j] = bounded(p[i+j] + a[i] * b[j]);
        }
      }
      return { value: trimZeros(p), complete: left.complete && right.complete };
    }
    function atom() {
      const t = tokens[pos++];
      if (!t) fail('incomplete');
      if (t === 'x') return { value: [0, 1], complete: true };
      if (/^\d+$/.test(t)) return { value: [bounded(Number(t))], complete: true };
      if (t !== '(') fail('syntax');
      const inside = sum();
      if (!tokens[pos]) fail('incomplete');
      if (tokens[pos++] !== ')') fail('syntax');
      return inside;
    }
    function signedPower() {
      let sign = 1;
      while (tokens[pos] === '+' || tokens[pos] === '-') {
        if (tokens[pos++] === '-') sign = -sign;
      }
      let term = atom();
      if (tokens[pos] === '^' || tokens[pos] === '²') {
        if (tokens[pos++] === '^') {
          if (!tokens[pos]) fail('incomplete');
          if (tokens[pos++] !== '2') fail('syntax');
        }
        term = product(term, term);
      }
      return sign === 1 ? term : { value: term.value.map(n => -n || 0), complete: term.complete };
    }
    function multiplication() {
      let left = signedPower();
      while (pos < tokens.length) {
        const next = tokens[pos];
        if (next === '*' || next === '×') pos++;
        else {
          const followsNumber = /^\d+$/.test(tokens[pos-1]) && tokens[pos-2] !== '^';
          const implicit = next === '(' || next === 'x' || (/^\d+$/.test(next) && !followsNumber);
          if (!implicit) break;
        }
        left = product(left, signedPower());
      }
      return left;
    }
    function sum() {
      let term = multiplication();
      while (tokens[pos] === '+' || tokens[pos] === '-') {
        const sign = tokens[pos++] === '+' ? 1 : -1;
        const a = term.value, b = multiplication().value;
        const size = Math.max(a.length, b.length);
        spend(size);
        const value = trimZeros(Array.from({ length: size }, (_, i) =>
          bounded((a[i] || 0) + sign * (b[i] || 0))));
        const complete = value.length === 1 ||
          (value.length === 2 && gcd(value[0], value[1]) === 1);
        term = { value, complete };
      }
      return term;
    }
    const term = sum();
    if (pos !== tokens.length) fail('syntax');
    return { ok: true, ...term };
  } catch (error) {
    if (!(error instanceof InputError)) throw error;
    return { ok: false, reason: error.message };
  }
}

export function validateFactorizationAnswer(raw, spec) {
  const invalid = reason => ({ status: 'invalid', accepted: false, reason });
  const expected = spec?.expected;
  if (spec?.type !== 'factorization' || !Array.isArray(expected) ||
      expected.length < 2 || expected.length > 3 || !expected.at(-1) ||
      !Array.from(expected).every(n => Number.isSafeInteger(n) && Math.abs(n) <= factorizationLimits.coefficient)) {
    return invalid('invalid-spec');
  }
  const parsed = parseFactorizationAnswer(raw);
  if (!parsed.ok) return invalid(parsed.reason);
  const equivalent = expected.length === parsed.value.length &&
    expected.every((n, i) => n === parsed.value[i]);
  const status = !equivalent ? 'incorrect' : parsed.complete ? 'correct' : 'equivalent-not-factored';
  return { status, equivalent, accepted: status === 'correct' };
}
