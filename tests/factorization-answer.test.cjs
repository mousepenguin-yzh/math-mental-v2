const { test } = require('node:test');
const assert = require('node:assert/strict');
const { parseFactorizationAnswer: parse, validateFactorizationAnswer: check,
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
