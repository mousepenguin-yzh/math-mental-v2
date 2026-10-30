const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const vm = require('node:vm');

const html = readFileSync(resolve(__dirname, '../../index.html'), 'utf8');
const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)]
  .filter((m) => !/\bsrc\s*=/.test(m[1])).map((m) => m[2]);
assert.equal(scripts.length, 2, 'Revisit the harness if inline script structure changes');

function seededRandom(seed) {
  return () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 4294967296;
  };
}

// Only the DOM operations exercised by these tests, not a browser implementation.
class Element {
  constructor(attrs = {}) {
    this.attrs = attrs;
    this.classes = new Set((attrs.class || '').split(/\s+/));
    this.classList = {
      add: (...names) => names.forEach((n) => this.classes.add(n)),
      remove: (...names) => names.forEach((n) => this.classes.delete(n)),
      contains: (name) => this.classes.has(name),
    };
    this.style = { setProperty(name, value) { this[name] = value; } };
    this.textContent = '';
    this.children = [];
  }
  set innerHTML(value) {
    this.content = value;
    this.children = [...value.matchAll(/<div\b([^>]*data-input-id="[^"]+"[^>]*)>/g)]
      .map((m) => new Element(Object.fromEntries(
        [...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map((a) => [a[1], a[2]]))));
  }
  get innerHTML() { return this.content || ''; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  getAttribute(name) { return this.attrs[name] ?? null; }
  querySelector(selector) {
    if (selector === '.caret-blink') return null;
    if (selector === '.math-input') return this.children[0] || null;
    if (selector === '.check-dot') return null;
    throw new Error(`Unsupported element selector: ${selector}`);
  }
  scrollTo() {}
  scrollIntoView() {}
}

function createApp(seed = 0x5eed) {
  const ids = new Map([...html.matchAll(/\bid="([^"]+)"[^>]*>/g)]
    .map((m) => [m[1], new Element({ class: /\bclass="([^"]*)"/.exec(m[0])?.[1] || '' })]));
  const main = new Element();
  const document = {
    documentElement: new Element(),
    getElementById: (id) => ids.get(id) || null,
    addEventListener() {},
    querySelector(selector) {
      if (selector === '.app-main') return main;
      const area = /^#([\w-]+) \.math-input$/.exec(selector);
      if (area) return ids.get(area[1]).querySelector('.math-input');
      const input = /^\[data-input-id="([^"]+)"\]$/.exec(selector);
      if (input) return [...ids.values()].flatMap((el) => el.children)
        .find((el) => el.getAttribute('data-input-id') === input[1]) || null;
      throw new Error(`Unsupported document selector: ${selector}`);
    },
    querySelectorAll(selector) {
      const suffix = { '.diff-btn': 'btn-diff-', '.count-btn': 'btn-count-' }[selector];
      assert.ok(suffix, `Unsupported selector: ${selector}`);
      return [...ids].filter(([id]) => id.startsWith(suffix)).map(([, el]) => el);
    },
  };
  let now = 0, nextId = 0;
  const timers = new Map();
  const math = Object.create(Math);
  math.random = seededRandom(seed);
  const context = vm.createContext({
    document, Math: math, tailwind: {},
    window: { innerHeight: 800, addEventListener() {} },
    Date: class extends Date { static now() { return now; } },
    setTimeout(fn, delay) { const id = ++nextId; timers.set(id, { fn, at: now + delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
  });
  scripts.forEach((source) => vm.runInContext(source, context, { timeout: 1000 }));
  const state = vm.runInContext('state', context);
  return {
    context, state, document,
    el: (id) => { assert.ok(ids.has(id), `Missing element ${id}`); return ids.get(id); },
    tick(ms) {
      const end = now + ms;
      let iterations = 0;
      for (;;) {
        const next = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!next) break;
        assert.ok(++iterations < 10000, 'Timer loop');
        now = next[1].at;
        timers.delete(next[0]);
        next[1].fn();
      }
      now = end;
    },
    fill(values) {
      for (const [key, value] of Object.entries(values)) {
        const el = document.querySelector(`[data-input-id="q_${state.currentIndex}_${key}"]`);
        assert.ok(el, `Missing answer input ${key}`);
        el.setAttribute('data-value', value);
      }
    },
    mount(questions) {
      Object.assign(state, { questions, qCount: questions.length, currentIndex: 0, goldenStars: 0, errorLog: {}, startTime: now });
      context.loadQuestion();
    },
  };
}

function question(overrides = {}) {
  return {
    category: 'Arithmetic_Sign', tag: 'fixture', formulaHtml: '2 + 3',
    stage1Markup: '[input:ans:w-14]', stage1Ans: { ans: '5' },
    stage2Markup: '[input:step1:w-14] = [input:ans2:w-14]',
    stage2Ans: { step1: '2', ans2: '5' }, stage2Hint: 'fixture hint', ...overrides,
  };
}

module.exports = { createApp, question };
