const families = {
  basic: ['common', 'difference', 'square', 'monic'],
  medium: ['common-composite', 'signed-pair', 'two-step'],
  challenge: ['cross']
};

const labels = {
  common: '提公因式', difference: '平方差', square: '完全平方', monic: '首一二次式',
  'common-composite': '係數與 x 的公因式', 'signed-pair': '正負整數配對',
  'two-step': '先提公因數再用平方差', cross: '十字交乘'
};

function shuffle(items, random) {
  const result = items.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function polynomial(terms) {
  let text = '';
  for (const [n, power] of terms) {
    if (!n) continue;
    const sign = n < 0 ? '−' : text ? '+' : '';
    const magnitude = power && Math.abs(n) === 1 ? '' : Math.abs(n);
    text += sign + magnitude + power;
  }
  return text;
}

const linear = (a, b) => polynomial([[a, 'x'], [b, '']]);

// Every template constructs k(ax+b)(x+d); coefficients alone identify a prompt.
function templates() {
  const pools = Object.fromEntries(Object.keys(labels).map(type => [type, []]));
  function add(type, k, a, b, d) {
    pools[type].push({ k, a, b, d });
  }
  for (const n of [2, 3, 4, 5, 6]) {
    add('difference', 1, 1, -n, n);
    for (const sign of [-1, 1]) {
      add('square', 1, 1, sign*n, sign*n);
      add('common', 1, 1, sign*n, 0);
    }
    for (const k of [2, 3]) add('two-step', k, 1, -n, n);
  }
  for (const b of [1, 2, 3, 4]) {
    for (let d = b + 1; d <= 6; d++) {
      add('monic', 1, 1, b, d);
      add('signed-pair', 1, 1, -d, -b);
      add('signed-pair', 1, 1, -d, b);
      add('signed-pair', 1, 1, -b, d);
    }
  }
  for (const a of [2, 3]) {
    for (const b of [-5, -3, -2, -1, 1, 2, 3, 5]) {
      if (b % a === 0) continue; // a is prime; ax+b is primitive.
      for (const k of [2, 3]) add('common-composite', k, a, b, 0);
      for (const d of [-4, -3, -2, -1, 1, 2, 3, 4]) add('cross', 1, a, b, d);
    }
  }
  return pools;
}

const bank = templates();

function cardsFor(a, b, d, random) {
  const correct = [linear(a, b), linear(1, d)];
  // All six are distinct primitive factors with positive leading coefficients.
  // Unique factorization then allows only the displayed target pair.
  const otherB = [d, -d, 1, -1, 5].find(n => Math.abs(n) !== Math.abs(b) && n % a !== 0);
  const otherD = [b, -b, 1, 2].find(n => Math.abs(n) !== Math.abs(d));
  const cards = shuffle([...correct, linear(a, -b), linear(1, -d),
    linear(a, otherB), linear(1, otherD)], random);
  return { cards, correctPair: correct.map(card => cards.indexOf(card)).sort((i, j) => i - j) };
}

function question(type, difficultyBand, { k, a, b, d }, random) {
  const expected = [k*b*d || 0, k*(a*d+b), k*a];
  const [constant, middle, leading] = expected;
  const spec = () => ({ type: 'factorization', expected: expected.slice() });
  const q = {
    levelId: 'factorization', subtype: type, tag: labels[type], difficultyBand,
    formula: polynomial([[leading, 'x²'], [middle, 'x'], [constant, '']]),
    questionKey: expected.join(','), stage1Ans: { ans: spec() }, stage2Ans: {},
    steps: []
  };
  function step(key, prompt, answerSpec, hints, solution) {
    q.stage2Ans[key] = answerSpec;
    q.steps.push({ key, prompt, hints, solution });
  }
  function integer(key, prompt, value, hints, solution) {
    step(key, prompt, { type: 'integer', expected: value }, hints, solution);
  }
  if (type === 'common' || type === 'common-composite') {
    if (k !== 1) integer('content', '兩個係數的最大公因數是多少？', k,
      ['先看數字部分。', '列出首項係數的因數。', '由大到小找也能整除一次項係數的數。'],
      `同時能整除 ${leading} 和 ${Math.abs(middle)} 的最大正整數是 ${k}。`);
    const outside = linear(k, 0);
    integer('innerConstant', `提出 ${outside} 後，括號裡的常數是多少？`, b,
      ['找出每一項都有的 x。', '一次項除去公因式後只剩常數。', `把一次項係數 ${middle} 除以 ${k}，保留正負號。`],
      `${linear(middle, 0)} ÷ (${outside}) 的商是 ${b}。`);
  } else if (type === 'difference' || type === 'two-step') {
    if (type === 'two-step') integer('content', '先提出哪個最大的正整數公因數？', k,
      ['留意首項和常數。', '首項係數也可能整除常數。', '試著把兩項都除以首項係數。'],
      `把兩項都除以 ${k}，括號內是 x²−${d*d}。`);
    integer('squareRoot', '平方差中，常數部分的絕對值是哪個正整數的平方？', d,
      ['觀察兩個平方相減。', `找一個正整數，自乘得到 ${d*d}。`, '分解時兩個括號的常數互為相反數。'],
      `${d} × ${d} = ${d*d}，可用平方差公式。`);
  } else if (type === 'square') {
    integer('offset', '寫成 (x 加上一個數) 的平方時，這個數是多少？', b,
      ['比較首項和末項的平方。', '括號裡的常數與一次項係數同號。', '一次項係數是括號裡常數的兩倍。'],
      `${middle} ÷ 2 = ${b}，平方後正好得到常數 ${constant}。`);
  } else if (type === 'cross') {
    Object.assign(q, cardsFor(a, b, d, random));
    step('cardPair', '選出相乘能得到題目的兩張卡。', { type: 'card-pair', expected: q.correctPair },
      ['先看兩張卡的 x 項相乘能否得到首項。', '再檢查兩個常數相乘的大小和正負號。',
        `若有多組都符合，檢查兩個交叉乘積的係數和是否為 ${middle}。`],
      `選「${linear(a, b)}」和「${linear(1, d)}」。首項係數是 ${a}，常數積是 ${constant}，交叉項的係數和是 ${middle}。`);
    integer('crossA', `用「${linear(a, b)}」的 ${a}x 乘「${linear(1, d)}」的常數。所得 x 項係數是多少？`, a*d,
      ['從題目指定的 x 項沿對角線找到另一張的常數。', '先看兩數的符號，決定乘積的正負。',
        `算 ${a} × (${d})，填入帶符號的係數。`],
      `係數 ${a} 乘常數 ${d}，得到 ${a*d}。`);
    integer('crossB', `用「${linear(a, b)}」的常數乘「${linear(1, d)}」的 x 項。所得 x 項係數是多少？`, b,
      ['改沿另一條對角線相乘。', '另一張卡的 x 係數是 1。', '用一次項係數減去剛算出的交叉乘積係數。'],
      `另一個係數是 ${b} × 1 = ${b}，兩者相加得到 ${middle}。`);
  } else {
    const small = Math.min(b, d), large = Math.max(b, d);
    step('numberPair', `哪兩個整數的和為 ${middle}、積為 ${constant}？兩格一起送出，順序不限。`,
      { type: 'sum-product', sum: middle, product: constant },
      ['先列常數絕對值的正因數配對。', constant < 0 ? '積是負數，兩數異號。' : '積是正數，兩數同號。',
        '逐對試加，留下和等於一次項係數的那一對。'],
      `${small} 與 ${large} 相加為 ${middle}，相乘為 ${constant}，兩個條件都成立。`);
  }
  q.steps.push({ key: 'ans2', prompt: '請自行輸入完整因式分解。' });
  q.stage2Ans.ans2 = spec();
  return q;
}

export function buildFactorizationQuestions(count, random = Math.random) {
  if (![10, 20, 30].includes(count)) throw new RangeError('題數須為 10、20 或 30');
  const selected = [];
  for (const [band, types] of Object.entries(families)) {
    const quota = count * (band === 'challenge' ? 0.2 : 0.4);
    const order = shuffle(types, random);
    const pools = order.map(type => shuffle(bank[type], random));
    for (let i = 0; i < quota; i++) {
      const slot = i % types.length;
      selected.push(question(order[slot], band, pools[slot].pop(), random));
    }
  }
  return shuffle(selected, random);
}
