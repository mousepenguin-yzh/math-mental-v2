const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp, question } = require('./helpers/app.cjs');

// BUG-01 to BUG-04 are required regressions; remaining mathematics bugs use TODO.
test('BUG-01 duplicate successful submissions must award only one star', () => {
  const app = createApp(); app.mount([question(), question(), question()]);
  app.fill({ ans: '5' }); app.context.checkAnswer(); app.context.checkAnswer();
  assert.equal(app.state.goldenStars, 1);
});

test('BUG-02 duplicate successful submissions must advance exactly one question', () => {
  const app = createApp(); app.mount([question(), question(), question()]);
  app.fill({ ans: '5' }); app.context.checkAnswer(); app.context.checkAnswer(); app.tick(1500);
  assert.equal(app.state.currentIndex, 1);
});

test('BUG-03 old success timer must not advance a new session', () => {
  const app = createApp(); app.mount([question(), question()]);
  app.fill({ ans: '5' }); app.context.checkAnswer();
  app.context.confirmExit(); app.context.startGame(); app.tick(1500);
  assert.equal(app.state.currentIndex, 0);
});

test('BUG-04 old correction timer must not inject old inputs into a new session', () => {
  const app = createApp(); app.mount([question()]);
  app.fill({ ans: '9' }); app.context.checkAnswer();
  app.context.confirmExit(); app.context.startGame(); app.tick(600);
  assert.equal(app.el('stage-2-container').classList.contains('open'), false);
  assert.equal(app.el('stage-2-input-area').innerHTML, '');
});

for (const [num, den] of [['1.9', '2'], ['1', '2.9']]) {
  test(`BUG-05 fraction ${num}/${den} must not be truncated to 1/2`, { todo: 'parseInt truncates decimal operands' }, () => {
    const app = createApp();
    app.mount([question({ stage1Markup: '[fraction:ans_num:ans_den]', stage1Ans: { ans_num: '1', ans_den: '2' } })]);
    app.fill({ ans_num: num, ans_den: den }); app.context.checkAnswer();
    assert.equal(app.state.goldenStars, 0);
  });
}

function reverse15(app) {
  const q = app.context.buildQuestions(4, 1200).find((q) => q.tag === '逆向根特徵反查' && /225/.test(q.formulaHtml));
  assert.ok(q, 'seed must contain reverse square 225');
  return q;
}

test('BUG-06 reverse square 225 hint interval must contain a valid root', { todo: '15 uses the 25 interval hint' }, () => {
  const app = createApp(); const q = reverse15(app);
  const hint = q.stage2Markup.replace(/<[^>]*>/g, ' ');
  const bounds = [...hint.matchAll(/(\d+)²\s*=\s*(\d+)/g)].map((m) => Number(m[1]));
  assert.equal(bounds.length, 2);
  assert.ok(bounds[0] < Math.sqrt(225) && Math.sqrt(225) < bounds[1], `hint bounds: ${bounds}`);
});

test('BUG-07 x² = 225 must restrict x to positive values or accept its negative root', { todo: 'question omits positive-root restriction' }, () => {
  const app = createApp(); const q = reverse15(app);
  if (/正數|正根|x\s*>\s*0/.test(q.formulaHtml)) return;
  app.mount([q]); app.fill({ ans: '-15' }); app.context.checkAnswer();
  assert.equal(app.state.goldenStars, 1);
});
