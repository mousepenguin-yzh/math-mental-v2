const { readFileSync, writeFileSync } = require('node:fs');
const { resolve } = require('node:path');
const { buildFactorizationQuestions } = require('../src/factorization-questions.mjs');
const { seededRandom } = require('../tests/helpers/app.cjs');
const { solvePrompt } = require('../tests/helpers/factorization-oracle.cjs');

const seed = 42;
const questions = buildFactorizationQuestions(10, seededRandom(seed));
const bands = { basic: '基礎', medium: '中等', challenge: '挑戰' };
const rows = ['# 因式分解 V1 人工審查樣本', '',
  '固定種子 42 的一場 10 題，涵蓋八種模板。答案範例由題面獨立求出。執行 `node scripts/generate-factorization-samples.cjs` 可重建，附加 `--check` 可核對版本。', '',
  '| 題號 | 難度 | 題型 | 題面 | 完整分解範例 |',
  '| --- | --- | --- | --- | --- |'];
questions.forEach((q,i) => rows.push('| '+[i+1, bands[q.difficultyBand], q.tag, q.formula, solvePrompt(q.formula).answer].join(' | ')+' |'));
rows.push('', '## 挑戰卡片', '');
questions.forEach((q,i) => {
  if (q.cards) rows.push(`- 第 ${i+1} 題依序為 ${q.cards.join('、')}。審查用正解為第 ${q.correctPair.map(n => n+1).join('、')} 張。`);
});
rows.push('', '## 訂正試讀', '');
for (const band of Object.keys(bands)) {
  const q = questions.find(item => item.difficultyBand === band);
  rows.push('### '+q.tag+'　'+q.formula, '');
  for (const step of q.steps) {
    rows.push('- '+step.prompt);
    if (step.hints) rows.push('  - '+step.hints.join(' → '), '  - 本步解法　'+step.solution);
  }
  rows.push('');
}
rows.push('試作時請記下需要紙筆的題號，特別留意負數和積配對、先提公因數後辨認平方差，以及六張卡片能否靠交叉乘積有效排除。可先遮住答案與解法，再逐條閱讀提示。', '');
const content = rows.join('\n');
const output = resolve(__dirname, '../docs/factorization-review-samples.md');
if (process.argv.includes('--check')) {
  if (readFileSync(output, 'utf8').replaceAll('\r\n', '\n') !== content) throw Error('請重新生成因式分解審查樣本');
} else writeFileSync(output, content);
