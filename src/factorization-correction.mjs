import {
  factorizationLimits,
  validateFactorizationAnswer,
  validateMonomialAnswer,
} from './factorization-answer.mjs';

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

export function parseLinearCard(card) {
  if (typeof card !== 'string') return null;
  const match = /^(\d*)x([+−-])(\d+)$/.exec(card.trim());
  if (!match) return null;
  const xCoeff = match[1] ? Number(match[1]) : 1;
  const constant = Number(match[3]) * (match[2] === '+' ? 1 : -1);
  if (!Number.isSafeInteger(xCoeff) || !Number.isSafeInteger(constant)) return null;
  return { xCoeff, constant };
}

// Compute the exact leading, constant and cross-term products of any two distinct cards
// against the target polynomial so local arithmetic is always judged against the chosen pair.
export function inspectCrossCardPair(question, cardPair) {
  if (!Array.isArray(cardPair) || cardPair.length !== 2) return null;
  const [i, j] = cardPair;
  const cardCount = question?.cards?.length || 0;
  if (i === j || !Number.isInteger(i) || !Number.isInteger(j) ||
      i < 0 || i >= cardCount || j < 0 || j >= cardCount) {
    return null;
  }
  const first = parseLinearCard(question.cards[i]);
  const second = parseLinearCard(question.cards[j]);
  const expected = question?.stage1Ans?.ans?.expected;
  if (!first || !second || !Array.isArray(expected) || expected.length !== 3) return null;
  const [targetConstant, targetMiddle, targetLeading] = expected;
  const leadingProduct = first.xCoeff * second.xCoeff;
  const constantProduct = first.constant * second.constant;
  const outerProduct = first.xCoeff * second.constant;
  const innerProduct = first.constant * second.xCoeff;
  const middleSum = outerProduct + innerProduct;
  return {
    indices: [i, j],
    cards: [question.cards[i], question.cards[j]],
    first,
    second,
    leadingProduct,
    constantProduct,
    outerProduct,
    innerProduct,
    middleSum,
    targetLeading,
    targetConstant,
    targetMiddle,
    leadingOk: leadingProduct === targetLeading,
    constantOk: constantProduct === targetConstant,
    middleOk: middleSum === targetMiddle,
    allOk: leadingProduct === targetLeading &&
      constantProduct === targetConstant &&
      middleSum === targetMiddle,
  };
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

function checkCrossStep(question, input) {
  if (input == null) return { status: 'incomplete', reason: 'cards' };
  if (typeof input !== 'object' || Array.isArray(input)) return { status: 'invalid' };
  const { cardPair, middle } = input;
  if (cardPair == null) return { status: 'incomplete', reason: 'cards' };
  if (!Array.isArray(cardPair) || cardPair.length > 2) return { status: 'invalid' };
  if (cardPair.length < 2 || cardPair[0] == null || cardPair[1] == null) {
    return { status: 'incomplete', reason: 'cards' };
  }
  const diagnostic = inspectCrossCardPair(question, cardPair);
  if (!diagnostic) return { status: 'invalid' };
  if (!diagnostic.leadingOk) return { status: 'leading-mismatch', diagnostic };
  if (!diagnostic.constantOk) return { status: 'constant-mismatch', diagnostic };
  const mid = readInteger(middle);
  if (mid === 'incomplete') return { status: 'need-middle', diagnostic };
  if (mid === 'invalid') return { status: 'invalid', diagnostic };
  if (mid !== diagnostic.middleSum) return { status: 'middle-arithmetic-wrong', diagnostic };
  if (!diagnostic.middleOk) return { status: 'middle-mismatch', diagnostic };
  return { status: 'correct', diagnostic };
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
      case 'cross-check': {
        const result = checkCrossStep(question, input);
        if (result.status !== 'correct') return { key, ...result };
        status = 'correct';
        break;
      }
      case 'monomial': {
        const result = validateMonomialAnswer(input ?? '', spec);
        status = result.accepted ? 'correct' : (result.reason === 'incomplete' ? 'incomplete' : result.status);
        break;
      }
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
