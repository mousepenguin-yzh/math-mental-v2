const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./helpers/app.cjs');

const text = (html) => html.replace(/<[^>]*>/g, '').replace(/\s+/g, ' ').trim();
const close = (actual, expected) => assert.ok(Math.abs(Number(actual) - expected) < 1e-8, `${actual} != ${expected}`);
const signed = (op, value) => op === '+' ? Number(value) : -Number(value);
const fraction = (a, prefix) => Number(a[`${prefix}_num`]) / Number(a[`${prefix}_den`]);

// Read operands from the displayed problem, never from the generated answer.
function verify(q, coverage) {
  const f = text(q.formulaHtml), a = q.stage1Ans, s = q.stage2Ans;
  let m, expected;
  switch (q.category) {
    case 'Arithmetic_Sign':
      if (f.includes('×')) {
        m = /^(-?\d+) ([+-]) \(?(-?\d+)\)? × \(?(-?\d+)\)?$/.exec(f);
        assert.ok(m, f);
        const product = Number(m[3]) * Number(m[4]);
        close(s.step1, product);
        expected = Number(m[1]) + signed(m[2], product);
        coverage.add('multiply');
      } else {
        m = /^(-?\d+) ÷ \(?(-?\d+)\)? ([+-]) \(?(-?\d+)\)?$/.exec(f);
        assert.ok(m, f);
        close(s.step1, Number(m[1]) / Number(m[2]));
        expected = Number(m[1]) / Number(m[2]) + signed(m[3], m[4]);
        coverage.add('divide');
      }
      break;
    case 'Arithmetic_Fraction': {
      m = /^(\d+)\/(\d+) ([+-]) (\d+)\/(\d+)$/.exec(f);
      assert.ok(m, f);
      const left = Number(m[1]) / Number(m[2]), right = Number(m[4]) / Number(m[5]);
      expected = left + signed(m[3], right);
      close(fraction(a, 'ans'), expected);
      close(fraction(s, 's1'), left);
      close(fraction(s, 's2'), right);
      close(fraction(s, 'ans2'), expected);
      assert.equal(s.s1_den, s.s2_den);
      const den = Number(s.s1_den);
      assert.equal(den % Number(m[2]), 0);
      assert.equal(den % Number(m[5]), 0);
      assert.ok(!Array.from({ length: den - 1 }, (_, i) => i + 1)
        .some((d) => d % Number(m[2]) === 0 && d % Number(m[5]) === 0), 'least common denominator');
      return;
    }
    case 'Exponent_Trap': {
      m = /^(\()?-([2-5])\)?([²³]) ([+-]) (\d+)$/.exec(f);
      assert.ok(m, f);
      const exp = m[3] === '²' ? 2 : 3;
      const term = m[1] ? (-Number(m[2])) ** exp : -(Number(m[2]) ** exp);
      close(s.exp_step, term);
      expected = term + signed(m[4], m[5]);
      coverage.add(`exponent:${Boolean(m[1])}:${exp}`);
      break;
    }
    case 'Equation_Bracket':
      m = /^(\d+)\(x ([+-]) (\d+)\) = (-?\d+)$/.exec(f);
      assert.ok(m, f);
      expected = Number(m[4]) / Number(m[1]) - signed(m[2], m[3]);
      close(s.step1, Number(m[1]) * Number(m[3]));
      close(s.step2, Number(m[4]) - Number(m[1]) * signed(m[2], m[3]));
      break;
    case 'Equation_Transpose':
      m = /^\(x ([+-]) (\d+)\) \/ (\d+) = (-?\d+)$/.exec(f);
      assert.ok(m, f);
      expected = Number(m[4]) * Number(m[3]) - signed(m[1], m[2]);
      close(s.step1, Number(m[4]) * Number(m[3]));
      break;
    case 'Equation_Ratio': {
      const terms = f.split(/ : | = /);
      assert.equal(terms.length, 4);
      const pos = terms.findIndex((t) => t.includes('x'));
      const expr = terms[pos];
      const offset = expr === 'x' ? 0 : expr.includes('+') ? 1 : -1;
      const n = terms.map(Number);
      const opposite = [3, 2, 1, 0][pos];
      const others = [0, 1, 2, 3].filter((i) => i !== pos && i !== opposite);
      const product = n[others[0]] * n[others[1]];
      const unknown = product / n[opposite];
      expected = unknown - offset;
      n[pos] = Number(a.ans) + offset;
      close(n[0] * n[3], n[1] * n[2]);
      close(s.step1, product);
      close(s.step2, unknown);
      const guided = text(q.stage2Markup);
      assert.ok(guided.includes(`${terms[0]} × ${terms[3]} = ${terms[1]} × ${terms[2]}`));
      assert.ok(guided.includes(`${product} ÷ ${n[opposite]}`));
      coverage.add(`ratio:${pos}:${offset}`);
      break;
    }
    case 'Formula_Identity':
      if ((m = /^(\d+(?:\.\d+)?)²$/.exec(f))) {
        expected = Number(m[1]) ** 2;
        const whole = Math.floor(Number(m[1]));
        close(s.step1, 2 * whole * (Number(m[1]) - whole));
      } else if ((m = /^(\d+) × (\d+)$/.exec(f))) {
        expected = Number(m[1]) * Number(m[2]);
        close(s.step1, ((Number(m[2]) - Number(m[1])) / 2) ** 2);
      } else {
        m = /^(\d+)² ([+-]) 2 × (\d+) × (\d+) \+ (\d+)²$/.exec(f);
        assert.ok(m, f);
        assert.equal(m[1], m[3]); assert.equal(m[4], m[5]);
        expected = Number(m[1]) ** 2 + signed(m[2], 2 * Number(m[3]) * Number(m[4])) + Number(m[5]) ** 2;
        if (m[2] === '+') {
          close(s.step1, Number(m[1])); close(s.step2, Number(m[4]));
          close(s.step3, Number(m[1]) + Number(m[4]));
        } else {
          close(s.step1, Number(m[4])); close(s.step2, Number(m[1]) - Number(m[4]));
        }
      }
      break;
    case 'Common_Sense_Square':
      if ((m = /^(\d+)²$/.exec(f))) {
        expected = Number(m[1]) ** 2;
        close(q.a + q.b, Number(m[1]));
        close(s.step1, q.a * q.b); close(s.step2, q.a * q.b);
      } else {
        m = /^x² = (\d+)，求 x = ？$/.exec(f);
        assert.ok(m, f);
        // Positive root is a valid solution; uniqueness and hints have TODO cases.
        expected = Math.sqrt(Number(m[1]));
        for (const key of ['step1', 'step2']) {
          if (s[key] !== undefined) close(Number(s[key]) ** 2 % 10, Number(m[1]) % 10);
        }
      }
      break;
    case 'Common_Sense_Log':
      m = /^(\d+)x = (\d+)，求 x = ？$/.exec(f);
      assert.ok(m, f);
      expected = Math.round(Math.log(Number(m[2])) / Math.log(Number(m[1])));
      close(Number(m[1]) ** expected, Number(m[2])); close(s.step1, Number(m[2]));
      break;
    case 'Common_Sense_Geometry': {
      const g = q.geomParams;
      const hyp = g.unknown === 'hypotenuse';
      expected = hyp ? Math.sqrt(g.sideA ** 2 + g.sideB ** 2) : Math.sqrt(g.sideC ** 2 - g.sideA ** 2);
      const nums = f.match(/\d+/g).map(Number);
      assert.deepEqual(nums, hyp ? [g.sideA, g.sideB] : [g.sideC, g.sideA]);
      const sides = [g.sideA, hyp ? g.sideB : expected, hyp ? expected : g.sideC];
      const trip = [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25]].find((t) => sides.every((n, i) => n / t[i] === sides[0] / t[0]));
      assert.ok(trip, 'existing Pythagorean triple');
      const scale = sides[0] / trip[0];
      assert.ok([1, 2, 3].includes(scale));
      close(s.step1, hyp ? trip[2] : trip[1]); close(s.step2, scale);
      coverage.add(`geometry:${trip.join(',')}:${scale}:${hyp}`);
      break;
    }
    case 'Common_Sense_Factor':
      m = /^(\d+) = (\d+) × x，求 x = ？$/.exec(f);
      assert.ok(m, f);
      expected = Number(m[1]) / Number(m[2]); close(s.step1, expected);
      break;
    case 'Common_Sense_Fraction':
      if (q.tag === '小數轉換分數') {
        expected = Number(/\d+\.\d+/.exec(f)[0]);
        close(fraction(a, 'ans'), expected); close(fraction(s, 'ans2'), expected);
        close(s.step1, expected / 0.125);
        return;
      }
      m = /請將分數 (\d+)\s*8 化為小數/.exec(f);
      assert.ok(m, f);
      expected = Number(m[1]) / 8; close(s.step1, expected);
      break;
    default: assert.fail(`Unverified category: ${q.category}`);
  }
  close(a.ans, expected); close(s.ans2, expected);
}

function fields(markup) {
  return [...markup.matchAll(/\[(input|fraction):([^\]]+)\]/g)]
    .flatMap((m) => m[1] === 'fraction' ? m[2].split(':') : [m[2].split(':')[0]]).sort();
}

test('all four challenges produce exactly 10, 20 and 30 valid questions', () => {
  const app = createApp();
  for (const diff of [1, 2, 3, 4]) for (const count of [10, 20, 30]) {
    assert.equal(app.context.buildQuestions(diff, count).length, count);
  }
});

test('fixed seeds reproduce questions', () => {
  const generate = (seed) => JSON.stringify(createApp(seed).context.buildQuestions(4, 30));
  assert.equal(generate(42), generate(42));
  assert.notEqual(generate(42), generate(43));
});

test('seed 0x5eed: independent mathematics, answer fields and representative branches', () => {
  const app = createApp(0x5eed), coverage = new Set(), tags = new Set();
  for (const diff of [1, 2, 3, 4]) {
    app.context.buildQuestions(diff, 1200).forEach((q, index) => {
      try {
        tags.add(q.tag);
        for (const key of ['category', 'tag', 'formulaHtml', 'stage2Hint']) assert.ok(q[key]);
        for (const stage of [1, 2]) {
          assert.deepEqual(fields(q[`stage${stage}Markup`]), Object.keys(q[`stage${stage}Ans`]).sort());
          for (const value of Object.values(q[`stage${stage}Ans`])) {
            assert.equal(typeof value, 'string'); assert.ok(value.trim()); assert.ok(Number.isFinite(Number(value)));
          }
          for (const key of Object.keys(q[`stage${stage}Ans`]).filter((k) => k.endsWith('_den'))) {
            assert.notEqual(Number(q[`stage${stage}Ans`][key]), 0);
          }
        }
        for (const group of q.interchangeableGroups || []) {
          assert.equal(new Set(group).size, group.length);
          for (const key of group) assert.ok(Object.hasOwn(q.stage2Ans, key));
        }
        verify(q, coverage);
      } catch (error) {
        error.message = `seed=0x5eed difficulty=${diff} index=${index} ${q.tag}: ${error.message}`;
        throw error;
      }
    });
  }
  assert.deepEqual([...tags].sort(), ['正負整數混合', '分數運算通分', '指數運算陷阱', '去括號與移項', '分數方程式', '比與比例式', '和的平方巧算', '平方差公式', '逆向和平方', '逆向差平方', '平方數與面積模型', '逆向根特徵反查', '高頻指數反查', '畢氏邊長縮放', '大數因數拆解', '小數轉換分數', '分數轉換小數'].sort());
  for (let pos = 0; pos < 4; pos++) for (const offset of [0, 1, -1]) assert.ok(coverage.has(`ratio:${pos}:${offset}`));
  for (const trip of ['3,4,5', '5,12,13', '8,15,17', '7,24,25']) for (const scale of [1, 2, 3]) for (const hyp of [true, false]) assert.ok(coverage.has(`geometry:${trip}:${scale}:${hyp}`));
  for (const paren of [true, false]) for (const exp of [2, 3]) assert.ok(coverage.has(`exponent:${paren}:${exp}`));
  assert.ok(coverage.has('multiply')); assert.ok(coverage.has('divide'));
});
