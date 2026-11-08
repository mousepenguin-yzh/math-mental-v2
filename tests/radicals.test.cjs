const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp, question } = require('./helpers/app.cjs');

const radical = (coefficient, radicand, form = 'simplest') => ({
  type: 'radical', expected: { coefficient, radicand }, form,
});
const plain = value => JSON.parse(JSON.stringify(value));
const fixture = () => question({
  stage1Ans: { ans: radical(2, 5) },
  stage2Ans: { step1: { type: 'integer', expected: 4 }, ans2: radical(2, 5) },
});

test('strict radical grammar preserves source form and normalizes only minus/outer whitespace', () => {
  const { parseRadicalAnswer: parse } = createApp().context;
  for (const [raw, coefficient, radicand, hasRadical] of [
    ['4', 4, 1, false], ['√5', 1, 5, true], ['2√3', 2, 3, true],
    [' −3√2 ', -3, 2, true], ['01√005', 1, 5, true], ['0', 0, 1, false],
  ]) assert.deepEqual(plain(parse(raw)), { ok: true, coefficient, radicand, hasRadical }, raw);
});

test('incomplete inputs are distinguishable from malformed/unsupported syntax', () => {
  const { parseRadicalAnswer: parse } = createApp().context;
  for (const raw of ['', ' ', '-', '−', '√', '-√', '2√', '-2√']) {
    assert.deepEqual(plain(parse(raw)), { ok: false, reason: 'incomplete' }, raw);
  }
  for (const raw of ['+2', '--2', '√-2', '√−2', '2√3abc', '2 3', '2 √3', '√2√3',
    '2√3+3√3', '√2×√8', '√6÷√3', '√2/2', '1/0', '(√2)', 'sqrt(5)', '√√2',
    '0.5√2', '1.4142', '2e3', '0x10', 'NaN', 'Infinity', '２', '2\n√3', null, 2]) {
    assert.deepEqual(plain(parse(raw)), { ok: false, reason: 'syntax' }, String(raw));
  }
});

test('exact simplification includes mental-math large radicands, signs, integer and zero collapse', () => {
  const { parseRadicalAnswer: parse, normalizeRadical: normalize } = createApp().context;
  for (const [raw, coefficient, radicand] of [
    ['√5', 1, 5], ['2√3', 2, 3], ['−3√2', -3, 2], ['√20', 2, 5],
    ['√16', 4, 1], ['√450', 15, 2], ['√675', 15, 3], ['√800', 20, 2],
    ['√980', 14, 5], ['-2√72', -12, 2], ['√0', 0, 1], ['-0√5', 0, 1],
    ['-√1', -1, 1], ['√1000000', 1000, 1], ['√999983', 1, 999983],
  ]) assert.deepEqual(plain(normalize(parse(raw))), { coefficient, radicand }, raw);
});

// Independent oracle: prime exponent decomposition (not production square extraction).
function oracle(c, n) {
  if (c === 0 || n === 0) return { coefficient: 0, radicand: 1 };
  let coefficient = c, radicand = 1;
  for (let prime = 2; prime <= n; prime++) {
    let exponent = 0;
    while (n % prime === 0) { n /= prime; exponent++; }
    coefficient *= prime ** Math.floor(exponent / 2);
    if (exponent % 2) radicand *= prime;
  }
  return { coefficient, radicand };
}

test('independent exact oracle, square identities and idempotence over 6003 signed cases', () => {
  const { normalizeRadical: normalize } = createApp().context;
  for (let n = 0; n <= 2000; n++) for (const c of [-3, 0, 2]) {
    const actual = normalize({ coefficient: c, radicand: n });
    assert.deepEqual(plain(actual), oracle(c, n), `${c}√${n}`);
    assert.deepEqual(plain(normalize(actual)), plain(actual));
    assert.equal(BigInt(actual.coefficient) ** 2n * BigInt(actual.radicand), BigInt(c) ** 2n * BigInt(n));
    if (n && c) assert.equal(Math.sign(actual.coefficient), Math.sign(c));
  }
});

test('safety bounds include raw length, components and normalized coefficient; no truncation', () => {
  const { parseRadicalAnswer: parse, normalizeRadical: normalize, validateTypedAnswer: validate } = createApp().context;
  assert.equal(parse('0'.repeat(32)).ok, true);
  for (const raw of ['0'.repeat(33), '1000000001', '√1000001', '9007199254740993', ' '.repeat(33) + '2']) {
    assert.deepEqual(plain(parse(raw)), { ok: false, reason: 'limit' }, raw);
  }
  assert.equal(validate('1000000√1000000', radical(1000000000, 1)).status, 'equivalent-not-simplest');
  assert.equal(validate('1000001√1000000', radical(1, 1)).reason, 'limit');
  assert.equal(validate('1000000000', radical(1000000000, 1)).accepted, true);
  for (const value of [null, { coefficient: 1.5, radicand: 2 }, { coefficient: 1, radicand: -2 },
    { coefficient: 1, radicand: Infinity }, { coefficient: Number.MAX_SAFE_INTEGER, radicand: 2 }]) {
    assert.throws(() => normalize(value), { name: 'RangeError' });
  }
});

test('equivalence and simplest form remain separate under either acceptance policy', () => {
  const { validateTypedAnswer: validate } = createApp().context;
  for (const form of ['simplest', 'equivalent']) {
    const result = validate('√20', radical(2, 5, form));
    assert.equal(result.status, 'equivalent-not-simplest');
    assert.equal(result.equivalent, true);
    assert.equal(result.simplest, false);
    assert.equal(result.accepted, form === 'equivalent');
  }
  for (const raw of ['2√5', '02√005']) assert.equal(validate(raw, radical(2, 5)).status, 'correct');
  assert.equal(validate('1√5', radical(1, 5)).status, 'correct');
  for (const [raw, c, d] of [['√16', 4, 1], ['4√1', 4, 1], ['√0', 0, 1], ['0√5', 0, 1]]) {
    assert.equal(validate(raw, radical(c, d)).status, 'equivalent-not-simplest');
  }
  for (const [raw, c, d] of [['2√5', 2, 3], ['-√25', 5, 1], ['2', 2, 3], ['√2', -1, 2]]) {
    assert.equal(validate(raw, radical(c, d)).status, 'incorrect');
  }
  assert.equal(validate('√', radical(1, 2)).reason, 'incomplete');
  assert.equal(validate('1.4142', radical(1, 2)).reason, 'syntax');
});

test('the requested operation results are expressible without an expression evaluator', () => {
  const { validateTypedAnswer: validate } = createApp().context;
  // √2×√8 = √16; 2√3+3√3 = 5√3; √6÷√3 = √2.
  for (const [raw, c, d] of [['4', 4, 1], ['5√3', 5, 3], ['√2', 1, 2]]) {
    assert.equal(validate(raw, radical(c, d)).status, 'correct');
  }
});

test('strict integer steps reject decimal/fraction/radical prefixes and support zero/negative values', () => {
  const { validateTypedAnswer: validate } = createApp().context;
  for (const [raw, expected] of [['4', 4], [' 04 ', 4], ['−4', -4], ['-0', 0], ['1000000000', 1000000000]]) {
    assert.equal(validate(raw, { type: 'integer', expected }).status, 'correct');
  }
  for (const raw of ['4.0', '4abc', '4√2', '4/1', '+4', '4e0', 'Infinity']) {
    assert.equal(validate(raw, { type: 'integer', expected: 4 }).reason, 'syntax');
  }
  assert.equal(validate('-', { type: 'integer', expected: 4 }).reason, 'incomplete');
  assert.equal(validate('1000000001', { type: 'integer', expected: 4 }).reason, 'limit');
  assert.equal(validate('5', { type: 'integer', expected: 4 }).status, 'incorrect');
});

test('unknown or noncanonical answer specs fail closed, never entering legacy fallback', () => {
  const { validateTypedAnswer: validate } = createApp().context;
  for (const spec of [null, '2√3', {}, { type: 'unknown' }, { type: 'integer', expected: '4' },
    { type: 'integer', expected: 1.5 }, radical(1, 20), radical(0, 5), radical(2, 3, 'typo'),
    { type: 'radical', expected: { coefficient: 1, radicand: 2 } }]) {
    assert.equal(validate('2√3', spec).reason, 'invalid-spec');
  }
});

test('typed incomplete and malformed submissions stay editable without consuming first try', () => {
  const app = createApp(); app.mount([fixture()]);
  const q = app.state.questions[0];
  for (const raw of ['', '-', '2√', '2√5abc', ' '.repeat(33) + '2√5']) {
    app.fill({ ans: raw }); app.context.checkAnswer(); app.tick(600);
    assert.equal(q.firstTry, true); assert.equal(q.currentStage, 1);
    assert.equal(q.answerState, 'answering'); assert.equal(app.state.goldenStars, 0);
    assert.equal(Object.keys(app.state.errorLog).length, 0);
    assert.ok(app.state.activeInputId);
  }
  app.fill({ ans: '2√5' }); app.context.checkAnswer(); app.context.checkAnswer();
  assert.equal(app.state.goldenStars, 1);
});

test('equivalent unfinished answer stays in stage 1, loses first-try star and can be completed once', () => {
  const app = createApp(); app.mount([fixture(), fixture()]);
  const q = app.state.questions[0];
  app.fill({ ans: '√20' }); app.context.checkAnswer(); app.context.checkAnswer(); app.tick(2000);
  assert.equal(q.currentStage, 1); assert.equal(q.answerState, 'answering');
  assert.equal(q.firstTry, false); assert.equal(app.state.currentIndex, 0);
  assert.equal(Object.keys(app.state.errorLog).length, 0);
  app.fill({ ans: '2√5' }); app.context.checkAnswer(); app.context.checkAnswer();
  assert.equal(app.state.goldenStars, 0);
  app.tick(1499); assert.equal(app.state.currentIndex, 0);
  app.tick(1); assert.equal(app.state.currentIndex, 1);
});

test('typed wrong radical cannot pass on its coefficient; correction validates all field types', () => {
  const app = createApp(); app.mount([fixture(), fixture()]);
  app.fill({ ans: '2√3' }); app.context.checkAnswer(); app.context.checkAnswer();
  assert.equal(app.state.goldenStars, 0);
  app.tick(599); assert.equal(app.state.questions[0].currentStage, 1);
  app.tick(1); assert.equal(app.state.questions[0].currentStage, 2);
  for (const values of [{ step1: '4abc', ans2: '2√5' }, { step1: '5', ans2: '2√5' },
    { step1: '4', ans2: '2√3' }, { step1: '4', ans2: '√20' }]) {
    app.fill(values); app.context.checkAnswer(); app.tick(1500);
    assert.equal(app.state.currentIndex, 0);
  }
  app.fill({ step1: '4', ans2: '2√5' }); app.context.checkAnswer(); app.tick(1500);
  assert.equal(app.state.currentIndex, 1); assert.equal(app.state.goldenStars, 0);
  assert.equal(app.state.errorLog.Arithmetic_Sign, 1);
});

test('typed answers coexist with legacy fractions/scalars without suffix-based dispatch', () => {
  const app = createApp();
  app.mount([question({
    stage1Markup: '[fraction:a_num:a_den] [input:r_num:w-14] [input:r_den:w-14] [input:scalar:w-14]',
    stage1Ans: { a_num: '1', a_den: '2', r_num: radical(2, 3), r_den: { type: 'integer', expected: 2 }, scalar: '.375' },
  })]);
  app.fill({ a_num: '2', a_den: '4', r_num: '2√3', r_den: '2', scalar: '0.375' });
  app.context.checkAnswer(); assert.equal(app.state.goldenStars, 1);
});

test('equivalence policy may accept unfinished form but retains the distinct mathematical status', () => {
  const app = createApp();
  app.mount([question({ stage1Ans: { ans: radical(2, 5, 'equivalent') } })]);
  app.fill({ ans: '√20' }); app.context.checkAnswer();
  assert.equal(app.state.goldenStars, 1);
});

test('typed exchange groups and unknown specs fail closed in the integration path', () => {
  const app = createApp();
  app.mount([question({ stage1Ans: { ans: { type: 'unknown' } } })]);
  app.fill({ ans: '5' }); app.context.checkAnswer();
  assert.equal(app.state.goldenStars, 0); assert.equal(app.state.questions[0].answerState, 'answering');
  const grouped = fixture(); grouped.interchangeableGroups = [['step1', 'ans2']];
  app.mount([grouped]); app.fill({ ans: '3' }); app.context.checkAnswer(); app.tick(600);
  app.fill({ step1: '4', ans2: '2√5' }); app.context.checkAnswer(); app.tick(1500);
  assert.equal(app.state.currentIndex, 0); assert.equal(grouped.answerState, 'answering');
});

for (const raw of ['2√5', '2√3']) test(`typed ${raw}: exit/restart isolates success and correction callbacks`, () => {
  const app = createApp(); app.mount([fixture(), fixture()]);
  app.fill({ ans: raw }); app.context.checkAnswer();
  const old = app.pendingCallbacks();
  app.context.confirmExit(); app.context.startGame();
  const current = app.state.questions[0];
  old.forEach(fn => fn()); app.tick(2000);
  assert.equal(app.state.questions[0], current); assert.equal(current.currentStage, 1);
  assert.equal(app.state.currentIndex, 0); assert.equal(app.state.goldenStars, 0);
  assert.equal(app.el('stage-2-container').classList.contains('open'), false);
});

test('radical UI: keyboard aux key switches by field spec between radical, integer, and legacy fields', () => {
  const app = createApp();
  app.mount([
    question({
      formulaHtml: '化簡 √20',
      stage1Markup: '[input:ans]',
      stage1Ans: { ans: radical(2, 5) },
      stage2Markup: '[input:step1] [input:ans2]',
      stage2Ans: { step1: { type: 'integer', expected: 4 }, ans2: radical(2, 5) },
    }),
    question({
      stage1Markup: '[input:dec]',
      stage1Ans: { dec: '0.375' },
    }),
  ]);
  const aux = app.el('key-aux');
  const stage1Input = app.document.querySelector('[data-input-id="q_0_ans"]');
  assert.equal(aux.getAttribute('data-key'), '√');
  assert.equal(aux.textContent, '√');
  assert.equal(stage1Input.getAttribute('data-input-mode'), 'radical');
  assert.match(app.el('main-formula').innerHTML, /class="rad-group".*<span class="rad-bar">20<\/span>/);

  // In radical mode, '.' is ignored and aux button / 'r' / 'R' inserts at most one '√'
  app.key('.'); app.context.pressKey('.');
  assert.equal(stage1Input.getAttribute('data-value'), null);
  app.context.pressAuxKey();
  assert.equal(stage1Input.getAttribute('data-value'), '√');
  assert.match(stage1Input.innerHTML, /rad-bar-empty/);
  // Duplicate radical is prevented and keeps current value
  app.key('r'); app.key('R'); app.context.pressKey('√');
  assert.equal(stage1Input.getAttribute('data-value'), '√');
  assert.match(app.el('feedback-banner').innerHTML, /已經輸入過根號/);

  // Clear and enter wrong answer to expand stage 2 with integer step + radical final answer
  app.key('Escape');
  assert.equal(stage1Input.getAttribute('data-value'), '');
  app.key('9'); app.key('Enter');
  app.tick(600);
  assert.equal(app.state.questions[0].currentStage, 2);
  app.tick(250);
  // First stage 2 field is step1 (integer) -> aux key switches away from '√' to '.'
  assert.equal(app.state.activeInputId, 'q_0_step1');
  assert.equal(aux.getAttribute('data-key'), '.');
  const step1El = app.document.querySelector('[data-input-id="q_0_step1"]');
  app.key('r'); app.key('.'); app.context.pressAuxKey();
  assert.equal(step1El.getAttribute('data-value'), null);
  app.key('4');
  assert.equal(step1El.getAttribute('data-value'), '4');

  // Focus ans2 (radical) -> aux key switches back to '√'
  app.context.focusInput('q_0_ans2');
  assert.equal(aux.getAttribute('data-key'), '√');
  const ans2El = app.document.querySelector('[data-input-id="q_0_ans2"]');
  app.key('2'); app.key('r'); app.key('5');
  assert.equal(ans2El.getAttribute('data-value'), '2√5');
  assert.match(ans2El.innerHTML, /<span>2<\/span><span class="rad-group"><span class="rad-sign">√<\/span><span class="rad-bar">5/);
  app.key('Enter');
  app.tick(1500);

  // Question 2 is legacy decimal -> aux key is '.' and allows decimal input
  assert.equal(app.state.currentIndex, 1);
  assert.equal(aux.getAttribute('data-key'), '.');
  const decEl = app.document.querySelector('[data-input-id="q_1_dec"]');
  app.key('r');
  assert.equal(decEl.getAttribute('data-value'), null);
  for (const ch of ['0', '.', '3', '7', '5']) app.key(ch);
  assert.equal(decEl.getAttribute('data-value'), '0.375');
});

test('radical UI: keyboard entry supports 4, √3, 1√3, 2√5, -√3, -1√3, 15√2, 20√2, minus toggle, and backspace', () => {
  const cases = [
    [['4'], radical(4, 1), '4'],
    [['r', '3'], radical(1, 3), '√3'],
    [['1', 'r', '3'], radical(1, 3), '1√3'],
    [['2', '√', '5'], radical(2, 5), '2√5'],
    [['-', 'R', '3'], radical(-1, 3), '-√3'],
    [['1', 'r', '3', '-'], radical(-1, 3), '-1√3'],
    [['1', '5', 'r', '2'], radical(15, 2), '15√2'],
    [['2', '0', 'r', '2', '9', 'Backspace'], radical(20, 2), '20√2'],
  ];
  for (const [keys, spec, expectedRaw] of cases) {
    const app = createApp();
    app.mount([question({ stage1Ans: { ans: spec } })]);
    const el = app.document.querySelector('[data-input-id="q_0_ans"]');
    for (const k of keys) {
      if (k === '√') app.context.pressAuxKey();
      else app.key(k);
    }
    assert.equal(el.getAttribute('data-value'), expectedRaw);
    app.key('Enter');
    assert.equal(app.state.goldenStars, 1, `failed for ${expectedRaw}`);
  }
});

test('radical UI: typed fields allow up to 32 chars while legacy fields stay capped at 10 chars', () => {
  const app = createApp();
  app.mount([
    question({ stage1Ans: { ans: radical(2, 5) } }),
    question({ stage1Ans: { ans: '1234567890' } }),
  ]);
  const radEl = app.document.querySelector('[data-input-id="q_0_ans"]');
  for (let i = 0; i < 35; i++) app.key('0');
  assert.equal(radEl.getAttribute('data-value').length, 32);

  app.state.currentIndex = 1;
  app.context.loadQuestion();
  const legEl = app.document.querySelector('[data-input-id="q_1_ans"]');
  for (let i = 0; i < 15; i++) app.key('1');
  assert.equal(legEl.getAttribute('data-value').length, 10);
});

test('radical UI: vinculum rendering safely escapes untrusted characters without executing HTML', () => {
  const app = createApp();
  const rendered = app.context.renderInputDisplay('<img src=x onerror=alert(1)>√<b>5</b>', true);
  assert.doesNotMatch(rendered, /<img|<b>/);
  assert.match(rendered, /&lt;img src=x onerror=alert\(1\)&gt;/);
  assert.match(rendered, /&lt;b&gt;5&lt;\/b&gt;/);
  const rad = app.context.radHtml('<script>1</script>', '<b>2</b>');
  assert.doesNotMatch(rad, /<script>|<b>/);
});

test('report-guided counts only questions that entered stage 2, excluding stage-1 unsimplified self-corrections', () => {
  const app = createApp();
  app.mount([
    fixture(), // Q1: first-try correct -> 1 star, not guided
    fixture(), // Q2: unsimplified '√20' then self-corrected '2√5' in stage 1 -> 0 star, not guided
    fixture(), // Q3: wrong '2√3' -> enters stage 2 -> corrected -> 0 star, guided = 1
  ]);
  // Q1: first-try correct
  app.fill({ ans: '2√5' }); app.context.checkAnswer(); app.tick(1500);
  // Q2: unsimplified then corrected in stage 1
  app.fill({ ans: '√20' }); app.context.checkAnswer();
  assert.equal(app.state.questions[1].currentStage, 1);
  assert.equal(app.state.questions[1].firstTry, false);
  app.fill({ ans: '2√5' }); app.context.checkAnswer(); app.tick(1500);
  // Q3: wrong then corrected in stage 2
  app.fill({ ans: '2√3' }); app.context.checkAnswer(); app.tick(600);
  assert.equal(app.state.questions[2].currentStage, 2);
  app.fill({ step1: '4', ans2: '2√5' }); app.context.checkAnswer(); app.tick(1500);

  assert.equal(app.el('report-total').textContent, '3 題');
  assert.equal(app.el('report-perfect').textContent, '1 題');
  assert.equal(app.el('report-guided').textContent, '1 題');
  assert.equal(app.el('star-rate-text').textContent, '33%');
});

