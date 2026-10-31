const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp, question } = require('./helpers/app.cjs');

function input(app, name = 'ans') {
  return app.document.querySelector(`[data-input-id="q_${app.state.currentIndex}_${name}"]`);
}

for (const stage of [1, 2]) test(`stage ${stage}: repeated submit and field reselect complete exactly once`, () => {
  const app = createApp(); app.mount([question(), question(), question()]);
  if (stage === 2) {
    app.fill({ ans: '99' }); app.context.checkAnswer(); app.tick(600);
    app.fill({ step1: '2', ans2: '5' });
  } else app.fill({ ans: '5' });
  app.context.checkAnswer();
  for (let i = 0; i < 5; i++) {
    app.context.focusInput(`q_0_${stage === 1 ? 'ans' : 'ans2'}`);
    app.context.pressKey('OK'); app.key('Enter'); app.context.checkAnswer();
  }
  assert.equal(app.state.activeInputId, null);
  app.tick(1499); assert.equal(app.state.currentIndex, 0);
  app.tick(1); assert.equal(app.state.currentIndex, 1);
  app.tick(5000); assert.equal(app.state.currentIndex, 1);
  assert.equal(app.state.goldenStars, stage === 1 ? 1 : 0);
});

// Stagger duplicate submissions so an extra timer would overwrite partial input.
test('repeated first-stage errors schedule one correction and preserve partially filled correction', () => {
  const app = createApp(); app.mount([question()]);
  app.fill({ ans: '9' }); app.context.checkAnswer();
  app.tick(400);
  app.context.checkAnswer(); app.key('Enter'); app.context.focusInput('q_0_ans'); app.context.pressKey('OK');
  app.tick(199); assert.equal(app.state.questions[0].currentStage, 1);
  app.tick(1); assert.equal(app.state.questions[0].currentStage, 2);
  app.fill({ step1: '2' });
  const field = input(app, 'step1');
  app.tick(400);
  assert.equal(input(app, 'step1'), field, 'correction was not rendered again');
  assert.equal(field.getAttribute('data-value'), '2');
  assert.equal(app.state.errorLog.Arithmetic_Sign, 1);
});

for (const correct of [true, false]) test(`exit during ${correct ? 'success' : 'correction'} delay cancels tasks without restarting`, () => {
  const app = createApp(); app.mount([question()]);
  const q = app.state.questions[0];
  app.fill({ ans: correct ? '5' : '9' }); app.context.checkAnswer();
  app.context.triggerExitCheck(); app.context.confirmExit();
  assert.equal(app.pendingCallbacks().length, 0);
  app.tick(10000); app.key('5'); app.key('Enter'); app.context.checkAnswer();
  assert.equal(app.state.currentIndex, 0);
  assert.equal(q.currentStage, 1);
  assert.equal(app.state.isPlaying, false);
  assert.equal(app.el('setup-panel').classList.contains('hidden'), false);
  assert.equal(app.el('result-panel').classList.contains('hidden'), true);
  assert.equal(app.el('stage-2-container').classList.contains('open'), false);
});

for (const correct of [true, false]) test(`even queued old ${correct ? 'success' : 'correction'} callbacks cannot mutate new session`, () => {
  const app = createApp(); app.mount([question()]);
  app.fill({ ans: correct ? '5' : '9' }); app.context.checkAnswer();
  const queued = app.pendingCallbacks();
  app.context.confirmExit(); app.context.startGame();
  const first = app.state.questions[0];
  queued.forEach(callback => callback()); // Model callbacks already queued before cancellation.
  assert.equal(app.state.currentIndex, 0);
  assert.equal(app.state.questions[0], first);
  assert.equal(first.currentStage, 1);
  assert.equal(app.state.goldenStars, 0);
  assert.equal(app.el('stage-2-container').classList.contains('open'), false);
  assert.equal(app.el('feedback-banner').classList.contains('hidden'), true);
  app.tick(5000); assert.equal(app.state.currentIndex, 0);
});

test('last question completes once; result has no pending tasks; immediate restart is isolated', () => {
  const app = createApp(); app.mount([question()]);
  app.fill({ ans: '5' }); app.context.checkAnswer();
  const queued = app.pendingCallbacks();
  app.context.checkAnswer(); app.tick(1500);
  assert.equal(app.state.currentIndex, 1); assert.equal(app.state.isPlaying, false);
  assert.equal(app.el('report-perfect').textContent, '1 題');
  assert.equal(app.el('star-rate-text').textContent, '100%');
  assert.equal(app.pendingCallbacks().length, 0);
  const end = app.state.endTime;
  app.context.checkAnswer(); app.key('Enter'); app.tick(5000);
  assert.equal(app.state.endTime, end);
  app.context.startGame(); queued.forEach(callback => callback()); app.tick(5000);
  assert.equal(app.state.currentIndex, 0); assert.equal(app.state.goldenStars, 0);
  assert.equal(app.el('result-panel').classList.contains('hidden'), true);
});

test('direct restart while a transition is pending invalidates the old session', () => {
  const app = createApp(); app.mount([question()]);
  app.fill({ ans: '5' }); app.context.checkAnswer(); app.context.startGame(); app.tick(1500);
  assert.equal(app.state.currentIndex, 0); assert.equal(app.state.goldenStars, 0);
});

for (const stage of [1, 2]) test(`exit modal isolates keyboard, virtual keys, selection and direct submission in stage ${stage}`, () => {
  const app = createApp(); app.mount([question()]);
  if (stage === 2) {
    app.fill({ ans: '9' }); app.context.checkAnswer(); app.tick(850);
    app.fill({ step1: '2', ans2: '5' }); app.context.focusInput('q_0_ans2');
  } else app.fill({ ans: '5' });
  const name = stage === 1 ? 'ans' : 'ans2';
  const active = app.state.activeInputId;
  app.context.triggerExitCheck();
  assert.equal(app.el('exit-modal').classList.contains('hidden'), false);
  for (const key of ['7', '-', '.', 'Backspace', 'Enter']) app.key(key);
  app.context.pressKey('7'); app.context.pressKey('OK'); app.context.checkAnswer();
  app.context.focusInput('q_0_step1');
  assert.equal(input(app, name).getAttribute('data-value'), '5');
  assert.equal(app.state.activeInputId, active);
  assert.equal(app.state.questions[0].answerState, 'answering');
  app.tick(1600); assert.equal(app.state.currentIndex, 0);
  app.context.hideExitModal();
  app.key('Backspace'); app.key('5'); app.key('Enter'); app.tick(1500);
  assert.equal(app.state.currentIndex, 1);
  assert.equal(app.state.goldenStars, stage === 1 ? 1 : 0);
});

test('cancel modal after correction expands restores usable input without clearing it', () => {
  const app = createApp(); app.mount([question()]);
  app.fill({ ans: '9' }); app.context.checkAnswer(); app.context.triggerExitCheck();
  app.tick(1000);
  assert.equal(app.state.activeInputId, null);
  app.context.hideExitModal();
  assert.equal(app.state.activeInputId, 'q_0_step1');
  app.key('2'); assert.equal(input(app, 'step1').getAttribute('data-value'), '2');
  app.context.focusInput('q_0_ans2'); app.context.pressKey('5'); app.context.pressKey('OK'); app.tick(1500);
  assert.equal(app.state.currentIndex, 1); assert.equal(app.state.goldenStars, 0);
});

test('success transition may finish with modal open, then result closes modal and ignores input', () => {
  const app = createApp(); app.mount([question()]);
  app.fill({ ans: '5' }); app.context.checkAnswer(); app.context.triggerExitCheck(); app.tick(1500);
  assert.equal(app.state.exitModalOpen, false);
  assert.equal(app.el('exit-modal').classList.contains('hidden'), true);
  app.key('Enter'); assert.equal(app.state.goldenStars, 1);
});

test('old focus, geometry drawing and nested feedback callbacks are cancelled on exit', () => {
  const app = createApp(); let scrolls = 0, drawings = 0;
  app.context.drawQuestionTriangle = () => { drawings++; };
  app.mount([question({ category: 'Common_Sense_Geometry', geomParams: { sideA: 3, sideB: 4, sideC: 'x', unknown: 'hypotenuse' } })]);
  input(app).scrollIntoView = () => { scrolls++; };
  app.context.confirmExit(); app.tick(5000);
  assert.equal(drawings, 0); assert.equal(scrolls, 0);
  app.mount([question()]);
  app.fill({ ans: '9' }); app.context.checkAnswer(); app.tick(3500);
  assert.equal(app.el('feedback-banner').classList.contains('opacity-0'), true);
  app.context.confirmExit(); assert.equal(app.pendingCallbacks().length, 0);
  app.context.selectDifficulty(2); app.context.startGame(); app.fill({ ans: '99999' }); app.context.checkAnswer();
  app.tick(200); assert.equal(app.el('feedback-banner').classList.contains('hidden'), false);
});

test('modal stays isolated across a normal question transition and cancel restores the new question', () => {
  const app = createApp(); app.mount([question(), question()]);
  app.fill({ ans: '5' }); app.context.checkAnswer(); app.context.triggerExitCheck(); app.tick(1500);
  assert.equal(app.state.currentIndex, 1);
  assert.equal(app.state.exitModalOpen, true);
  app.key('9'); app.key('Enter');
  assert.equal(input(app).getAttribute('data-value'), null);
  assert.equal(app.state.questions[1].firstTry, true);
  app.context.hideExitModal();
  assert.equal(app.state.activeInputId, 'q_1_ans');
  app.key('5'); app.key('Enter'); app.tick(1500);
  assert.equal(app.state.goldenStars, 2);
  assert.equal(app.el('report-perfect').textContent, '2 題');
});
