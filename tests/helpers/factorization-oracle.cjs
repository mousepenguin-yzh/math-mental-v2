const assert = require('node:assert/strict');

// Read the rendered terms, then find an integer root of the primitive
// quadratic by substitution. Independent of both production modules.
function solvePrompt(text) {
  const terms = text.replaceAll('−', '-').match(/[+-]?[^+-]+/g);
  assert.equal(terms.join(''), text.replaceAll('−', '-'));
  const coefficients = [0, 0, 0];
  let lastDegree = 3;
  for (const term of terms) {
    const match = /^([+-]?)(\d*)(x²|x)?$/.exec(term);
    assert.ok(match && (match[2] || match[3]), text);
    const degree = match[3] === 'x²' ? 2 : match[3] === 'x' ? 1 : 0;
    assert.ok(degree < lastDegree);
    coefficients[degree] = (match[1] === '-' ? -1 : 1) * Number(match[2] || 1);
    assert.notEqual(coefficients[degree], 0);
    lastDegree = degree;
  }
  const [C, B, A] = coefficients;
  assert.ok(A > 0 && A <= 9 && Math.abs(B) <= 20 && Math.abs(C) <= 108);
  let content = A;
  while (coefficients.some(n => n % content !== 0)) content--;
  const a = A / content, middle = B / content, constant = C / content;
  // Every V1 prompt has a monic factor. Any nonzero integer root divides
  // the constant. If it vanishes, x itself is already a known factor.
  let root;
  for (let i = -Math.abs(constant); i <= Math.abs(constant); i++) {
    if (a*i*i + middle*i + constant === 0) { root = i; break; }
  }
  assert.notEqual(root, undefined, 'fully factors over integers: ' + text);
  const b = middle + a*root, d = -root || 0;
  assert.equal(b*d || 0, constant);
  const small = Math.min(b, d), large = Math.max(b, d);
  const signed = n => n < 0 ? String(n) : '+' + n;
  const first = a === 1 ? 'x' : a + 'x';
  const factor = (x, n) => n ? '(' + x + signed(n) + ')' : x;
  const answer = (content === 1 ? '' : content) + factor(first, b) + factor('x', d);
  return { coefficients, a, b, d, content, small, large, answer };
}

module.exports = { solvePrompt };
