const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createApp } = require('./helpers/app.cjs');

// Independent oracle: prime factorization of the squared magnitude, never calls
// normalizeRadical, parseRadicalAnswer or the production generator's solver.
function fromSquare(square, sign = 1) {
  assert.ok(Number.isSafeInteger(square) && square >= 0);
  if (!square) return { coefficient: 0, radicand: 1 };
  let coefficient = sign, radicand = 1, remaining = square;
  for (let p = 2; p <= remaining; p++) {
    let exponent = 0;
    while (remaining % p === 0) { remaining /= p; exponent++; }
    coefficient *= p ** Math.floor(exponent / 2);
    if (exponent % 2) radicand *= p;
  }
  return { coefficient, radicand };
}
function display(v) {
  const { coefficient:c, radicand:r } = v;
  return c === 0 || r === 1 ? String(c) : (c === 1 ? '' : c === -1 ? '-' : c) + '√' + r;
}
function readPrompt(q) {
  const parts = q.formulaHtml.split(/ ([+−×÷]) /);
  assert.ok(parts.length === 1 || parts.length === 3, 'one or two terms only');
  const terms = parts.filter((_,i) => i % 2 === 0).map(s => {
    const m = /^\(?([1-7]?)√(\d+)\)?$/.exec(s);
    assert.ok(m, 'V1 prompt: ' + s);
    return { coefficient:Number(m[1] || 1), radicand:Number(m[2]) };
  });
  return { terms, op:parts[1] || '√' };
}
function solve(q) {
  const {terms,op} = readPrompt(q), [a,b] = terms;
  const squares = terms.map(t => t.coefficient ** 2 * t.radicand);
  let expected;
  if (op === '√') expected = fromSquare(squares[0]);
  else if (op === '+' || op === '−') {
    const l = fromSquare(squares[0]), r = fromSquare(squares[1]);
    assert.equal(l.radicand,r.radicand, 'like radicals after simplification');
    const c = l.coefficient + (op === '+' ? 1 : -1) * r.coefficient;
    expected = c === 0 ? {coefficient:0,radicand:1} : {coefficient:c,radicand:l.radicand};
  } else if (op === '×') expected = fromSquare(squares[0]*squares[1]);
  else {
    assert.equal(squares[0] % squares[1], 0, 'no fractional coefficient or rationalization required');
    expected = fromSquare(squares[0]/squares[1]);
  }
  return { expected,terms,op };
}
function plain(v) { return JSON.parse(JSON.stringify(v)); }
function verify(q) {
  const {expected,terms,op} = solve(q);
  assert.deepEqual(plain(q.operands),terms);
  assert.equal(q.operator,op);
  assert.deepEqual(plain(q.stage1Ans.ans),{type:'radical',expected,form:'simplest'});
  assert.deepEqual(plain(q.stage2Ans.ans2),{type:'radical',expected,form:'simplest'});
  assert.ok(Math.abs(expected.coefficient) <= (expected.radicand === 1 ? 40 : 20));
  assert.ok(terms.every(t => t.radicand > 0 && t.radicand <= 1200));
  assert.ok(q.mentalStrategy && q.stage2Hint);
  // Derive each intermediate value from displayed operands and the blank's
  // mathematical equation; do not read generator strategy metadata to solve it.
  for (const [key,spec] of Object.entries(q.stage2Ans)) {
    if (key === 'ans2') continue;
    let value;
    if (key === 'left' || key === 'right') {
      const t = terms[key === 'left' ? 0 : 1];
      value = fromSquare(t.coefficient ** 2 * t.radicand).coefficient;
    } else if (key === 'quotient') value = terms[0].radicand/terms[1].radicand;
    else if (key === 'coefficient') value = expected.coefficient;
    else if (key === 'pair') value = fromSquare(terms[0].radicand).radicand;
    else if (key === 'factor') {
      const t = terms.find(t => fromSquare(t.radicand).radicand !== t.radicand);
      assert.ok(t); value = fromSquare(t.coefficient ** 2 * t.radicand).coefficient;
    } else if (key === 'square') {
      const row = q.stage2Markup.split('</div>').find(row => row.includes('[input:square]'));
      const residual = Number(/× (\d+)$/.exec(row)[1]);
      value = terms.reduce((v,t) => v*t.radicand,1)/residual;
      assert.equal(fromSquare(value).radicand,1,'extracted factor is a square');
    } else assert.fail('unverified field: ' + key);
    assert.deepEqual(plain(spec),{type:'integer',expected:value});
    const row = q.stage2Markup.split('</div>').find(row=>row.includes('[input:'+key+']'));
    assert.ok(row,'blank has equation');
    if(key==='left' || key==='right' || key==='factor') {
      const index=key==='left'?0:key==='right'?1:terms.findIndex(t=>fromSquare(t.radicand).radicand!==t.radicand);
      const m=/([^>]+) = \[input:[^\]]+\]√(\d+)$/.exec(row);
      assert.ok(m,row);assert.equal(m[1],q.formulaHtml.split(/ [−+×÷] /)[index].replace(/[()]/g,''));
      assert.equal(Number(m[2]),fromSquare(terms[index].radicand).radicand);
      assert.equal(value**2*Number(m[2]),terms[index].coefficient**2*terms[index].radicand);
    } else if(key==='quotient') {
      assert.ok(row.endsWith(terms[0].radicand+' ÷ '+terms[1].radicand+' = [input:quotient]'),row);
    } else if(key==='coefficient') {
      assert.ok(row.endsWith(terms[0].coefficient+' '+op+' '+terms[1].coefficient+' = [input:coefficient]'),row);
    } else if(key==='square') {
      const m=/(\d+)(?: × (\d+))? = \[input:square\] × (\d+)$/.exec(row);
      assert.ok(m,row);assert.equal(Number(m[1]),terms[0].radicand);
      if(terms.length===2) assert.equal(Number(m[2]),terms[1].radicand);
      else assert.equal(m[2],undefined);
      assert.equal(Number(m[1])*Number(m[2]||1),value*Number(m[3]));
    } else if(key==='pair') {
      assert.ok(row.endsWith('√'+terms[0].radicand+' × √'+terms[1].radicand+' = [input:pair]'),row);
    }
  }
  for (const stage of [1,2]) {
    const keys = [...q['stage'+stage+'Markup'].matchAll(/\[input:([^\]:]+)(?::[^\]]+)?\]/g)].map(m=>m[1]);
    assert.deepEqual(keys.sort(),Object.keys(q['stage'+stage+'Ans']).sort());
  }
  const blanks = Object.keys(q.stage2Ans).length;
  assert.equal(blanks,q.subtype === 'perfect-square' || (q.subtype === 'integer-product' && terms.every(t => t.coefficient === 1 && fromSquare(t.radicand).radicand === t.radicand)) ? 1 : q.subtype === 'both-simplify' ? 3 : 2);
  assert.ok(!q.stage2Hint.includes(display(expected)), 'hint must not contain final answer');
  return expected;
}
function identity(q) {
  const { terms,op } = readPrompt(q);
  const tokens = terms.map(t=>t.coefficient+':'+t.radicand);
  if (op === '+' || op === '×') tokens.sort();
  return op+':'+tokens.join('|');
}

const coverage = new Set();
for (const count of [10,20,30]) test('radicals '+count+': exact quotas, unique prompts and independent mathematics over 100 seeds',()=>{
  for (let seed=1;seed<=100;seed++) {
    const qs = createApp(seed).context.buildQuestions('radicals',count);
    assert.equal(qs.length,count);
    for (const [key,values,ratios] of [
      ['presentationType',['simplify','add-subtract','multiply-divide'],[.3,.4,.3]],
      ['difficultyBand',['basic','medium','challenge'],[.4,.4,.2]]
    ]) values.forEach((v,i)=>assert.equal(qs.filter(q=>q[key]===v).length,count*ratios[i],seed+':'+key));
    assert.equal(new Set(qs.map(identity)).size,count,'commutative duplicates');
    assert.equal(new Set(qs.map(q=>q.questionKey)).size,count);
    assert.equal(new Set(qs.map(q=>q.formulaHtml)).size,count);
    for (const op of ['+','−','×','÷']) assert.ok(qs.some(q=>q.operator===op));
    qs.forEach((q,index)=>{
      try {
        const expected=verify(q);
        coverage.add(q.subtype); coverage.add(q.difficultyBand);
        coverage.add(expected.coefficient<0?'negative':expected.coefficient===0?'zero':'positive');
        coverage.add(expected.radicand===1?'integer':'radical');
        // Every final answer goes through the real typed validator, never floats.
        assert.equal(createValidator(display(expected),q.stage1Ans.ans).status,'correct');
      } catch(e) { e.message = 'seed='+seed+' count='+count+' question='+(index+1)+' type='+q.presentationType+' '+q.formulaHtml+': '+e.message; throw e; }
    });
  }
});
// One VM for pure validation; no per-question VM overhead.
const createValidator = createApp().context.validateTypedAnswer;
test('radical bank covers every subtype, signs and results; every candidate is independently verified',()=>{
  for (const q of createApp().context.radicalCandidates()) verify(q);
  for (const v of ['square-factor','large-square','hidden-square','outer-coefficient','perfect-square','direct','one-simplify','both-simplify','zero','integer-product','radical-product','outer-product','quotient','outer-quotient','basic','medium','challenge','negative','zero','positive','integer','radical']) assert.ok(coverage.has(v),v);
});
test('radical seeds reproduce sessions, sessions own their mutable data, unsupported counts fail',()=>{
  const generate=seed=>JSON.stringify(createApp(seed).context.buildQuestions('radicals',30));
  assert.equal(generate(123),generate(123)); assert.notEqual(generate(123),generate(124));
  const app=createApp(); const qs=app.context.buildQuestions('radicals',30); qs[0].enteredStage2=true; qs[0].stage1Ans.ans.expected.coefficient=999;
  const next=app.context.buildQuestions('radicals',30); assert.ok(next.every(q=>!q.enteredStage2 && q.stage1Ans.ans.expected.coefficient!==999));
  assert.throws(()=>app.context.buildQuestions('radicals',12));
});

test('sixth challenge: 30 real questions, every correction field, stars, errors, guided count and report',()=>{
  const app=createApp(72);
  app.context.selectDifficulty('radicals');app.context.selectCount(30);app.context.startGame();
  assert.equal(app.el('difficulty-label').textContent,'根式運算特訓');
  let corrected=0;
  for(let i=0;i<30;i++) {
    const q=app.state.questions[i], expected=verify(q);
    app.fill({ans:'2√'});app.context.checkAnswer();
    assert.equal(q.firstTry,true);assert.equal(q.currentStage,1);
    app.fill({ans:'3+√2'});app.context.checkAnswer();assert.equal(q.firstTry,true);
    if(i%2===0) {
      app.fill({ans:display(expected)});app.context.checkAnswer();app.key('Enter');
    } else {
      corrected++;
      app.fill({ans:'-999'});app.context.checkAnswer();app.tick(599);assert.equal(q.currentStage,1);
      app.tick(1);assert.equal(q.currentStage,2);assert.equal(q.enteredStage2,true);
      const values=Object.fromEntries(Object.entries(q.stage2Ans).map(([k,v])=>[k,v.type==='integer'?String(v.expected):display(v.expected)]));
      // Each blank must be correct, including the student-entered final answer.
      for(const key of Object.keys(values)) {
        app.fill({...values,[key]:'-999'});app.context.checkAnswer();assert.equal(q.answerState,'answering');
      }
      app.fill(values);app.context.checkAnswer();app.key('Enter');
    }
    app.tick(1499);assert.equal(app.state.currentIndex,i);app.tick(1);
  }
  assert.equal(app.state.goldenStars,15);
  assert.equal(Object.values(app.state.errorLog).reduce((a,b)=>a+b,0),corrected);
  assert.equal(app.el('report-guided').textContent,'15 題');assert.equal(app.el('star-rate-text').textContent,'50%');
  assert.equal(app.pendingCallbacks().length,0);
  for(const [cat,pattern] of [['Radical_Simplify',/平方因數/],['Radical_AddSubtract',/係數/],['Radical_MultiplyDivide',/相除/]]) {
    app.state.errorLog={[cat]:1}; assert.match(app.context.getDiagnosis(0),pattern);
  }
});
test('generated radicals: unsimplified retry loses star without correction or guided count',()=>{
  const app=createApp();
  const qs=app.context.buildQuestions('radicals',30);
  const q=qs.find(q=>Math.abs(q.stage1Ans.ans.expected.coefficient)%2===0 && q.stage1Ans.ans.expected.coefficient!==0);
  app.mount([q]); const v=verify(q);
  app.fill({ans:(v.coefficient/2)+'√'+(v.radicand*4)});app.context.checkAnswer();
  assert.equal(q.firstTry,false);assert.equal(q.currentStage,1);assert.equal(q.enteredStage2,false);
  app.fill({ans:display(v)});app.context.checkAnswer();app.tick(1500);
  assert.equal(app.state.goldenStars,0);assert.equal(app.el('report-guided').textContent,'0 題');
});
for(const correct of [true,false]) test('generated radicals exit/reopen isolates '+(correct?'success':'correction')+' callbacks',()=>{
  const app=createApp(7);app.context.selectDifficulty('radicals');app.context.startGame();
  const q=app.state.questions[0];app.fill({ans:correct?display(verify(q)):'-999'});app.context.checkAnswer();
  const callbacks=app.pendingCallbacks();app.context.triggerExitCheck();app.key('Enter');app.context.confirmExit();
  assert.equal(app.pendingCallbacks().length,0);
  app.context.selectDifficulty('radicals');app.context.selectCount(20);app.context.startGame();
  const fresh=app.state.questions[0];callbacks.forEach(fn=>fn());app.tick(5000);
  assert.equal(app.state.currentIndex,0);assert.equal(fresh.currentStage,1);assert.equal(fresh.firstTry,true);
  assert.equal(app.state.goldenStars,0);assert.deepEqual(plain(app.state.errorLog),{});
  assert.equal(app.el('stage-2-container').classList.contains('open'),false);
});

test('six challenge cards preserve stable IDs and order; review samples stay reproducible',()=>{
  const {readFileSync}=require('node:fs');const {resolve}=require('node:path');
  const {execFileSync}=require('node:child_process');
  const html=readFileSync(resolve(__dirname,'../index.html'),'utf8');
  assert.deepEqual([...html.matchAll(/id="btn-diff-([^"]+)"/g)].map(m=>m[1]),['1','2','3','4','pythagorean','radicals']);
  const result=execFileSync(process.execPath,[resolve(__dirname,'../scripts/generate-radical-samples.cjs'),'--check'],{encoding:'utf8'});
  assert.match(result,/180/);
});
