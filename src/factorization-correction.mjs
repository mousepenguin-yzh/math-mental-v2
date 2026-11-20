import { factorizationLimits, validateFactorizationAnswer } from './factorization-answer.mjs';

function readInteger(raw) {
  if (raw == null) return 'incomplete';
  if (typeof raw === 'string') {
    if (raw.length > factorizationLimits.length) return 'invalid';
    const text = raw.trim().replaceAll('−', '-');
    if (text === '' || text === '+' || text === '-') return 'incomplete';
    if (!/^[+-]?\d+$/.test(text)) return 'invalid';
    raw = Number(text);
  }
  return Number.isSafeInteger(raw) && Math.abs(raw) <= factorizationLimits.coefficient ? raw : 'invalid';
}

function pairStatus(spec, input, cardCount) {
  if (input == null) return 'incomplete';
  if (!Array.isArray(input) || input.length > 2) return 'invalid';
  const [first, second] = input;
  if (first == null || second == null) return 'incomplete';
  if (spec.type === 'sum-product') {
    const a = readInteger(first), b = readInteger(second);
    if (a === 'incomplete' || b === 'incomplete') return 'incomplete';
    if (a === 'invalid' || b === 'invalid') return 'invalid';
    return a+b === spec.sum && a*b === spec.product ? 'correct' : 'incorrect';
  }
  if (first === second || !input.every(i => Number.isInteger(i) && i >= 0 && i < cardCount)) return 'invalid';
  return spec.expected.includes(first) && spec.expected.includes(second) ? 'correct' : 'wrong-pair';
}

// Evaluate only through the first unfinished step, even when a caller retains
// later inputs from a previous attempt. A pair never has per-field feedback.
export function checkFactorizationCorrection(question, responses = {}) {
  for (const { key } of question.steps) {
    const spec = question.stage2Ans[key], input = responses[key];
    let status;
    switch (spec.type) {
      case 'sum-product':
      case 'card-pair':
        status = pairStatus(spec, input, question.cards?.length);
        break;
      case 'integer': {
        const value = readInteger(input);
        status = typeof value === 'number' ? (value === spec.expected ? 'correct' : 'incorrect') : value;
        break;
      }
      case 'factorization': {
        const result = validateFactorizationAnswer(input ?? '', spec);
        if (result.accepted) return { key, status: 'complete' };
        return { key, status: result.reason === 'incomplete' ? 'incomplete' : result.status };
      }
      default: throw new Error('未知的訂正步驟類型');
    }
    if (status !== 'correct') return { key, status };
  }
  throw new Error('缺少最終完整分解步驟');
}
