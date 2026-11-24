const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseFactorizationAnswer: parse, validateFactorizationAnswer: check,
  parseMonomialAnswer: parseMonomial, validateMonomialAnswer: checkMonomial,
  factorizationLimits: limits } = require('../src/factorization-answer.mjs');

function expectStatus(expected, status, forms) {
  for (const raw of forms) {
    const result = check(raw, { type: 'factorization', expected });
    assert.equal(result.status, status, raw);
    assert.equal(result.accepted, status === 'correct', raw);
  }
}

test('full factorization accepts reordered terms/factors, signs, content and repeated factors', () => {
  expectStatus([-18, 0, 2], 'correct', [
    '2(x-3)(x+3)', '(3+x)(x−3)2', '-(3-x)(3+x)*2', '(-2)(3-x)(x+3)',
    '((x+3) × 2)(-3+x)', '2(-(3-x))(x+3)', '2(x-3)(x+3)*1'
  ]);
  expectStatus([18, -12, 2], 'correct', ['2(3-x)²', '2(x-3)^2', '2(-x+3)(3-x)', '(3-x)2(3-x)']);
  expectStatus([0, -12, 4], 'correct', ['2x*2*(x-3)', '4x(-3+x)', '(-4)(3-x)x']);
  expectStatus([-3, -5, 2], 'correct', ['(1+2x)(x-3)', '(3-x)(-1-2x)']);
});

test('equivalent forms must expose every linear factor and its numeric content', () => {
  expectStatus([-18, 0, 2], 'equivalent-not-factored', [
    '2(x²-9)', '2x^2-18', '(2x-6)(x+3)', '-(6-2x)(x+3)', '2*(x*x-9)'
  ]);
  expectStatus([4, 8, 4], 'equivalent-not-factored', ['(2x+2)²', '4(x²+2x+1)']);
  expectStatus([18, -12, 2], 'incorrect', ['2(x+3)^2', '-2(3-x)²', 'x', '0', '18-12x-2x²']);
});

test('syntax, incomplete input and resource limits are distinct from wrong answers', () => {
  for (const [reason, forms] of Object.entries({
    incomplete: ['', '  ', '-', 'x+', '2*', '(', '(x+3', 'x^'],
    syntax: [null, 3, '()', 'x)', 'x/2', 'y', '2 3x', '2.0', '1e2', 'x^3', 'x^20',
      'x²²', 'x**2', 'x(2+)', 'Math.pow(x,2)', 'globalThis.x=1', '2^+2'],
    limit: [' '.repeat(limits.length)+'x', '1000001', '1000000+1', '1001²',
      '((x²)²)²x', '('+'(x+1)'.repeat(8)+')²', '((x²)²)²'+'*1'.repeat(60)]
  })) {
    for (const input of forms) assert.deepEqual(parse(input), { ok: false, reason }, String(input));
  }
  assert.equal(parse(' '.repeat(limits.length-1)+'x').ok, true);
  assert.deepEqual(parse('-1000000').value, [-1000000]);
  assert.deepEqual(parse('-x²').value, [0, 0, -1]);
  assert.deepEqual(parse('(-x)^2').value, [0, 0, 1]);
  assert.deepEqual(parse('((x²)²)²').value, [0,0,0,0,0,0,0,0,1]);
  for (const spec of [null, {}, { type: 'integer', expected: [1,1] },
      ...[[1,0], [0,Infinity,1], [1], [0,1.5], Array(2), [0,1,2,3]].map(expected => ({ type: 'factorization', expected }))]) {
    assert.equal(check('x', spec).reason, 'invalid-spec');
  }
});

test('strict monomial validator accepts exact GCF forms and rejects partial, multi-term or malformed inputs', () => {
  const spec2x = { type: 'monomial', expected: { coefficient: 2, degree: 1 } };
  const specX = { type: 'monomial', expected: { coefficient: 1, degree: 1 } };
  for (const raw of ['2x', ' 2x ', '+2x', '02x', '2*x', '2×x', 'x*2', 'x×2']) {
    const res = checkMonomial(raw, spec2x);
    assert.equal(res.status, 'correct', raw);
    assert.equal(res.accepted, true, raw);
  }
  for (const raw of ['x', '1x', '+x', '1*x', 'x×1']) {
    assert.equal(checkMonomial(raw, specX).status, 'correct', raw);
  }
  for (const raw of ['2', 'x', '1x', '2x²', '2x^2', '4x', '3x', '-2x', '−2x', '0', '0x']) {
    const res = checkMonomial(raw, spec2x);
    assert.equal(res.status, 'incorrect', raw);
    assert.equal(res.accepted, false, raw);
  }
  for (const raw of ['1', 'x²', 'x^2', '2x', '-x', '0']) {
    assert.equal(checkMonomial(raw, specX).status, 'incorrect', raw);
  }
  for (const raw of ['', '  ', '+', '-', '−', '2*', '2×', 'x^', '2x^']) {
    assert.deepEqual(parseMonomial(raw), { ok: false, reason: 'incomplete' }, raw);
    assert.equal(checkMonomial(raw, spec2x).reason, 'incomplete', raw);
  }
  for (const raw of [null, 2, '2x+3', '2x-0', 'x+x', '(2x)', '2x(2x+3)', '2 x', '2x 3',
      '2/x', 'x/2', '2.0x', '2x^3', '2xx', 'y', '*x', '2x²²', 'Math.abs(2)']) {
    assert.deepEqual(parseMonomial(raw), { ok: false, reason: 'syntax' }, String(raw));
    assert.equal(checkMonomial(raw, spec2x).reason, 'syntax', String(raw));
  }
  for (const raw of ['1000001x', '1000001', ' '.repeat(limits.length) + '2x']) {
    assert.deepEqual(parseMonomial(raw), { ok: false, reason: 'limit' }, raw);
  }
  for (const badSpec of [null, {}, { type: 'monomial', expected: null },
      { type: 'monomial', expected: { coefficient: 1.5, degree: 1 } },
      { type: 'monomial', expected: { coefficient: 1, degree: 3 } },
      { type: 'monomial', expected: { coefficient: 0, degree: 1 } }]) {
    assert.equal(checkMonomial('2x', badSpec).reason, 'invalid-spec');
  }
});
