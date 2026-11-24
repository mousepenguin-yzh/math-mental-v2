const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { seededRandom } = require('./helpers/app.cjs');
const { solvePrompt } = require('./helpers/factorization-oracle.cjs');
const { validateFactorizationAnswer } = require('../src/factorization-answer.mjs');
const { checkFactorizationCorrection, inspectCrossCardPair } = require('../src/factorization-correction.mjs');
const { buildFactorizationQuestions: build } = require('../src/factorization-questions.mjs');

function verifyCards(q, coefficients) {
  assert.equal(q.cards.length, 6);
  const [targetC, targetB, targetA] = coefficients;
  const cards = q.cards.map(card => {
    const match = /^(\d*)x([+−])(\d+)$/.exec(card);
    assert.ok(match, card);
    return [Number(match[1] || 1), Number(match[3]) * (match[2] === '−' ? -1 : 1)];
  });
  assert.equal(new Set(cards.map(card => card.join(','))).size, 6);
  const winners = [];
  for (let i = 0; i < cards.length; i++) {
    for (let j = i+1; j < cards.length; j++) {
      const [a,b] = cards[i], [c,d] = cards[j];
      const lead = a*c, mid = a*d + b*c, cst = b*d;
      const matches = lead === targetA && mid === targetB && cst === targetC;
      if (matches) winners.push([i,j]);
      for (const cardPair of [[i,j], [j,i]]) {
        const diag = inspectCrossCardPair(q, cardPair);
        assert.equal(diag.leadingProduct, lead);
        assert.equal(diag.constantProduct, cst);
        assert.equal(diag.middleSum, mid);
        assert.equal(diag.allOk, matches);
        const stepCheck = checkFactorizationCorrection(q, { crossCheck: { cardPair, middle: '' } });
        if (lead !== targetA) {
          assert.equal(stepCheck.key, 'crossCheck');
          assert.equal(stepCheck.status, 'leading-mismatch');
        } else if (cst !== targetC) {
          assert.equal(stepCheck.key, 'crossCheck');
          assert.equal(stepCheck.status, 'constant-mismatch');
        } else {
          assert.equal(stepCheck.key, 'crossCheck');
          assert.equal(stepCheck.status, 'need-middle');
          // Wrong local arithmetic must be caught against this pair's actual middle sum
          const wrongArith = checkFactorizationCorrection(q, { crossCheck: { cardPair, middle: String(mid + 1) } });
          assert.equal(wrongArith.status, 'middle-arithmetic-wrong');
          // Correct local arithmetic must NEVER be marked wrong
          const rightArith = checkFactorizationCorrection(q, { crossCheck: { cardPair, middle: String(mid) } });
          if (matches) assert.deepEqual(rightArith, { key: 'ans2', status: 'incomplete' });
          else {
            assert.equal(rightArith.key, 'crossCheck');
            assert.equal(rightArith.status, 'middle-mismatch');
          }
        }
      }
    }
  }
  assert.equal(winners.length, 1, 'exactly one of all 15 unordered pairs');
  assert.deepEqual(q.correctPair, winners[0]);
  return winners[0];
}

function verifyQuestion(q) {
  const { coefficients, content, a, b, d, small, large, answer } = solvePrompt(q.formula);
  const [C,B,A] = coefficients;
  assert.equal(q.levelId, 'factorization');
  assert.equal(q.questionKey, coefficients.join(','));
  const final = { type: 'factorization', expected: coefficients };
  assert.deepEqual(q.stage1Ans, { ans: final });
  let fields = {};
  let customSpecs = {}, customInputs = {};
  switch (q.subtype) {
    case 'common':
    case 'common-composite':
      assert.equal(C, 0);
      assert.notEqual(B, 0);
      if (q.subtype === 'common') assert.equal(A, 1);
      else assert.ok(content > 1 && a > 1);
      customSpecs = { gcf: { type: 'monomial', expected: { coefficient: content, degree: 1 } } };
      customInputs = { gcf: content === 1 ? 'x' : `${content}x` };
      break;
    case 'difference':
    case 'two-step':
      assert.ok(C < 0 && B === 0 && a === 1 && small === -large);
      if (q.subtype === 'difference') {
        assert.equal(content, 1);
        fields = { squareRoot: large };
      } else {
        assert.ok(content > 1);
        fields = { content, squareRoot: large };
      }
      break;
    case 'square':
      assert.ok(A === 1 && b === d);
      fields = { offset: B/2 };
      break;
    case 'monic':
    case 'signed-pair':
      assert.ok(A === 1 && small < large && C !== 0);
      assert.equal(q.subtype === 'monic', small > 0);
      customSpecs = { numberPair: { type: 'sum-product', sum: B, product: C } };
      customInputs = { numberPair: [large, small] };
      break;
    case 'cross': {
      assert.ok(content === 1 && a > 1 && C !== 0);
      const pair = verifyCards(q, coefficients);
      customSpecs = { crossCheck: { type: 'cross-check', expectedPair: pair, expectedMiddle: B } };
      customInputs = { crossCheck: { cardPair: pair, middle: String(B) } };
      break;
    }
    default: assert.fail('unexpected subtype: '+q.subtype);
  }
  const stepAnswers = Object.fromEntries(Object.entries(fields).map(([key,expected]) =>
    [key, { type: 'integer', expected }]));
  assert.deepEqual(q.stage2Ans, { ...customSpecs, ...stepAnswers, ans2: final });
  assert.deepEqual(q.steps.map(step => step.key), [...Object.keys(customSpecs), ...Object.keys(fields), 'ans2']);
  const workedNumbers = {
    gcf: content === 1 ? [1, Math.abs(B), 1] : [A, Math.abs(B), content, content],
    content: [content, C/content],
    squareRoot: [large,large,large*large], offset: [B,2,b,C],
    numberPair: [small,large,B,C],
    crossCheck: [a,b,d,a,A,b,d,C,a*d,b,B],
  };
  for (const step of q.steps.slice(0,-1)) {
    assert.ok(step.prompt && step.solution);
    const numbers = step.solution.replaceAll('−', '-').match(/-?\d+/g).map(Number);
    assert.deepEqual(numbers, workedNumbers[step.key], step.solution);
    assert.equal(step.hints.length, 3);
    assert.equal(new Set(step.hints).size, 3);
    assert.ok(step.hints.every(hint => typeof hint === 'string' && hint.length > 0));
  }
  assert.deepEqual(q.steps.at(-1), { key: 'ans2', prompt: '請自行輸入完整因式分解。' });
  // Integration check only after the independent solution and all fields agree.
  assert.equal(validateFactorizationAnswer(answer, q.stage1Ans.ans).status, 'correct', answer);
  assert.equal(validateFactorizationAnswer(q.formula, q.stage2Ans.ans2).status, 'equivalent-not-factored');
  const inputs = { ...customInputs, ...fields };
  assert.deepEqual(checkFactorizationCorrection(q, inputs), { key: 'ans2', status: 'incomplete' });
  assert.deepEqual(checkFactorizationCorrection(q, { ...inputs, ans2: answer }), { key: 'ans2', status: 'complete' });
}

const families = {
  basic: ['common', 'difference', 'square', 'monic'],
  medium: ['common-composite', 'signed-pair', 'two-step'],
  challenge: ['cross']
};
for (const count of [10,20,30]) test(`factorization: ${count} questions × 100 seeds, independent prompt and correction audit`, () => {
  for (let seed = 1; seed <= 100; seed++) {
    const questions = build(count, seededRandom(seed));
    assert.equal(questions.length, count);
    for (const [band,types] of Object.entries(families)) {
      const group = questions.filter(q => q.difficultyBand === band);
      assert.equal(group.length, count * (band === 'challenge' ? .2 : .4));
      const frequencies = types.map(type => group.filter(q => q.subtype === type).length);
      assert.equal(frequencies.reduce((a,b) => a+b), group.length);
      assert.ok(Math.min(...frequencies) >= 1 && Math.max(...frequencies)-Math.min(...frequencies) <= 1);
    }
    const seen = new Set();
    for (const q of questions) {
      try {
        verifyQuestion(q);
        assert.ok(!seen.has(q.questionKey));
        seen.add(q.questionKey);
      } catch (error) {
        error.message = `seed=${seed}, count=${count}, ${q.subtype} ${q.formula}: ${error.message}`;
        throw error;
      }
    }
  }
});

test('sum and product form one unordered step with no partial credit or individual feedback', () => {
  const questions = build(10, seededRandom(42));
  for (const subtype of ['monic', 'signed-pair']) {
    const q = questions.find(q => q.subtype === subtype);
    const { small, large, answer } = solvePrompt(q.formula);
    for (const numberPair of [[], [small], [large+10], ['', large], [small, '−']]) {
      assert.deepEqual(checkFactorizationCorrection(q, { numberPair, ans2: answer }),
        { key: 'numberPair', status: 'incomplete' });
    }
    for (const numberPair of [[small, small], [small-1, large+1], [-small, -large]]) {
      assert.deepEqual(checkFactorizationCorrection(q, { numberPair, ans2: answer }),
        { key: 'numberPair', status: 'incorrect' });
    }
    for (const numberPair of [[small, '3x'], [small, '1e2'], [small, 1000001], [small, large, large]]) {
      assert.deepEqual(checkFactorizationCorrection(q, { numberPair }), { key: 'numberPair', status: 'invalid' });
    }
    for (const pair of [[small, large], [large, small]]) {
      const numberPair = pair.map(n => String(n).replace('-', '−'));
      assert.deepEqual(checkFactorizationCorrection(q, { numberPair }), { key: 'ans2', status: 'incomplete' });
      assert.deepEqual(checkFactorizationCorrection(q, { numberPair, ans2: q.formula }),
        { key: 'ans2', status: 'equivalent-not-factored' });
      assert.deepEqual(checkFactorizationCorrection(q, { numberPair, ans2: answer }), { key: 'ans2', status: 'complete' });
    }
  }
});

test('cross-multiplication diagnoses leading, constant and local cross-term sum accurately (2x²+5x−12 scenarios)', () => {
  // Find 2x²+5x−12 across seeds so we verify the exact real generated question
  let q = null;
  for (let seed = 1; seed <= 500 && !q; seed++) {
    q = build(30, seededRandom(seed)).find(item => item.formula === '2x²+5x−12');
  }
  assert.ok(q, 'Expected 2x²+5x−12 in candidate bank');
  const idx = label => q.cards.indexOf(label);
  const cXPlus4 = idx('x+4'), cXMinus4 = idx('x−4'), c2xPlus3 = idx('2x+3'), c2xMinus3 = idx('2x−3');
  assert.ok([cXPlus4, cXMinus4, c2xPlus3, c2xMinus3].every(i => i >= 0));

  // Scenario 1: (x+4)(x−4) -> leading x² != 2x², constant -16 != -12
  const r1 = checkFactorizationCorrection(q, { crossCheck: { cardPair: [cXPlus4, cXMinus4], middle: '' } });
  assert.equal(r1.key, 'crossCheck');
  assert.equal(r1.status, 'leading-mismatch');
  assert.equal(r1.diagnostic.leadingProduct, 1);
  assert.equal(r1.diagnostic.constantProduct, -16);
  assert.equal(r1.diagnostic.leadingOk, false);
  assert.equal(r1.diagnostic.constantOk, false);

  // Scenario 2: (2x+3)(x−4) -> leading 2x² ✓, constant -12 ✓, middle is -8 + 3 = -5 (≠ +5)
  const r2Need = checkFactorizationCorrection(q, { crossCheck: { cardPair: [c2xPlus3, cXMinus4], middle: '' } });
  assert.equal(r2Need.status, 'need-middle');
  assert.equal(r2Need.diagnostic.leadingOk, true);
  assert.equal(r2Need.diagnostic.constantOk, true);
  assert.equal(r2Need.diagnostic.middleSum, -5);

  // Student miscalculates (2x+3)(x−4) as +5 -> caught as middle-arithmetic-wrong!
  const r2Wrong = checkFactorizationCorrection(q, { crossCheck: { cardPair: [c2xPlus3, cXMinus4], middle: '5' } });
  assert.equal(r2Wrong.status, 'middle-arithmetic-wrong');

  // Student correctly calculates (2x+3)(x−4) as -5 -> middle-mismatch (local arithmetic confirmed right!)
  const r2RightArith = checkFactorizationCorrection(q, { crossCheck: { cardPair: [c2xPlus3, cXMinus4], middle: '−5' } });
  assert.equal(r2RightArith.status, 'middle-mismatch');
  assert.equal(r2RightArith.diagnostic.middleSum, -5);
  assert.equal(r2RightArith.diagnostic.targetMiddle, 5);

  // Scenario 3: (2x−3)(x+4) -> leading 2x² ✓, constant -12 ✓, middle 8 - 3 = +5 ✓ -> unlocks ans2
  const r3 = checkFactorizationCorrection(q, { crossCheck: { cardPair: [c2xMinus3, cXPlus4], middle: '5' } });
  assert.deepEqual(r3, { key: 'ans2', status: 'incomplete' });
  const r3Complete = checkFactorizationCorrection(q, {
    crossCheck: { cardPair: [c2xMinus3, cXPlus4], middle: '5' },
    ans2: '(2x-3)(x+4)',
  });
  assert.deepEqual(r3Complete, { key: 'ans2', status: 'complete' });
});

test('session seeds reproduce, each session owns its data, review sample is current', () => {
  const game = seed => build(30, seededRandom(seed));
  const first = game(42), second = game(42);
  assert.deepEqual(first, second);
  assert.notDeepEqual(first, game(43));
  first[0].steps[0].hints.pop();
  first[0].stage1Ans.ans.expected[0] = Infinity;
  assert.deepEqual(second, game(42));
  for (const count of [0, 15, '10', null]) assert.throws(() => build(count), RangeError);
  execFileSync(process.execPath, [resolve(__dirname, '../scripts/generate-factorization-samples.cjs'), '--check']);
});
