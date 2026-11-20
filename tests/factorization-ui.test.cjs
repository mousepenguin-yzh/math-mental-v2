const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./helpers/app.cjs');
const { solvePrompt } = require('./helpers/factorization-oracle.cjs');

function startFactorization(seed = 42, count = 10) {
  const app = createApp(seed);
  app.context.selectDifficulty('factorization');
  app.context.selectCount(count);
  app.context.startGame();
  return app;
}

function wrongCardPair(q) {
  for (let i = 0; i < q.cards.length; i++) {
    for (let j = i + 1; j < q.cards.length; j++) {
      if (!(q.correctPair.includes(i) && q.correctPair.includes(j))) return [i, j];
    }
  }
  throw new Error('No wrong card pair found');
}

function solveStage2Step(app, q, step, { useSolution = false } = {}) {
  const spec = q.stage2Ans[step.key];
  const { answer } = solvePrompt(q.formula);

  if (useSolution && step.solution) {
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (spec.type === 'cross-check') {
        const [w0, w1] = wrongCardPair(q);
        app.context.clearSelectedFactorCards();
        app.context.toggleFactorCard(2, w0);
        app.context.toggleFactorCard(2, w1);
        app.context.checkAnswer();
        // If this wrong pair happens to pass leading+constant, submit a wrong middle arithmetic
        if (q.correction.crossState.pairChecked) {
          app.fill({ crossMid: '999' });
          app.context.checkAnswer();
        }
      } else if (spec.type === 'monomial') {
        app.fill({ [step.key]: '99x' });
        app.context.checkAnswer();
      } else if (spec.type === 'sum-product') {
        app.fill({ [`${step.key}_0`]: '999', [`${step.key}_1`]: '999' });
        app.context.checkAnswer();
      } else {
        app.fill({ [step.key]: String(spec.expected + 99) });
        app.context.checkAnswer();
      }
    }
    app.context.revealFactorStepSolution(step.key);
  }

  if (spec.type === 'cross-check') {
    app.context.clearSelectedFactorCards();
    app.context.toggleFactorCard(2, q.correctPair[1]);
    app.context.toggleFactorCard(2, q.correctPair[0]);
    app.context.checkAnswer(); // Passes leading & constant -> opens crossMid
    app.fill({ crossMid: String(spec.expectedMiddle) });
    app.context.checkAnswer();
  } else if (spec.type === 'monomial') {
    const gcf = spec.expected.coefficient === 1 ? 'x' : `${spec.expected.coefficient}x`;
    app.fill({ [step.key]: gcf });
    app.context.checkAnswer();
  } else if (spec.type === 'sum-product') {
    const { small, large } = solvePrompt(q.formula);
    app.fill({ [`${step.key}_0`]: String(large), [`${step.key}_1`]: String(small) });
    app.context.checkAnswer();
  } else if (spec.type === 'integer') {
    app.fill({ [step.key]: String(spec.expected) });
    app.context.checkAnswer();
  } else if (spec.type === 'factorization') {
    app.fill({ [step.key]: answer });
    app.context.checkAnswer();
  }
}

test('level 7 supports 10/20/30 questions with exact 40%/40%/20% difficulty distribution', () => {
  for (const [count, expected] of [
    [10, { basic: 4, medium: 4, challenge: 2 }],
    [20, { basic: 8, medium: 8, challenge: 4 }],
    [30, { basic: 12, medium: 12, challenge: 6 }],
  ]) {
    const app = startFactorization(42, count);
    assert.equal(app.state.questions.length, count);
    assert.equal(app.el('difficulty-label').textContent, '因式分解特訓');
    for (const [band, quota] of Object.entries(expected)) {
      const actual = app.state.questions.filter(q => q.difficultyBand === band).length;
      assert.equal(actual, quota, `count=${count}, band=${band}`);
    }
    assert.ok(app.state.questions.every(q => q.levelId === 'factorization'));
  }
});

test('unified 5-column math keyboard serves all non-card level 7 inputs while levels 1-6 preserve 4-column standard keyboard', () => {
  const app = startFactorization(42, 10);
  const comp = app.state.questions.find(q => q.subtype === 'common-composite');
  const monic = app.state.questions.find(q => q.subtype === 'monic');
  const cross = app.state.questions.find(q => q.subtype === 'cross');
  assert.ok(comp && monic && cross);
  app.mount([comp, monic, cross]);

  // Q0 Stage 1 (factorization) -> 5-column keyboard with all symbol keys enabled
  assert.equal(app.el('keyboard-factorization').classList.contains('hidden'), false);
  assert.equal(app.el('keyboard-standard').classList.contains('hidden'), true);
  assert.equal(app.el('keyboard-cards').classList.contains('hidden'), true);
  for (const id of ['key-fac-x', 'key-fac-lparen', 'key-fac-rparen', 'key-fac-plus', 'key-fac-square']) {
    assert.equal(app.el(id).disabled, false, id);
  }

  // Virtual & physical keys support x, parentheses, +, -, ², ^, Clear, Backspace; ignore . and √
  for (const k of ['(', 'x', '-', '3', ')', '²']) app.context.pressKey(k);
  const ansEl = app.document.querySelector('[data-input-id="q_0_ans"]');
  assert.equal(ansEl.getAttribute('data-value'), '(x-3)²');
  app.context.pressKey('.');
  app.context.pressKey('√');
  assert.equal(ansEl.getAttribute('data-value'), '(x-3)²');
  app.context.pressKey('Backspace');
  assert.equal(ansEl.getAttribute('data-value'), '(x-3)');
  app.key('X'); app.key('+'); app.key('2'); app.key('−'); app.key('1'); app.key('^'); app.key('2');
  assert.equal(ansEl.getAttribute('data-value'), '(x-3)x+2-1^2');
  app.context.pressKey('Clear');
  assert.equal(ansEl.getAttribute('data-value'), '');

  // Q0 Stage 2 (monomial GCF step) -> STAYS on 5-column keyboard! x & ² enabled; (, ), + disabled
  app.fill({ ans: '(x+99)(x+99)' });
  app.context.checkAnswer();
  app.tick(600);
  assert.equal(app.el('keyboard-factorization').classList.contains('hidden'), false);
  assert.equal(app.el('keyboard-standard').classList.contains('hidden'), true);
  assert.equal(app.el('key-fac-x').disabled, false);
  assert.equal(app.el('key-fac-square').disabled, false);
  assert.equal(app.el('key-fac-lparen').disabled, true);
  assert.equal(app.el('key-fac-rparen').disabled, true);
  assert.equal(app.el('key-fac-plus').disabled, true);
  for (const step of comp.steps) solveStage2Step(app, comp, step);
  app.tick(1500);

  // Q1 Stage 2 (monic numberPair = integer inputs) -> STAYS on 5-column keyboard (NO switch to 4-column!),
  // with x, (, ), ² disabled and numeric validation strictly enforced!
  app.fill({ ans: '(x+99)(x+99)' });
  app.context.checkAnswer();
  app.tick(600);
  assert.equal(app.el('keyboard-factorization').classList.contains('hidden'), false);
  assert.equal(app.el('keyboard-standard').classList.contains('hidden'), true);
  assert.equal(app.el('key-fac-x').disabled, true);
  assert.equal(app.el('key-fac-lparen').disabled, true);
  assert.equal(app.el('key-fac-rparen').disabled, true);
  assert.equal(app.el('key-fac-square').disabled, true);
  assert.equal(app.el('key-fac-plus').disabled, false);
  // Attempting to press x, (, ) on integer field is ignored; - toggles leading sign; + clears negative
  app.context.pressKey('x'); app.context.pressKey('('); app.context.pressKey('2'); app.context.pressKey('-');
  assert.equal(app.document.querySelector('[data-input-id="q_1_numberPair_0"]').getAttribute('data-value'), '-2');
  app.context.pressKey('+');
  assert.equal(app.document.querySelector('[data-input-id="q_1_numberPair_0"]').getAttribute('data-value'), '2');
  for (const step of monic.steps) solveStage2Step(app, monic, step);
  app.tick(1500);

  // Q2 (cross) Stage 1 -> card bar
  assert.equal(app.state.currentIndex, 2);
  assert.equal(app.el('keyboard-cards').classList.contains('hidden'), false);
  assert.equal(app.el('keyboard-factorization').classList.contains('hidden'), true);
  assert.equal(app.el('keyboard-standard').classList.contains('hidden'), true);

  // Switch back to Level 6 (radicals) and Level 1 (legacy) -> 4-column standard keyboard restored cleanly
  app.context.confirmExit();
  app.context.selectDifficulty('radicals');
  app.context.startGame();
  assert.equal(app.el('keyboard-standard').classList.contains('hidden'), false);
  assert.equal(app.el('keyboard-factorization').classList.contains('hidden'), true);
  assert.equal(app.el('keyboard-cards').classList.contains('hidden'), true);
  assert.equal(app.el('key-aux').getAttribute('data-key'), '√');

  app.context.confirmExit();
  app.context.selectDifficulty(1);
  app.context.startGame();
  assert.equal(app.el('keyboard-standard').classList.contains('hidden'), false);
  assert.equal(app.el('key-aux').getAttribute('data-key'), '.');
});

test('GCF correction asks directly for full monomial (e.g. 2x or x), rejects partial/non-monomial, then requires full factorization', () => {
  const app = startFactorization(42, 10);
  const common = app.state.questions.find(q => q.subtype === 'common');
  const comp = app.state.questions.find(q => q.subtype === 'common-composite');
  assert.ok(common && comp);
  app.mount([comp, common]);

  // Q0: common-composite (e.g. 4x²+10x -> GCF 2x -> 2x(2x+5))
  const expectedCoeff = comp.stage2Ans.gcf.expected.coefficient;
  const expectedGcf = `${expectedCoeff}x`;
  assert.deepEqual(comp.steps.map(s => s.key), ['gcf', 'ans2']);
  app.fill({ ans: '(x+99)(x+99)' });
  app.context.checkAnswer();
  app.tick(600);
  const stage2Area = app.el('stage-2-input-area');
  assert.match(stage2Area.innerHTML, /最大公因式（含數字與 x）/);
  assert.doesNotMatch(stage2Area.innerHTML, /data-factor-step="ans2"/);

  // Non-monomial syntax error -> rejected without consuming hint attempt
  app.fill({ gcf: `${expectedGcf}+1` });
  app.context.checkAnswer();
  assert.equal(comp.correction.stepState.gcf.wrongCount, 0);
  assert.match(app.el('feedback-banner').innerHTML, /單項最大公因式/);

  // Attempt 1: numeric only (forgot x) -> Hint 1
  app.fill({ gcf: String(expectedCoeff) });
  app.context.checkAnswer();
  assert.equal(comp.correction.stepState.gcf.wrongCount, 1);
  assert.match(app.el('feedback-banner').innerHTML, /共同含有的 x/);
  assert.match(stage2Area.innerHTML, /data-hint-level="1"/);

  // Attempt 2: x only (forgot numeric GCD) -> Hint 2
  app.fill({ gcf: 'x' });
  app.context.checkAnswer();
  assert.equal(comp.correction.stepState.gcf.wrongCount, 2);
  assert.match(app.el('feedback-banner').innerHTML, /最大公因數/);
  assert.match(stage2Area.innerHTML, /data-hint-level="2"/);
  assert.doesNotMatch(stage2Area.innerHTML, /data-solution-btn="gcf"/);

  // Attempt 3: degree too high (2x²) -> Hint 3 + unlocks active solution button
  app.fill({ gcf: `${expectedCoeff}x²` });
  app.context.checkAnswer();
  assert.equal(comp.correction.stepState.gcf.wrongCount, 3);
  assert.match(stage2Area.innerHTML, /data-hint-level="3"/);
  assert.match(stage2Area.innerHTML, /data-solution-btn="gcf"/);
  assert.doesNotMatch(stage2Area.innerHTML, /data-solution-box="gcf"/);

  // Reveal solution -> marks usedSolution, still requires submitting GCF and ans2
  app.context.revealFactorStepSolution('gcf');
  assert.equal(comp.correction.usedSolution, true);
  assert.match(stage2Area.innerHTML, /data-solution-box="gcf"/);

  // Submit exact GCF -> unlocks ans2 immediately (only 2 steps total!)
  app.fill({ gcf: expectedGcf });
  app.context.checkAnswer();
  assert.equal(comp.correction.unlockedIndex, 1);
  assert.match(stage2Area.innerHTML, /data-factor-step="ans2"/);
  app.fill({ ans2: solvePrompt(comp.formula).answer });
  app.context.checkAnswer();
  assert.equal(comp.outcome, 'solution-guided');
  app.tick(1500);

  // Q1: common (e.g. x²−6x -> GCF x -> x(x-6))
  app.fill({ ans: '(x+99)(x+99)' });
  app.context.checkAnswer();
  app.tick(600);
  app.fill({ gcf: 'x' });
  app.context.checkAnswer();
  assert.equal(common.correction.unlockedIndex, 1);
  app.fill({ ans2: solvePrompt(common.formula).answer });
  app.context.checkAnswer();
  assert.equal(common.outcome, 'guided');
});

test('cross-multiplication Stage 2 guides leading -> constant -> local cross-term sum without misjudging correct local arithmetic', () => {
  // Locate the exact 2x²+5x−12 question from the real generator
  let targetQ = null;
  let foundApp = null;
  for (let seed = 1; seed <= 500 && !targetQ; seed++) {
    const candidateApp = startFactorization(seed, 30);
    const match = candidateApp.state.questions.find(q => q.formula === '2x²+5x−12');
    if (match) { targetQ = match; foundApp = candidateApp; }
  }
  assert.ok(targetQ && foundApp, 'Expected 2x²+5x−12');

  const cloneQ = () => JSON.parse(JSON.stringify(targetQ));
  const qA = cloneQ();
  const qB = cloneQ();
  foundApp.mount([qA, qB]);

  const idx = (q, label) => q.cards.indexOf(label);

  // --- Q0: Stage 1 fails with (x+4)(x−4) -> immediate leading & constant diagnostic ---
  foundApp.context.toggleFactorCard(1, idx(qA, 'x+4'));
  foundApp.context.toggleFactorCard(1, idx(qA, 'x−4'));
  foundApp.context.checkAnswer();
  foundApp.tick(600);
  const stage2Area = foundApp.el('stage-2-input-area');
  assert.equal(qA.currentStage, 2);
  assert.equal(qA.correction.crossState.pairChecked, false);
  assert.equal(foundApp.el('keyboard-cards').classList.contains('hidden'), false);
  assert.match(stage2Area.innerHTML, /data-cross-diagnostic="true"/);
  assert.match(stage2Area.innerHTML, /x²/);
  assert.match(stage2Area.innerHTML, /−16/);

  // Re-submitting (x+4)(x−4) increments hint level (Hint 1) and explains leading+constant failure
  foundApp.context.checkAnswer();
  assert.equal(qA.correction.stepState.crossCheck.wrongCount, 1);
  assert.match(stage2Area.innerHTML, /data-hint-level="1"/);

  // Switch cards to (2x+3)(x−4) -> leading 2x² ✓, constant −12 ✓ -> opens ③ crossMid with 5-column keyboard
  foundApp.context.clearSelectedFactorCards();
  foundApp.context.toggleFactorCard(2, idx(qA, '2x+3'));
  foundApp.context.toggleFactorCard(2, idx(qA, 'x−4'));
  foundApp.context.checkAnswer();
  assert.equal(qA.correction.crossState.pairChecked, true);
  assert.equal(foundApp.state.activeInputId, 'q_0_crossMid');
  assert.equal(foundApp.el('keyboard-factorization').classList.contains('hidden'), false);
  assert.equal(foundApp.el('keyboard-cards').classList.contains('hidden'), true);
  assert.equal(foundApp.el('key-fac-x').disabled, true);
  assert.equal(qA.correction.stepState.crossCheck.wrongCount, 1); // passing leading/constant is NOT a failure!

  // Student miscalculates (2x+3)(x−4) cross term as +5 -> caught as arithmetic error (Hint 2)
  foundApp.fill({ crossMid: '5' });
  foundApp.context.checkAnswer();
  assert.equal(qA.correction.stepState.crossCheck.wrongCount, 2);
  assert.equal(qA.correction.crossState.pairChecked, true);
  assert.match(foundApp.el('feedback-banner').innerHTML, /算錯了/);
  assert.match(stage2Area.innerHTML, /data-hint-level="2"/);

  // Student correctly calculates (2x+3)(x−4) cross term as -5 -> praised as right arithmetic, explains ≠ +5, returns to card selection!
  foundApp.fill({ crossMid: '-5' });
  foundApp.context.checkAnswer();
  assert.equal(qA.correction.crossState.pairChecked, false);
  assert.equal(foundApp.el('keyboard-cards').classList.contains('hidden'), false);
  assert.match(foundApp.el('feedback-banner').innerHTML, /算對了/);
  assert.match(stage2Area.innerHTML, /data-cross-mismatch="true"/);
  assert.match(stage2Area.innerHTML, /data-hint-level="3"/);
  assert.match(stage2Area.innerHTML, /data-solution-btn="crossCheck"/);

  // Swap to winning pair (2x−3)(x+4), pass ①/②, compute +5 -> unlocks ans2!
  foundApp.context.clearSelectedFactorCards();
  foundApp.context.toggleFactorCard(2, idx(qA, '2x−3'));
  foundApp.context.toggleFactorCard(2, idx(qA, 'x+4'));
  foundApp.context.checkAnswer();
  assert.equal(qA.correction.crossState.pairChecked, true);
  foundApp.fill({ crossMid: '5' });
  foundApp.context.checkAnswer();
  assert.equal(qA.correction.unlockedIndex, 1);
  assert.equal(foundApp.state.activeInputId, 'q_0_ans2');
  assert.equal(foundApp.el('keyboard-factorization').classList.contains('hidden'), false);
  assert.equal(foundApp.el('key-fac-x').disabled, false);

  // Must still type complete factorization in ans2 (cannot finish by cards alone!)
  foundApp.fill({ ans2: '(2x-3)(x+4)' });
  foundApp.context.checkAnswer();
  assert.equal(qA.outcome, 'guided');
  foundApp.tick(1500);

  // --- Q1: Stage 1 fails with (2x+3)(x−4) (leading & constant ALREADY match!) -> Stage 2 opens directly at ③ crossMid ---
  foundApp.context.toggleFactorCard(1, idx(qB, '2x+3'));
  foundApp.context.toggleFactorCard(1, idx(qB, 'x−4'));
  foundApp.context.checkAnswer();
  foundApp.tick(600);
  assert.equal(qB.correction.crossState.pairChecked, true);
  assert.equal(foundApp.state.activeInputId, 'q_1_crossMid');
  assert.equal(foundApp.el('keyboard-factorization').classList.contains('hidden'), false);

  // Tapping a card while crossMid is open cleanly switches back to card selection!
  foundApp.context.toggleFactorCard(2, idx(qB, '2x+3'));
  assert.equal(qB.correction.crossState.pairChecked, false);
  assert.equal(foundApp.el('keyboard-cards').classList.contains('hidden'), false);
  assert.equal(foundApp.state.activeInputId, null);
});

test('Stage 1 accepts exact equivalent factorizations; invalid keeps firstTry; equivalent-not-factored loses star but allows self-correction', () => {
  const app = startFactorization(42, 10);
  const twoStep = app.state.questions.find(q => q.subtype === 'two-step');
  const square = app.state.questions.find(q => q.subtype === 'square');
  assert.ok(twoStep && square);
  app.mount([square, twoStep]);

  for (const bad of ['', '(', '(x+', 'x/2', 'x'.repeat(161)]) {
    app.fill({ ans: bad });
    app.context.checkAnswer();
    app.tick(600);
    assert.equal(square.firstTry, true, bad);
    assert.equal(square.currentStage, 1, bad);
    assert.equal(Object.keys(app.state.errorLog).length, 0);
  }
  const { b } = solvePrompt(square.formula);
  const sqExpr = b < 0 ? `(x-${Math.abs(b)})²` : `(x+${b})²`;
  app.fill({ ans: sqExpr });
  app.context.checkAnswer();
  assert.equal(app.state.goldenStars, 1);
  assert.equal(square.outcome, 'first-try');
  app.tick(1500);

  assert.equal(app.state.currentIndex, 1);
  const { content, large, answer } = solvePrompt(twoStep.formula);
  app.fill({ ans: `${content}(x²-${large * large})` });
  app.context.checkAnswer();
  app.tick(1000);
  assert.equal(twoStep.currentStage, 1);
  assert.equal(twoStep.answerState, 'answering');
  assert.equal(twoStep.firstTry, false);
  assert.equal(twoStep.enteredStage2, false);
  assert.equal(Object.keys(app.state.errorLog).length, 0);
  assert.match(app.el('feedback-banner').innerHTML, /沒有分解完全/);

  app.fill({ ans: answer });
  app.context.checkAnswer();
  assert.equal(app.state.goldenStars, 1);
  assert.equal(twoStep.outcome, 'self-corrected');
  app.tick(1500);
  assert.equal(app.el('report-perfect').textContent, '1 題');
  assert.equal(app.el('report-self-corrected').textContent, '1 題');
  assert.equal(app.el('report-guided').textContent, '0 題');
  assert.equal(app.el('report-solution-guided').textContent, '0 題');
});

test('Challenge 6-card selection requires explicit confirmation, never auto-submits, and grades accurately', () => {
  const app = startFactorization(42, 10);
  const crosses = app.state.questions.filter(q => q.subtype === 'cross');
  assert.equal(crosses.length, 2);
  app.mount(crosses);

  const q0 = crosses[0];
  app.context.toggleFactorCard(1, q0.correctPair[0]);
  app.context.checkAnswer();
  assert.equal(q0.firstTry, true);
  assert.equal(q0.answerState, 'answering');

  app.context.toggleFactorCard(1, q0.correctPair[1]);
  assert.equal(q0.answerState, 'answering');
  assert.equal(app.state.goldenStars, 0);
  assert.match(app.el('cards-status-text').textContent, /已選 2 \/ 2/);

  const extraIdx = [0, 1, 2, 3, 4, 5].find(i => !q0.correctPair.includes(i));
  app.context.toggleFactorCard(1, extraIdx);
  assert.deepEqual([...q0.stage1SelectedCards], [...q0.correctPair]);

  app.context.toggleFactorCard(1, q0.correctPair[0]);
  app.context.toggleFactorCard(1, q0.correctPair[0]);
  app.key('Enter');
  assert.equal(q0.answerState, 'completed');
  assert.equal(q0.outcome, 'first-try');
  assert.equal(app.state.goldenStars, 1);
  app.tick(1500);

  const q1 = crosses[1];
  const [w0, w1] = wrongCardPair(q1);
  app.context.toggleFactorCard(1, w0);
  app.context.toggleFactorCard(1, w1);
  assert.equal(q1.answerState, 'answering');
  app.context.pressKey('OK');
  assert.equal(q1.answerState, 'opening-correction');
  assert.equal(q1.firstTry, false);
  assert.equal(app.state.errorLog.Factorization_Cross, 1);
  app.tick(600);
  assert.equal(q1.currentStage, 2);
  assert.equal(app.el('stage-2-container').classList.contains('open'), true);
});

test('4-category outcome report distinguishes firstTry, selfCorrected, guided, and solutionGuided without double counting', () => {
  const app = startFactorization(42, 10);
  const qs = app.state.questions;
  const nonCrossPlan = ['first-try', 'first-try', 'self-corrected', 'self-corrected', 'guided', 'guided', 'solution-guided', 'solution-guided'];
  const crossPlan = ['first-try', 'solution-guided'];
  let ncIdx = 0, cIdx = 0;

  for (let i = 0; i < qs.length; i++) {
    assert.equal(app.state.currentIndex, i);
    const q = qs[i];
    const mode = q.subtype === 'cross' ? crossPlan[cIdx++] : nonCrossPlan[ncIdx++];
    const { answer } = solvePrompt(q.formula);

    if (mode === 'first-try') {
      if (q.subtype === 'cross') {
        app.context.toggleFactorCard(1, q.correctPair[0]);
        app.context.toggleFactorCard(1, q.correctPair[1]);
      } else {
        app.fill({ ans: answer });
      }
      app.context.checkAnswer();
      app.tick(1500);
    } else if (mode === 'self-corrected') {
      app.fill({ ans: q.formula });
      app.context.checkAnswer();
      assert.equal(q.currentStage, 1);
      app.fill({ ans: answer });
      app.context.checkAnswer();
      app.tick(1500);
    } else {
      if (q.subtype !== 'cross' && mode === 'guided') {
        app.fill({ ans: q.formula });
        app.context.checkAnswer();
      }
      if (q.subtype === 'cross') {
        const [w0, w1] = wrongCardPair(q);
        app.context.toggleFactorCard(1, w0);
        app.context.toggleFactorCard(1, w1);
      } else {
        app.fill({ ans: '(x+99)(x+99)' });
      }
      app.context.checkAnswer();
      app.tick(600);
      for (const step of q.steps) {
        solveStage2Step(app, q, step, { useSolution: mode === 'solution-guided' });
      }
      app.tick(1500);
    }
  }

  assert.equal(app.el('result-panel').classList.contains('hidden'), false);
  assert.equal(app.state.goldenStars, 3);
  assert.equal(app.el('star-rate-text').textContent, '30%');
  assert.equal(app.el('report-total').textContent, '10 題');
  assert.equal(app.el('report-perfect').textContent, '3 題');
  assert.equal(app.el('report-self-corrected').textContent, '2 題');
  assert.equal(app.el('report-guided').textContent, '2 題');
  assert.equal(app.el('report-solution-guided').textContent, '3 題');
  const sum = app.state.reportSummary.firstTry + app.state.reportSummary.selfCorrected
    + app.state.reportSummary.guided + app.state.reportSummary.solutionGuided;
  assert.equal(sum, 10);
});

test('all 8 factorization templates complete Stage 2 end-to-end including numberPair unordered step & reopen step', () => {
  const app = startFactorization(42, 30);
  const bySubtype = new Map();
  for (const q of app.state.questions) {
    if (!bySubtype.has(q.subtype)) bySubtype.set(q.subtype, q);
  }
  const allEight = [...bySubtype.values()];
  assert.equal(allEight.length, 8);
  app.mount(allEight);

  for (let i = 0; i < allEight.length; i++) {
    assert.equal(app.state.currentIndex, i);
    const q = allEight[i];
    if (q.subtype === 'cross') {
      const [w0, w1] = wrongCardPair(q);
      app.context.toggleFactorCard(1, w0);
      app.context.toggleFactorCard(1, w1);
    } else {
      app.fill({ ans: '(x+99)(x+99)' });
    }
    app.context.checkAnswer();
    app.tick(600);
    for (const step of q.steps) solveStage2Step(app, q, step);
    app.tick(1500);
  }
  assert.equal(app.el('report-total').textContent, '8 題');
  assert.equal(app.el('report-guided').textContent, '8 題');

  // Reopen step clears subsequent step responses & preserves usedSolution
  const reopenApp = startFactorization(42, 10);
  const twoStep = reopenApp.state.questions.find(q => q.subtype === 'two-step');
  reopenApp.mount([twoStep]);
  reopenApp.fill({ ans: '(x+99)(x+99)' });
  reopenApp.context.checkAnswer();
  reopenApp.tick(600);
  solveStage2Step(reopenApp, twoStep, twoStep.steps[0], { useSolution: true });
  reopenApp.fill({ squareRoot: String(twoStep.stage2Ans.squareRoot.expected) });
  reopenApp.context.reopenFactorizationStep(0);
  assert.equal(twoStep.correction.unlockedIndex, 0);
  assert.equal(twoStep.correction.responses.squareRoot, undefined);
  assert.equal(twoStep.correction.usedSolution, true);
});

test('factorization lifecycle: duplicate submit, exit modal isolation in Stage 1/2, and exit/restart timer isolation', () => {
  const app = startFactorization(42, 10);
  const basic = app.state.questions.find(q => q.subtype === 'common-composite');
  const cross = app.state.questions.find(q => q.subtype === 'cross');
  app.mount([basic, cross]);

  // Duplicate submit on Stage 1 completes once
  app.fill({ ans: solvePrompt(basic.formula).answer });
  app.context.checkAnswer();
  for (let i = 0; i < 4; i++) {
    app.context.pressKey('OK');
    app.key('Enter');
    app.context.checkAnswer();
  }
  assert.equal(app.state.goldenStars, 1);
  app.tick(1500);

  // Exit modal isolates card taps, clear, and submit on challenge card question
  app.context.toggleFactorCard(1, cross.correctPair[0]);
  app.context.triggerExitCheck();
  app.context.toggleFactorCard(1, cross.correctPair[1]);
  app.context.clearSelectedFactorCards();
  app.key('Enter');
  assert.deepEqual([...cross.stage1SelectedCards], [cross.correctPair[0]]);
  app.context.hideExitModal();
  assert.equal(app.el('keyboard-cards').classList.contains('hidden'), false);

  // Trigger Stage 2 under exit modal, then cancel -> card bar / input restored cleanly
  const [w0, w1] = wrongCardPair(cross);
  app.context.clearSelectedFactorCards();
  app.context.toggleFactorCard(1, w0);
  app.context.toggleFactorCard(1, w1);
  app.context.checkAnswer();
  const pending = app.pendingCallbacks();
  app.context.confirmExit();
  assert.equal(app.pendingCallbacks().length, 0);
  app.context.selectDifficulty('factorization');
  app.context.selectCount(10);
  app.context.startGame();
  const fresh = app.state.questions[0];
  pending.forEach(fn => fn());
  app.tick(3000);
  assert.equal(app.state.currentIndex, 0);
  assert.equal(app.state.questions[0], fresh);
  assert.equal(fresh.currentStage, 1);
  assert.equal(app.state.goldenStars, 0);
  assert.equal(app.el('stage-2-container').classList.contains('open'), false);
});
