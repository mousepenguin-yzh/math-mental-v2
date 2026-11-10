const { writeFileSync, readFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { createApp } = require('../tests/helpers/app.cjs');
const output = resolve(__dirname, '../docs/radicals-review-samples.md');
const subtypes = {
  'square-factor':'一般平方因數', 'large-square':'熟悉大平方數', 'hidden-square':'較不明顯平方關係',
  'outer-coefficient':'外係數化簡', 'perfect-square':'完全平方數', 'direct':'直接合併',
  'one-simplify':'一項化簡', 'both-simplify':'兩項化簡', 'zero':'相減為零',
  'integer-product':'整數乘積', 'radical-product':'根式乘積', 'outer-product':'外係數乘法',
  'quotient':'根式除法', 'outer-quotient':'外係數除法'
};
const answer = spec => spec.type === 'integer' ? String(spec.expected) : text(spec.expected);
function text({coefficient:c,radicand:r}) {
  return c === 0 || r === 1 ? String(c) : (c === 1 ? '' : c === -1 ? '−' : c) + '√' + r;
}
const rows = [
  '# 根式運算特訓 V1：合併前人工審查樣本', '',
  '此文件由正式 inline 出題器生成。9 場共 180 題；每場使用新的固定種子 LCG，與測試相同。', '',
  '重現：在專案根目錄執行 '+String.fromCharCode(96)+'node scripts/generate-radical-samples.cjs'+String.fromCharCode(96)+'；只檢查文件是否與正式出題器一致則加 '+String.fromCharCode(96)+'--check'+String.fromCharCode(96)+'。', '',
  '樣本種子固定為 11、42、2026，分別產生 10／20／30 題。basic／medium／challenge 為預期策略分類，不能客觀證明適合所有國二學生。', '',
  '## 人工審查重點', '',
  '- 第一眼是否簡短，能否在約 1～2 個主要心算轉換完成？',
  '- 平方因數是否容易辨識，是否需要紙筆或大量試除？',
  '- 提示是否幫助辨識捷徑，有無洩漏最終答案或安排多餘填空？',
  '- 請特別確認較不明顯的平方關係、兩項化簡與帶外係數除法的負擔。', '',
  '數學自動驗算與心算品質分開驗收；此 PR 等待使用者審查，不自行合併。', ''
];
const all=[];
for (const count of [10,20,30]) for (const seed of [11,42,2026]) {
  const qs=createApp(seed).context.buildQuestions('radicals',count);all.push(...qs);
  rows.push('## '+count+' 題｜seed = '+seed,'',
    '題型配額：'+[.3,.4,.3].map(p=>count*p).join('／')+'；難度配額：'+[.4,.4,.2].map(p=>count*p).join('／')+'。','',
    '| # | 題目 | 標準答案 | 題型／子類 | 難度 | 心算捷徑／數字關係 |',
    '| --- | --- | --- | --- | --- | --- |');
  qs.forEach((q,i)=>rows.push('| '+[i+1,q.formulaHtml,answer(q.stage1Ans.ans),q.tag+'／'+subtypes[q.subtype]+' ('+q.subtype+')',q.difficultyBand,q.mentalStrategy].join(' | ')+' |'));
  rows.push('');
}
rows.push('## 各子類第二階段代表樣本','','方括號為學生填空；「驗算答案」僅供本審查文件，遊戲不顯示。最後答案均需學生自行輸入。','');
const bank=createApp(42).context.radicalCandidates();
const representatives=Object.keys(subtypes).map(s=>all.find(q=>q.subtype===s)||bank.find(q=>q.subtype===s));
// 同一乘法子類的兩種教法都展示：相同根號與先化簡。
representatives.push(bank.find(q=>q.subtype==='integer-product' && Object.keys(q.stage2Ans).length === 1));
for(const q of representatives) {
  rows.push('### '+subtypes[q.subtype]+'｜'+q.formulaHtml+' ('+q.difficultyBand+')','',
    '提示：'+q.stage2Hint,'',
    ...q.stage2Markup.replace(/<div[^>]*>/g,'').split('</div>').filter(Boolean).map(s=>'- '+s.replace(/\[input:([^\]]+)\]/g,'[填空：$1]')),'',
    '驗算答案：'+Object.entries(q.stage2Ans).map(([k,spec])=>k+' = '+answer(spec)).join('；'),'');
}
const stats={};
for(const q of all) stats[q.subtype]=(stats[q.subtype]||0)+1;
let longest=0,maxRun=0,answerRun=0;
for(let start=0;start<all.length;) {
  // Sessions follow 10,10,10,20,20,20,30,30,30; no across-session adjacency.
  const length = start<30 ? 10 : start<90 ? 20 : 30;
  const session=all.slice(start,start+length);
  let run=0,ar=0,last='',lastAnswer='';
  for(const q of session) {
    longest=Math.max(longest,q.formulaHtml.length);
    run=q.subtype===last?run+1:1;maxRun=Math.max(maxRun,run);last=q.subtype;
    const a=answer(q.stage1Ans.ans);ar=a===lastAnswer?ar+1:1;answerRun=Math.max(answerRun,ar);lastAnswer=a;
  }
  start+=length;
}
rows.push('## 樣本心算品質自查','','- 共 '+all.length+' 題；最長題面 '+longest+' 字元；單一子類最長連續 '+maxRun+' 題；相同答案最長連續 '+answerRun+' 題。',
  '- 加減最多兩項，無三項長算式、四則混合、分數係數、多項答案或小數近似。',
  '- 大數由熟悉平方數乘小因數構成；較大被開方數不直接判為挑戰。乘法先配共同因數，除法先取根號內整數商。',
  '- 訂正一般 2 格，兩項化簡 3 格；完全平方數與直接同根相乘僅 1 格，避免重複輸入同一整數。已是同類方根時只引導合併係數。',
  '- 提示使用觀念，不直接列出最終答案；中間欄位與最後答案一起驗算。',
  '- 帶外係數除法用括號標明除數，避免讀成先除後乘。',
  '- 兩項均需化簡者，把辨識兩個熟悉平方視為一組轉換，再合併係數；仍需人工確認工作記憶負擔。',
  '- 目前未以實際學生試作驗證；上述是模板與樣本自查，合併前仍由使用者人工確認。','',
  '| 子類 | 180 題中出現次數 |','| --- | --- |',
  ...Object.keys(subtypes).map(s=>'| '+subtypes[s]+' ('+s+') | '+(stats[s]||0)+' |'),'');
const content=rows.join('\n');
if(process.argv.includes('--check')) {
  if(readFileSync(output,'utf8')!==content) throw new Error('題庫樣本已過期，請重新生成並人工審查');
  console.log('180 題樣本與正式出題器一致');
} else {writeFileSync(output,content);console.log(output);}
