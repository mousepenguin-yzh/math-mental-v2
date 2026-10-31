const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./helpers/app.cjs');

// Operands come from the visible sentence, independently of generator answers.
function verify(q) {
  const prompt = /<div[^>]*>([^<]+)<\/div>/.exec(q.formulaHtml)[1];
  const numbers = [...prompt.matchAll(/\d+/g)].map(m => Number(m[0]));
  assert.equal(numbers.length, 2, prompt);
  const [first, second] = numbers;
  const adding = /求斜邊 x|對角線長 x|梯長 x|直線距離 x/.test(prompt);
  assert.equal(q.solveType, adding ? 'hypotenuse' : 'leg');
  const square = adding ? first ** 2 + second ** 2 : Math.max(first, second) ** 2 - Math.min(first, second) ** 2;
  const answer = Math.sqrt(square);
  assert.ok(Number.isInteger(answer) && answer > 0, prompt);
  assert.equal(Number(q.stage1Ans.ans), answer);
  assert.equal(Number(q.stage2Ans.squared), square);
  assert.equal(Number(q.stage2Ans.ans2), answer);
  assert.equal(Object.keys(q.stage2Ans).length, 2);
  assert.deepEqual([...q.stage2Markup.matchAll(/\[input:([^:]+):[^\]]+\]/g)].map(m => m[1]).sort(), ['ans2', 'squared']);
  assert.match(q.stage2Markup, adding ? /² \+ / : /² − /);
  assert.match(q.stage2Hint, adding ? /平方相加/ : /平方減去/);
  assert.match(q.stage2Hint, /先求 x²/);
  assert.match(q.stage2Markup, /實際邊長/);
  const s = q.sides;
  assert.equal(s.legA ** 2 + s.legB ** 2, s.hypotenuse ** 2);
  assert.ok(s.hypotenuse > s.legA && s.hypotenuse > s.legB);
  assert.ok(Object.values(s).every(n => Number.isInteger(n) && n > 0));
  assert.ok(s.hypotenuse <= 30 || [s.legA, s.legB, s.hypotenuse].join() === '16,30,34');
  assert.equal(s[q.unknown], answer);
  const p = q.geomParams;
  const labels = { legA: p.sideA, legB: p.sideB, hypotenuse: p.sideC };
  assert.equal(p.unknown, q.unknown);
  for (const side of Object.keys(s)) assert.equal(labels[side], side === q.unknown ? 'x' : s[side]);
  assert.deepEqual(Object.values(labels).filter(v => v !== 'x').sort((a,b) => a-b), [...numbers].sort((a,b) => a-b));
  assert.match(q.formulaHtml, /示意圖，非依比例繪製/);
  assert.match(q.formulaHtml, /role="img" aria-label=/);
  assert.equal(q.unit, '公尺');
  assert.doesNotMatch(prompt, /公分|公里|英尺/);
  assert.match(q.stage1Markup, /公尺/);
  assert.match(q.stage2Markup, /公尺/);
  if (q.scenario === 'rectangle') {
    assert.match(prompt, /長方形/); assert.match(q.stage2Hint, /對角線是斜邊/);
    if (adding) assert.match(prompt, new RegExp('長為 ' + s.legB + ' 公尺、寬為 ' + s.legA));
    else assert.match(prompt, new RegExp('對角線長 ' + s.hypotenuse));
  } else if (q.scenario === 'ladder') {
    assert.match(prompt, /與地面垂直/); assert.match(q.stage2Hint, /梯子是斜邊/);
    if (q.unknown !== 'legA') assert.match(prompt, new RegExp('頂端離地 ' + s.legA));
    if (q.unknown !== 'legB') assert.match(prompt, new RegExp('底端離牆 ' + s.legB));
    if (!adding) assert.match(prompt, new RegExp('長 ' + s.hypotenuse + ' 公尺的梯子'));
  } else if (q.scenario === 'journey') {
    assert.match(prompt, /先向東走/); assert.match(prompt, /再向北走/);
    assert.match(prompt, new RegExp('向東走 ' + labels.legB));
    assert.match(prompt, new RegExp('向北走 ' + labels.legA));
    assert.match(q.stage2Hint, /互相垂直/);
  }
  return answer;
}

for (const count of [10, 20, 30]) test(count + ': exact quotas, no duplicate, independent mathematics over 100 seeds', () => {
  const signatures = new Set();
  for (let seed = 1; seed <= 100; seed++) {
    const app = createApp(seed);
    const qs = app.context.buildQuestions('pythagorean', count);
    assert.equal(qs.length, count);
    for (const [key, values] of [
      ['presentationType', ['hypotenuse','leg','application']],
      ['difficultyBand', ['basic','medium','challenge']]
    ]) values.forEach((value, i) => assert.equal(qs.filter(q => q[key] === value).length, count * (i === 2 ? .2 : .4), seed + ':' + key));
    // Derive identity from displayed data, rather than trusting questionKey.
    const identity = qs.map(q => [q.tripleId, q.unknown, q.scenario || 'triangle'].join(':'));
    assert.equal(new Set(identity).size, count);
    assert.equal(new Set(qs.map(q => q.formulaHtml)).size, count);
    const apps = qs.filter(q => q.presentationType === 'application');
    assert.equal(new Set(apps.map(q => q.scenario)).size, Math.min(3, apps.length));
    const sceneCounts = ['rectangle','ladder','journey'].map(s => apps.filter(q => q.scenario === s).length);
    assert.ok(Math.max(...sceneCounts) - Math.min(...sceneCounts) <= 1);
    assert.deepEqual([...new Set(apps.map(q => q.solveType))].sort(), ['hypotenuse','leg']);
    assert.ok(qs.some(q => !q.scenario && q.solveType === 'leg' && q.unknown === 'legA'));
    qs.forEach(verify);
    signatures.add(identity.join('|'));
  }
  assert.ok(signatures.size > 95, 'different seeds should yield different orders');
});

test('bank coverage: all 12 triangles, five primitive families, scales and three solve directions', () => {
  const app = createApp(41);
  const covered = new Set(), scenarios = new Set();
  for (let i = 0; i < 30; i++) for (const q of app.context.buildQuestions('pythagorean', 30)) {
    covered.add(q.familyId + ':' + q.scale + ':' + q.unknown);
    if (q.scenario) scenarios.add(q.scenario + ':' + q.unknown);
  }
  const bank = [
    ['3-4-5', [1,2,3,4,5,6]], ['5-12-13', [1,2]],
    ['8-15-17', [1,2]], ['7-24-25', [1]], ['20-21-29', [1]]
  ];
  for (const [family, scales] of bank) for (const scale of scales) for (const unknown of ['hypotenuse','legA','legB']) {
    assert.ok(covered.has(family + ':' + scale + ':' + unknown), family + ':' + scale + ':' + unknown);
  }
  for (const scene of ['rectangle','ladder','journey']) for (const unknown of ['hypotenuse','legA','legB']) assert.ok(scenarios.has(scene + ':' + unknown));
  assert.equal(JSON.stringify(createApp(12).context.buildQuestions('pythagorean',30)), JSON.stringify(createApp(12).context.buildQuestions('pythagorean',30)));
});

test('all scene/unknown combinations render matching labels and right-angle strokes on Canvas', () => {
  const app = createApp();
  const original = app.document.getElementById;
  const calls = [];
  const ctx = Object.fromEntries(['clearRect','beginPath','moveTo','lineTo','closePath','fill','stroke','fillText','setLineDash'].map(name => [name, (...args) => calls.push([name,...args])]));
  app.document.getElementById = id => id === 'q-geom-canvas' ? {width:260,height:155,getContext:()=>ctx} : original(id);
  for (const scenario of [null,'rectangle','ladder','journey']) for (const unknown of ['hypotenuse','legA','legB']) {
    const q = app.context.makePythagoreanQuestion([5,12,13,2], 'medium', scenario ? 'application' : unknown === 'hypotenuse' ? 'hypotenuse' : 'leg', unknown, scenario);
    verify(q); calls.length = 0;
    if (scenario) app.context.drawPythagoreanScene(q.geomParams, scenario);
    else app.context.drawQuestionTriangle(q.geomParams);
    const labels = calls.filter(c => c[0] === 'fillText').map(c => c[1]);
    for (const label of [q.geomParams.sideA, q.geomParams.sideB, q.geomParams.sideC]) assert.ok(labels.includes(label));
    assert.ok(calls.some(c => c[0] === 'lineTo' && c[1] === (scenario === 'journey' ? 163 : 62) && c[2] === 88), 'right angle');
  }
});

test('real fifth challenge: full mixed 30-question session, every correction blank, statistics and diagnosis', () => {
  const app = createApp(98);
  app.context.drawQuestionTriangle = app.context.drawPythagoreanScene = () => {};
  app.context.selectDifficulty('pythagorean'); app.context.selectCount(30); app.context.startGame();
  assert.equal(app.el('difficulty-label').textContent, '畢氏定理特訓');
  assert.equal(app.state.questions.length, 30);
  for (let i = 0; i < 30; i++) {
    const q = app.state.questions[i], answer = verify(q);
    if (i % 2 === 0) {
      app.fill({ans: String(answer)}); app.context.checkAnswer(); app.key('Enter');
      app.context.focusInput('q_' + i + '_ans'); app.context.pressKey('OK');
    } else {
      app.fill({ans:'-1'}); app.context.checkAnswer(); app.tick(400); app.key('Enter'); app.context.checkAnswer();
      app.tick(200); assert.equal(q.currentStage, 2);
      app.fill({squared: String(answer ** 2)}); app.context.checkAnswer();
      assert.equal(q.answerState, 'answering', 'final edge is required');
      app.fill({ans2:String(answer), squared:'-1'}); app.context.checkAnswer();
      assert.equal(q.answerState, 'answering', 'square is required');
      app.fill({squared:String(answer ** 2), ans2:String(-answer)}); app.context.checkAnswer();
      assert.equal(q.answerState, 'answering', 'edge must be positive');
      app.fill({ans2:String(answer)}); app.context.checkAnswer(); app.key('Enter');
    }
    app.tick(1499); assert.equal(app.state.currentIndex, i);
    app.tick(1); assert.equal(app.state.currentIndex, i + 1);
  }
  assert.equal(app.state.goldenStars, 15);
  assert.equal(Object.values(app.state.errorLog).reduce((a,b)=>a+b,0), 15);
  assert.equal(app.el('report-guided').textContent, '15 題');
  assert.equal(app.el('star-rate-text').textContent, '50%');
  assert.equal(app.pendingCallbacks().length, 0);
  assert.match(app.el('report-time-total').textContent, /秒/);
  for (const [category, phrase] of [['Pythagorean_Add',/平方相加|平方再相加/], ['Pythagorean_Subtract',/平方減/], ['Pythagorean_Model',/兩股/]]) {
    app.state.errorLog = {[category]:1};
    assert.match(app.context.getDiagnosis(0), phrase);
  }
});

for (const correct of [true,false]) test('fifth challenge: exit/reopen cancels queued ' + (correct ? 'success' : 'correction/drawing') + ' callbacks', () => {
  const app = createApp(7); let drawings = 0;
  app.context.drawQuestionTriangle = app.context.drawPythagoreanScene = () => drawings++;
  app.context.selectDifficulty('pythagorean'); app.context.startGame();
  const answer = verify(app.state.questions[0]);
  app.fill({ans:correct ? String(answer) : '-1'}); app.context.checkAnswer();
  const oldCallbacks = app.pendingCallbacks();
  app.context.triggerExitCheck(); app.key('Enter');
  app.context.confirmExit(); assert.equal(app.pendingCallbacks().length,0);
  app.context.selectDifficulty('pythagorean'); app.context.selectCount(20); app.context.startGame();
  const current = app.state.questions[0];
  oldCallbacks.forEach(fn=>fn());
  assert.equal(drawings,0);
  app.tick(5000);
  assert.equal(drawings,1);
  assert.equal(app.state.currentIndex,0);
  assert.equal(app.state.questions[0],current);
  assert.equal(current.currentStage,1);
  assert.equal(app.state.goldenStars,0);
  assert.equal(app.el('stage-2-container').classList.contains('open'),false);
});
