const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const { resolve } = require('node:path');
const { seededRandom } = require('./helpers/app.cjs');
const { solvePrompt } = require('./helpers/factorization-oracle.cjs');
const { validateFactorizationAnswer } = require('../src/factorization-answer.mjs');
const { buildFactorizationQuestions: build } = require('../src/factorization-questions.mjs');

function verifyCards(q, coefficients) {
  assert.equal(q.cards.length, 6);
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
      if ([b*d, a*d+b*c, a*c].every((n,k) => n === coefficients[k])) winners.push([i,j]);
    }
  }
  assert.equal(winners.length, 1, 'exactly one of all 15 unordered pairs');
  assert.deepEqual(q.correctPair, winners[0]);
}

function verifyQuestion(q) {
  const { coefficients, content, a, b, d, small, large, answer } = solvePrompt(q.formula);
  const [C,B,A] = coefficients;
  assert.equal(q.levelId, 'factorization');
  assert.equal(q.questionKey, coefficients.join(','));
  const final = { type: 'factorization', expected: coefficients };
  assert.deepEqual(q.stage1Ans, { ans: final });
  let fields;
  switch (q.subtype) {
    case 'common':
    case 'common-composite':
      assert.equal(C, 0);
      assert.notEqual(B, 0);
      if (q.subtype === 'common') {
        assert.equal(A, 1);
        fields = { innerConstant: B };
      } else {
        assert.ok(content > 1 && a > 1);
        fields = { content, innerConstant: B/content };
      }
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
      fields = { smaller: small, larger: large };
      break;
    case 'cross':
      assert.ok(content === 1 && a > 1 && C !== 0);
      verifyCards(q, coefficients);
      fields = { crossA: a*d, crossB: b };
      break;
    default: assert.fail('unexpected subtype: '+q.subtype);
  }
  const stepAnswers = Object.fromEntries(Object.entries(fields).map(([key,expected]) =>
    [key, { type: 'integer', expected }]));
  assert.deepEqual(q.stage2Ans, { ...stepAnswers, ans2: final });
  assert.deepEqual(q.steps.map(step => step.key), [...Object.keys(fields), 'ans2']);
  const workedNumbers = {
    content: C === 0 ? [A, Math.abs(B), content] : [content, C/content],
    innerConstant: content === 1 ? [B,b] : [B,content,b],
    squareRoot: [large,large,large*large], offset: [B,2,b,C],
    smaller: [small,large,C,B,small], larger: [B,small,large],
    crossA: [a,d,a*d], crossB: [b,1,b,B]
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
