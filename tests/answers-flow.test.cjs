const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp, question } = require('./helpers/app.cjs');

for (const [expected, input, correct] of [
  ['5', '5', true], ['5', '6', false], ['-5', '-5', true], ['-5', '5', false],
  ['0.375', '.375', true], ['0.375', '0.37', false], ['0', '0', true], ['0', '', false],
]) test(`numeric answer ${JSON.stringify(input)} against ${expected}: ${correct}`, () => {
  const app = createApp();
  app.mount([question({ stage1Ans: { ans: expected } })]);
  app.fill({ ans: input }); app.context.checkAnswer();
  assert.equal(app.state.goldenStars, correct ? 1 : 0);
  assert.equal(app.state.questions[0].firstTry, correct);
  assert.equal(Boolean(app.state.errorLog.Arithmetic_Sign), !correct);
});

for (const [num, den, correct] of [
  ['1', '2', true], ['2', '4', true], ['-1', '-2', true], ['1', '-2', false],
  ['1', '0', false], ['0', '0', false], ['', '2', false], ['2', '3', false],
]) test(`fraction ${num}/${den} against 1/2: ${correct}`, () => {
  const app = createApp();
  app.mount([question({ stage1Markup: '[fraction:ans_num:ans_den]', stage1Ans: { ans_num: '1', ans_den: '2' } })]);
  app.fill({ ans_num: num, ans_den: den }); app.context.checkAnswer();
  assert.equal(app.state.goldenStars, correct ? 1 : 0);
  assert.equal(app.state.questions[0].firstTry, correct);
});

test('first correct answer earns one star; transition occurs at 1500ms', () => {
  const app = createApp(); app.mount([question(), question()]);
  app.fill({ ans: '5' }); app.context.checkAnswer();
  assert.equal(app.state.goldenStars, 1);
  assert.equal(app.state.activeInputId, null);
  app.tick(1499); assert.equal(app.state.currentIndex, 0);
  app.tick(1); assert.equal(app.state.currentIndex, 1);
  assert.equal(app.el('top-progress-text').textContent, '2 / 2');
  assert.equal(app.el('progress-bar-fill').style.width, '100%');
  assert.equal(app.el('top-stars').textContent, 1);
});

test('wrong answer opens correction at 600ms; repeated errors count once; correction earns no star', () => {
  const app = createApp(); app.mount([question(), question()]);
  const q = app.state.questions[0];
  app.fill({ ans: '99' }); app.context.checkAnswer();
  assert.equal(q.firstTry, false); assert.equal(app.state.goldenStars, 0);
  assert.equal(app.state.errorLog.Arithmetic_Sign, 1);
  app.context.checkAnswer();
  assert.equal(app.state.errorLog.Arithmetic_Sign, 1);
  app.tick(599); assert.equal(q.currentStage, 1);
  app.tick(1); assert.equal(q.currentStage, 2);
  assert.equal(app.el('stage-2-container').classList.contains('open'), true);
  assert.equal(app.el('stage-2-hint').innerHTML, 'fixture hint');
  for (let i = 0; i < 3; i++) {
    app.fill({ step1: '2', ans2: '99' }); app.context.checkAnswer();
  }
  assert.equal(app.state.errorLog.Arithmetic_Sign, 1);
  assert.equal(app.state.currentIndex, 0);
  app.fill({ step1: '2', ans2: '5' }); app.context.checkAnswer();
  app.tick(1500);
  assert.equal(app.state.currentIndex, 1); assert.equal(app.state.goldenStars, 0);
});

for (const [values, correct] of [
  [{ step1: '3', step2: '7', ans2: '16' }, true],
  [{ step1: '7', step2: '3', ans2: '16' }, true],
  [{ step1: '3', step2: '3', ans2: '16' }, false],
  [{ step1: '7', step2: '3', ans2: '17' }, false],
  [{ step1: '', step2: '7', ans2: '16' }, false],
]) test(`stage 2 interchangeable fields ${JSON.stringify(values)}: ${correct}`, () => {
  const app = createApp();
  app.mount([question({
    stage2Markup: '[input:step1:w-14] [input:step2:w-14] [input:ans2:w-14]',
    stage2Ans: { step1: '3', step2: '7', ans2: '16' },
    interchangeableGroups: [['step1', 'step2']],
  })]);
  app.fill({ ans: '99' }); app.context.checkAnswer(); app.tick(600);
  app.fill(values); app.context.checkAnswer(); app.tick(1500);
  assert.equal(app.state.currentIndex, correct ? 1 : 0);
  assert.equal(app.state.goldenStars, 0);
});

test('stage 2 validates every fraction and scalar field', () => {
  const app = createApp();
  app.mount([question({ stage2Markup: '[fraction:s1_num:s1_den] [input:ans2]', stage2Ans: { s1_num: '1', s1_den: '2', ans2: '5' } })]);
  app.fill({ ans: '99' }); app.context.checkAnswer(); app.tick(600);
  app.fill({ s1_num: '2', s1_den: '4', ans2: '6' }); app.context.checkAnswer(); app.tick(1500);
  assert.equal(app.state.currentIndex, 0);
  app.fill({ ans2: '5' }); app.context.checkAnswer(); app.tick(1500);
  assert.equal(app.state.currentIndex, 1);
});

test('mixed session reports progress, stars, guided count, rate and elapsed time', () => {
  const app = createApp(); app.mount([question(), question()]);
  assert.equal(app.el('top-progress-text').textContent, '1 / 2');
  assert.equal(app.el('progress-bar-fill').style.width, '50%');
  app.tick(1000); app.fill({ ans: '5' }); app.context.checkAnswer(); app.tick(1500);
  app.tick(1000); app.fill({ ans: '9' }); app.context.checkAnswer(); app.tick(600);
  app.fill({ step1: '2', ans2: '5' }); app.context.checkAnswer(); app.tick(1500);
  assert.equal(app.state.endTime, 5600);
  for (const [id, expected] of Object.entries({
    'report-total': '2 題', 'report-perfect': '1 題', 'report-guided': '1 題',
    'star-rate-text': '50%', 'report-time-total': '5 秒', 'report-time-avg': '2.5 秒 / 題',
  })) assert.equal(app.el(id).textContent, expected);
  assert.equal(Number(app.el('star-circle').getAttribute('stroke-dashoffset')), 119.38);
  assert.equal(app.el('result-panel').classList.contains('hidden'), false);
  assert.equal(app.el('game-panel').classList.contains('hidden'), true);
  assert.match(app.el('diagnosis-text').textContent, /正負號/);
});

test('startGame resets previous session statistics and uses selected challenge/count', () => {
  const app = createApp();
  Object.assign(app.state, { goldenStars: 8, currentIndex: 7, errorLog: { old: 3 } });
  app.context.selectDifficulty(2); app.context.selectCount(20); app.context.startGame();
  assert.equal(app.state.questions.length, 20); assert.equal(app.state.currentIndex, 0);
  assert.equal(app.state.goldenStars, 0); assert.equal(Object.keys(app.state.errorLog).length, 0);
  assert.ok(app.state.questions.every((q) => q.category.startsWith('Equation_')));
  assert.equal(app.el('setup-panel').classList.contains('hidden'), true);
  assert.equal(app.el('game-panel').classList.contains('hidden'), false);
});
