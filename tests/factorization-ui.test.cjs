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
    // 3 wrong attempts unlock hints 1..3 and solution button; solution is hidden until clicked.
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (spec.type === 'card-pair') {
        const [w0, w1] = wrongCardPair(q);
        app.context.clearSelectedFactorCards();
        app.context.toggleFactorCard(2, w0);
        app.context.toggleFactorCard(2, w1);
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

  if (spec.type === 'card-pair') {
    app.context.clearSelectedFactorCards();
    app.context.toggleFactorCard(2, q.correctPair[1]);
    app.context.toggleFactorCard(2, q.correctPair[0]);
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

test('math keyboard switches cleanly between factorization, card selection, integer step, radical, and legacy modes', () => {
  const app = startFactorization(42, 10);
  // Find a non-cross question and a cross question from seed 42
  const nonCross = app.state.questions.find(q => q.subtype !== 'cross');
  const cross = app.state.questions.find(q => q.subtype === 'cross');
  app.mount([nonCross, cross]);

  // Basic/medium Stage 1 -> factorization keyboard
  assert.equal(app.el('keyboard-factorization').classList.contains('hidden'), false);
  assert.equal(app.el('keyboard-standard').classList.contains('hidden'), true);
  assert.equal(app.el('keyboard-cards').classList.contains('hidden'), true);

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

  // Enter wrong answer to open Stage 2 integer/sum-product step -> standard keyboard with disabled aux key
  app.fill({ ans: '(x+99)(x+99)' });
  app.context.checkAnswer();
  app.tick(600);
  assert.equal(app.state.questions[0].currentStage, 2);
  assert.equal(app.el('keyboard-standard').classList.contains('hidden'), false);
  assert.equal(app.el('keyboard-factorization').classList.contains('hidden'), true);
  assert.equal(app.el('key-aux').disabled, true);
  assert.equal(app.el('key-aux').getAttribute('data-state'), 'disabled');

  // Complete intermediate step(s) to unlock ans2 -> switches back to factorization keyboard
  for (const step of nonCross.steps.slice(0, -1)) solveStage2Step(app, nonCross, step);
  assert.equal(app.state.activeInputId, 'q_0_ans2');
  assert.equal(app.el('keyboard-factorization').classList.contains('hidden'), false);
  assert.equal(app.el('keyboard-standard').classList.contains('hidden'), true);

  // Finish Q0 and advance to Q1 (cross) -> switches to card confirmation bar
  solveStage2Step(app, nonCross, nonCross.steps.at(-1));
  app.tick(1500);
  assert.equal(app.state.currentIndex, 1);
  assert.equal(app.el('keyboard-cards').classList.contains('hidden'), false);
  assert.equal(app.el('keyboard-factorization').classList.contains('hidden'), true);
  assert.equal(app.el('keyboard-standard').classList.contains('hidden'), true);

  // Switch back to Level 6 (radicals) and Level 1 (legacy) -> standard keyboard restored cleanly
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

test('Stage 1 accepts exact equivalent factorizations; invalid keeps firstTry; equivalent-not-factored loses star but allows self-correction', () => {
  const app = startFactorization(42, 10);
  const twoStep = app.state.questions.find(q => q.subtype === 'two-step');
  const square = app.state.questions.find(q => q.subtype === 'square');
  assert.ok(twoStep && square);
  app.mount([square, twoStep]);

  // Q0: square — test invalid syntax/incomplete keeps firstTry, then equivalent repeated factor syntax passes
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

  // Q1: two-step (e.g. 3x²−12) — equivalent-not-factored warns, loses star, stays in Stage 1, no errorLog
  assert.equal(app.state.currentIndex, 1);
  const { content, large, answer } = solvePrompt(twoStep.formula);
  const partial = `${content}(x²-${large * large})`;
  app.fill({ ans: partial });
  app.context.checkAnswer();
  app.tick(1000);
  assert.equal(twoStep.currentStage, 1);
  assert.equal(twoStep.answerState, 'answering');
  assert.equal(twoStep.firstTry, false);
  assert.equal(twoStep.enteredStage2, false);
  assert.equal(Object.keys(app.state.errorLog).length, 0);
  assert.match(app.el('feedback-banner').innerHTML, /沒有分解完全/);

  // Self-correct in Stage 1 -> completes with outcome='self-corrected' and 0 additional stars
  app.fill({ ans: answer });
  app.context.checkAnswer();
  assert.equal(app.state.goldenStars, 1);
  assert.equal(twoStep.outcome, 'self-corrected');
  assert.equal(twoStep.enteredStage2, false);
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
  // Selecting 1 card and submitting is incomplete -> preserves firstTry
  app.context.toggleFactorCard(1, q0.correctPair[0]);
  app.context.checkAnswer();
  assert.equal(q0.firstTry, true);
  assert.equal(q0.answerState, 'answering');

  // Selecting 2nd card MUST NOT auto-submit
  app.context.toggleFactorCard(1, q0.correctPair[1]);
  assert.equal(q0.answerState, 'answering');
  assert.equal(app.state.goldenStars, 0);
  assert.match(app.el('cards-status-text').textContent, /已選 2 \/ 2/);

  // Selecting a 3rd card when 2 are selected is ignored with guidance
  const extraIdx = [0, 1, 2, 3, 4, 5].find(i => !q0.correctPair.includes(i));
  app.context.toggleFactorCard(1, extraIdx);
  assert.deepEqual([...q0.stage1SelectedCards], [...q0.correctPair]);

  // Toggle off and re-select in reversed order, then confirm with Enter
  app.context.toggleFactorCard(1, q0.correctPair[0]);
  app.context.toggleFactorCard(1, q0.correctPair[0]);
  app.key('Enter');
  assert.equal(q0.answerState, 'completed');
  assert.equal(q0.outcome, 'first-try');
  assert.equal(app.state.goldenStars, 1);
  app.tick(1500);

  // Q1: selecting wrong pair and confirming enters Stage 2
  const q1 = crosses[1];
  const [w0, w1] = wrongCardPair(q1);
  app.context.toggleFactorCard(1, w0);
  app.context.toggleFactorCard(1, w1);
  assert.equal(q1.answerState, 'answering'); // still not submitted
  app.context.pressKey('OK');
  assert.equal(q1.answerState, 'opening-correction');
  assert.equal(q1.firstTry, false);
  assert.equal(app.state.errorLog.Factorization_Cross, 1);
  app.tick(600);
  assert.equal(q1.currentStage, 2);
  assert.equal(app.el('stage-2-container').classList.contains('open'), true);
});

test('Stage 2 progressively unlocks steps, escalates 3-level hints, gates solution button, and requires typing final factorization', () => {
  const app = startFactorization(42, 10);
  const comp = app.state.questions.find(q => q.subtype === 'common-composite');
  const monic = app.state.questions.find(q => q.subtype === 'monic');
  const cross = app.state.questions.find(q => q.subtype === 'cross');
  assert.ok(comp && monic && cross);
  app.mount([comp, monic, cross]);

  // --- 1) common-composite: content -> innerConstant -> ans2 ---
  app.fill({ ans: '(x+99)(x+99)' });
  app.context.checkAnswer();
  app.tick(600);
  const stage2Area = app.el('stage-2-input-area');
  // Only Step 1 (content) is revealed; innerConstant and ans2 are NOT rendered yet
  assert.match(stage2Area.innerHTML, /data-factor-step="content"/);
  assert.doesNotMatch(stage2Area.innerHTML, /data-factor-step="innerConstant"/);
  assert.doesNotMatch(stage2Area.innerHTML, /data-factor-step="ans2"/);

  // Attempt to reveal solution early MUST be blocked
  app.context.revealFactorStepSolution('content');
  assert.equal(comp.correction.usedSolution, false);
  assert.doesNotMatch(stage2Area.innerHTML, /data-solution-box/);

  // Wrong attempt 1 -> Hint 1 only, no solution button
  app.fill({ content: '99' }); app.context.checkAnswer();
  assert.match(stage2Area.innerHTML, /data-hint-level="1"/);
  assert.doesNotMatch(stage2Area.innerHTML, /data-hint-level="2"/);
  assert.doesNotMatch(stage2Area.innerHTML, /data-solution-btn="content"/);

  // Wrong attempt 2 -> Hint 1 & 2, still no solution button
  app.fill({ content: '98' }); app.context.checkAnswer();
  assert.match(stage2Area.innerHTML, /data-hint-level="2"/);
  assert.doesNotMatch(stage2Area.innerHTML, /data-hint-level="3"/);
  assert.doesNotMatch(stage2Area.innerHTML, /data-solution-btn="content"/);

  // Wrong attempt 3 -> Hint 1..3 + active solution button, but solution STILL hidden until clicked
  app.fill({ content: '97' }); app.context.checkAnswer();
  assert.match(stage2Area.innerHTML, /data-hint-level="3"/);
  assert.match(stage2Area.innerHTML, /data-solution-btn="content"/);
  assert.doesNotMatch(stage2Area.innerHTML, /data-solution-box="content"/);
  assert.equal(comp.correction.usedSolution, false);

  // Click solution button -> reveals solution, marks usedSolution, step STILL requires answer submission
  app.context.revealFactorStepSolution('content');
  assert.match(stage2Area.innerHTML, /data-solution-box="content"/);
  assert.equal(comp.correction.usedSolution, true);
  assert.equal(comp.correction.unlockedIndex, 0);

  // Submit correct content -> unlocks innerConstant
  app.fill({ content: String(comp.stage2Ans.content.expected) });
  app.context.checkAnswer();
  assert.equal(comp.correction.unlockedIndex, 1);
  assert.match(stage2Area.innerHTML, /data-factor-step="innerConstant"/);
  assert.doesNotMatch(stage2Area.innerHTML, /data-factor-step="ans2"/);

  // Test reopening Step 1 clears Step 2 input and preserves usedSolution=true
  app.fill({ innerConstant: String(comp.stage2Ans.innerConstant.expected) });
  app.context.reopenFactorizationStep(0);
  assert.equal(comp.correction.unlockedIndex, 0);
  assert.equal(comp.correction.responses.innerConstant, undefined);
  assert.equal(comp.correction.usedSolution, true);
  app.fill({ content: String(comp.stage2Ans.content.expected) });
  app.context.checkAnswer();
  app.fill({ innerConstant: String(comp.stage2Ans.innerConstant.expected) });
  app.context.checkAnswer();

  // Now ans2 is unlocked: no solution button allowed, equivalent-not-factored rejected, must type full factorization
  assert.equal(comp.correction.unlockedIndex, 2);
  assert.doesNotMatch(stage2Area.innerHTML, /data-solution-btn="ans2"/);
  app.context.revealFactorStepSolution('ans2');
  assert.doesNotMatch(stage2Area.innerHTML, /data-solution-box="ans2"/);

  app.fill({ ans2: comp.formula });
  app.context.checkAnswer();
  assert.equal(comp.answerState, 'answering');
  assert.match(app.el('feedback-banner').innerHTML, /沒有分解完全/);

  app.fill({ ans2: solvePrompt(comp.formula).answer });
  app.context.checkAnswer();
  assert.equal(comp.answerState, 'completed');
  assert.equal(comp.outcome, 'solution-guided');
  app.tick(1500);

  // --- 2) monic: numberPair unordered step with no partial feedback ---
  assert.equal(app.state.currentIndex, 1);
  app.fill({ ans: '(x+99)(x+99)' });
  app.context.checkAnswer();
  app.tick(600);
  const { small, large, answer: monicAns } = solvePrompt(monic.formula);
  // Single field filled -> incomplete, does NOT bump wrongCount or reveal hints
  app.fill({ numberPair_0: String(small), numberPair_1: '' });
  app.context.checkAnswer();
  assert.equal(monic.correction.stepState.numberPair.wrongCount, 0);
  assert.equal(app.state.activeInputId, 'q_1_numberPair_1');
  // Tab toggles between numberPair_1 and numberPair_0
  app.key('Tab');
  assert.equal(app.state.activeInputId, 'q_1_numberPair_0');
  // One right + one wrong -> whole step wrong, NO emerald per-field feedback, reveals Hint 1
  app.fill({ numberPair_0: String(small), numberPair_1: String(small) });
  app.context.checkAnswer();
  assert.equal(monic.correction.stepState.numberPair.wrongCount, 1);
  assert.doesNotMatch(stage2Area.innerHTML, /border-emerald-500/);
  assert.match(stage2Area.innerHTML, /data-hint-level="1"/);
  // Swapped order passes and unlocks ans2
  app.fill({ numberPair_0: String(large), numberPair_1: String(small) });
  app.context.checkAnswer();
  assert.equal(monic.correction.unlockedIndex, 1);
  app.fill({ ans2: monicAns });
  app.context.checkAnswer();
  assert.equal(monic.outcome, 'guided');
  app.tick(1500);

  // --- 3) cross: cardPair -> crossA -> crossB -> ans2 (must still type final factorization!) ---
  assert.equal(app.state.currentIndex, 2);
  const [w0, w1] = wrongCardPair(cross);
  app.context.toggleFactorCard(1, w0);
  app.context.toggleFactorCard(1, w1);
  app.context.checkAnswer();
  app.tick(600);
  // Wrong card pair in Stage 2 stays on cardPair (crossA not unlocked)
  app.context.toggleFactorCard(2, w0);
  app.context.toggleFactorCard(2, w1);
  app.context.checkAnswer();
  assert.equal(cross.correction.unlockedIndex, 0);
  assert.doesNotMatch(stage2Area.innerHTML, /data-factor-step="crossA"/);
  assert.match(stage2Area.innerHTML, /data-hint-level="1"/);
  // Confirm right card pair -> unlocks crossA, then crossB, then ans2
  app.context.clearSelectedFactorCards();
  app.context.toggleFactorCard(2, cross.correctPair[0]);
  app.context.toggleFactorCard(2, cross.correctPair[1]);
  app.context.checkAnswer();
  assert.equal(cross.correction.unlockedIndex, 1);
  assert.match(stage2Area.innerHTML, /data-factor-step="crossA"/);
  app.fill({ crossA: String(cross.stage2Ans.crossA.expected) });
  app.context.checkAnswer();
  assert.equal(cross.correction.unlockedIndex, 2);
  app.fill({ crossB: String(cross.stage2Ans.crossB.expected) });
  app.context.checkAnswer();
  assert.equal(cross.correction.unlockedIndex, 3);
  assert.equal(app.state.activeInputId, 'q_2_ans2');
  assert.equal(app.el('keyboard-factorization').classList.contains('hidden'), false);
  // Cannot finish by cards alone; must type complete factorization in ans2
  assert.equal(cross.answerState, 'answering');
  app.fill({ ans2: solvePrompt(cross.formula).answer });
  app.context.checkAnswer();
  assert.equal(cross.answerState, 'completed');
  assert.equal(cross.outcome, 'guided');
});

test('4-category outcome report distinguishes firstTry, selfCorrected, guided, and solutionGuided without double counting', () => {
  const app = startFactorization(42, 10);
  const qs = app.state.questions;
  // Plan across the 10 questions:
  // - non-cross questions: assign 2 first-try, 2 self-corrected, 2 guided, 2 solution-guided
  // - 2 cross questions: assign 1 first-try, 1 guided
  // Total = 3 first-try + 2 self-corrected + 3 guided + 2 solution-guided = 10
  const nonCrossPlan = ['first-try', 'first-try', 'self-corrected', 'self-corrected', 'guided', 'guided', 'solution-guided', 'solution-guided'];
  const crossPlan = ['first-try', 'guided'];
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
      app.fill({ ans: q.formula }); // equivalent-not-factored
      app.context.checkAnswer();
      assert.equal(q.currentStage, 1);
      app.fill({ ans: answer });
      app.context.checkAnswer();
      app.tick(1500);
    } else if (mode === 'guided' || mode === 'solution-guided') {
      // Even if a student first triggers equivalent-not-factored before failing into Stage 2,
      // the question MUST only count in Stage 2 (guided or solution-guided), never double-counted.
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
      for (let s = 0; s < q.steps.length; s++) {
        // For solution-guided, use solution on EVERY intermediate step to verify no multi-counting per question
        solveStage2Step(app, q, q.steps[s], { useSolution: mode === 'solution-guided' });
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
  assert.equal(app.el('report-guided').textContent, '3 題');
  assert.equal(app.el('report-solution-guided').textContent, '2 題');
  assert.equal(app.el('report-self-corrected-row').classList.contains('hidden'), false);
  assert.equal(app.el('report-solution-row').classList.contains('hidden'), false);
  assert.equal(app.el('report-guided-label').textContent, '一般訂正完成：');
  const sum = app.state.reportSummary.firstTry + app.state.reportSummary.selfCorrected
    + app.state.reportSummary.guided + app.state.reportSummary.solutionGuided;
  assert.equal(sum, 10);
  assert.match(app.el('diagnosis-text').textContent, /因式|公式|配對|十字交乘/);
});

test('factorization lifecycle: duplicate submit, exit modal isolation, and exit/restart timer isolation', () => {
  // 1) Duplicate submit on Stage 1 (input & card) awards exactly 1 star and advances once
  const app = startFactorization(42, 10);
  const basic = app.state.questions.find(q => q.subtype !== 'cross');
  const cross = app.state.questions.find(q => q.subtype === 'cross');
  app.mount([basic, cross]);

  app.fill({ ans: solvePrompt(basic.formula).answer });
  app.context.checkAnswer();
  for (let i = 0; i < 4; i++) {
    app.context.pressKey('OK');
    app.key('Enter');
    app.context.checkAnswer();
  }
  assert.equal(app.state.goldenStars, 1);
  app.tick(1499); assert.equal(app.state.currentIndex, 0);
  app.tick(1); assert.equal(app.state.currentIndex, 1);

  // 2) Exit modal isolates card clicks, keyboard, clear, and submit on challenge card question
  app.context.toggleFactorCard(1, cross.correctPair[0]);
  app.context.triggerExitCheck();
  app.context.toggleFactorCard(1, cross.correctPair[1]);
  app.context.clearSelectedFactorCards();
  app.key('Enter');
  app.context.pressKey('OK');
  assert.deepEqual([...cross.stage1SelectedCards], [cross.correctPair[0]]);
  assert.equal(cross.answerState, 'answering');

  // Cancel modal restores card selection cleanly without losing first selected card
  app.context.hideExitModal();
  assert.equal(app.el('keyboard-cards').classList.contains('hidden'), false);
  const [w0, w1] = wrongCardPair(cross);
  app.context.clearSelectedFactorCards();
  app.context.toggleFactorCard(1, w0);
  app.context.toggleFactorCard(1, w1);
  app.context.checkAnswer();
  const pending = app.pendingCallbacks();

  // Exit during 600ms correction delay cancels timers; queued old callbacks cannot mutate new session
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

test('all 8 factorization templates complete Stage 2 end-to-end; 100% and self-corrected-only diagnoses work', () => {
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
  assert.equal(app.el('report-perfect').textContent, '0 題');
  assert.equal(app.el('report-self-corrected').textContent, '0 題');
  assert.equal(app.el('report-guided').textContent, '8 題');
  assert.equal(app.el('report-solution-guided').textContent, '0 題');

  // Self-corrected-only session diagnosis (no Stage 2 errors)
  const selfApp = startFactorization(42, 10);
  const nonCross = selfApp.state.questions.filter(q => q.subtype !== 'cross').slice(0, 2);
  selfApp.mount(nonCross);
  for (const q of nonCross) {
    selfApp.fill({ ans: q.formula });
    selfApp.context.checkAnswer();
    selfApp.fill({ ans: solvePrompt(q.formula).answer });
    selfApp.context.checkAnswer();
    selfApp.tick(1500);
  }
  assert.equal(selfApp.el('report-self-corrected').textContent, '2 題');
  assert.equal(selfApp.el('report-guided').textContent, '0 題');
  assert.match(selfApp.el('diagnosis-text').textContent, /還沒分解完全/);
});

test('Stage 2 exit modal isolates solution reveal, step reopen, card taps, and restores input after 600ms expansion', () => {
  const app = startFactorization(42, 10);
  const comp = app.state.questions.find(q => q.subtype === 'common-composite');
  const cross = app.state.questions.find(q => q.subtype === 'cross');
  app.mount([comp, cross]);

  // Trigger Stage 2, open exit modal BEFORE 600ms finishes, let Stage 2 expand under modal
  app.fill({ ans: '(x+99)(x+99)' });
  app.context.checkAnswer();
  app.context.triggerExitCheck();
  app.tick(600);
  assert.equal(comp.currentStage, 2);
  assert.equal(app.state.activeInputId, null);

  // Cancel modal -> restores focus on Stage 2 Step 1 input and standard integer keyboard
  app.context.hideExitModal();
  assert.equal(app.state.activeInputId, 'q_0_content');
  assert.equal(app.el('keyboard-standard').classList.contains('hidden'), false);

  // Unlock solution button via 3 wrong attempts, then open exit modal -> solution button & typing blocked
  for (let i = 0; i < 3; i++) {
    app.fill({ content: '99' });
    app.context.checkAnswer();
  }
  app.fill({ content: String(comp.stage2Ans.content.expected) });
  app.context.triggerExitCheck();
  app.context.revealFactorStepSolution('content');
  app.key('Backspace');
  app.context.checkAnswer();
  assert.equal(comp.correction.usedSolution, false);
  assert.equal(app.document.querySelector('[data-input-id="q_0_content"]').getAttribute('data-value'), String(comp.stage2Ans.content.expected));

  // Cancel modal -> Step 1 passes -> open modal -> reopenFactorizationStep blocked while modal open
  app.context.hideExitModal();
  app.context.checkAnswer();
  assert.equal(comp.correction.unlockedIndex, 1);
  app.context.triggerExitCheck();
  app.context.reopenFactorizationStep(0);
  assert.equal(comp.correction.unlockedIndex, 1);
  app.context.hideExitModal();
  app.fill({ innerConstant: String(comp.stage2Ans.innerConstant.expected) });
  app.context.checkAnswer();
  app.fill({ ans2: solvePrompt(comp.formula).answer });
  app.context.checkAnswer();
  app.tick(1500);

  // Q1 (cross): expand Stage 2 under exit modal, then cancel -> card keyboard ready
  const [w0, w1] = wrongCardPair(cross);
  app.context.toggleFactorCard(1, w0);
  app.context.toggleFactorCard(1, w1);
  app.context.checkAnswer();
  app.context.triggerExitCheck();
  app.tick(600);
  assert.equal(cross.currentStage, 2);
  app.context.toggleFactorCard(2, cross.correctPair[0]);
  assert.deepEqual([...cross.correction.selectedCards], []);
  app.context.hideExitModal();
  assert.equal(app.el('keyboard-cards').classList.contains('hidden'), false);
  app.context.toggleFactorCard(2, cross.correctPair[0]);
  app.context.toggleFactorCard(2, cross.correctPair[1]);
  app.context.checkAnswer();
  assert.equal(cross.correction.unlockedIndex, 1);
});

