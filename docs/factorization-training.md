# 因式分解特訓 V1

PR 1 提供兩個可在瀏覽器與 Node 匯入的純 JavaScript 模組。正式首頁與作答流程仍由既有六關使用。

## 題庫與訂正

從 `src/factorization-questions.mjs` 匯入 `buildFactorizationQuestions(count, random = Math.random)`。每場 10／20／30 題，三個難度分別配 4／4／2、8／8／4、12／12／6 題。每一難度內輪流抽取各模板，數量最多相差一題，再洗牌整場。候選庫按展開後的三個係數分成互斥模板，各模板無放回抽取。

| 難度 | 模板 | 預期心算策略 |
| --- | --- | --- |
| 基礎 | 提公因式、平方差、完全平方、首一二次式 | 找兩項共有的 x、辨認 2～6 的平方，或找出兩個相異正整數的和與積。 |
| 中等 | 複合公因式、帶負數配對、兩步驟分解 | 提出 2x 或 3x、利用和積決定符號，或先提出 2 或 3 再辨認平方差。 |
| 挑戰 | 十字交乘 | 首項係數 2 或 3。從三張首一、三張非首一的一次因式卡找出兩張，使常數積與交叉項的和都吻合。 |

題目含 `levelId: 'factorization'`、純文字 `formula`、`questionKey`、`subtype`、`difficultyBand`、`tag`。挑戰題另附六張相異的 `cards`，以及從 0 起算、由小到大排列的 `correctPair`。每場產生獨立的可變物件。

`stage1Ans.ans` 與 `stage2Ans.ans2` 使用相同的數學規格。訂正按 `steps` 順序顯示，各步的 `key` 對應 `stage2Ans` 欄位。中間步有整數答案、`prompt`、三條遞進的 `hints` 與本步 `solution`。最後一步僅要求學生自行輸入完整分解；選對卡片或完成中間值都不能取代最後作答。PR 2 可依學生操作逐步顯示這些資料。

## 判定接口

從 `src/factorization-answer.mjs` 匯入 `validateFactorizationAnswer(raw, spec)`。V1 題規格是可拆成整數與一次因式的多項式，`expected` 依常數、一次項、二次項排序。例如 `{ type: 'factorization', expected: [-18, 0, 2] }` 表示 2x²−18。

| status | 此題範例 | 意義 |
| --- | --- | --- |
| `correct` | `(3+x)(3-x)(-2)` | 等值，已完整分解，`accepted: true` |
| `equivalent-not-factored` | `2(x²-9)`、`(2x-6)(x+3)` | 相乘後相同，仍有二次式或括號內公因數可拆 |
| `incorrect` | `2(x-3)²` | 合法算式，係數不同 |
| `invalid` | `2(x-`、`x/2`、超界輸入 | `reason` 區分 `incomplete`、`syntax`、`limit`；規格結構錯誤為 `invalid-spec` |

`parseFactorizationAnswer(raw)` 回傳 `{ ok: true, value, complete }` 或 `{ ok: false, reason }`。先依通常優先序計算整數係數，同時保留乘法因式邊界。每個加減組成的因式化簡後須是常數或係數互質的一次式。數字公因數可合寫或分寫，不要求質因數分解。乘積、括號、平方與一元負號可任意重組。

語法使用小寫 x、十進位整數、正負號（支援 −）、括號、乘法（省略、*、×）、² 或 ^2。平方優先於前置負號。空白分隔的兩個整數需寫明乘號。單次輸入上限 160 個 UTF-16 單元，多項式最高 8 次，輸入與中途累加的係數絕對值最多 1,000,000。加減按係數數量、乘法按係數配對數量計費，最多 512 次。兩數相乘與累加都在 JavaScript 可精確表示的整數範圍內；直接比對係數。

## 驗收

`npm test` 會從可見題面讀取係數，以整除找公因數、代入整數根及多項式除法重建因式；逐項比對答案規格、訂正值與解法中的數字，再檢查正式判定器能接受獨立求出的答案。10／20／30 題各跑種子 1～100，共 6,000 題。每道挑戰題另展開全部 15 組卡片配對。

[固定種子的一場 10 題與訂正試讀](factorization-review-samples.md) 供人工確認心算負擔與提示用語。
