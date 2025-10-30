// テスト: 祝日申請の重複チェック除外動作確認

console.log('=== 祝日申請の重複チェック除外テスト ===\n');

// シミュレーションデータ
const testExpenses = [
  { rowId: 'row1', date: '2025-10-13', from: 'A', to: 'B', remarks: '' }, // 祝日・理由なし
  { rowId: 'row2', date: '2025-10-13', from: 'A', to: 'B', remarks: '' }, // 祝日・理由なし（重複）
  { rowId: 'row3', date: '2025-10-14', from: 'A', to: 'B', remarks: '' }, // 平日
  { rowId: 'row4', date: '2025-10-14', from: 'A', to: 'B', remarks: '' }, // 平日（重複）
  { rowId: 'row5', date: '2025-10-13', from: 'C', to: 'D', remarks: '休日出勤' }, // 祝日・理由あり
  { rowId: 'row6', date: '2025-10-13', from: 'C', to: 'D', remarks: '休日出勤' }, // 祝日・理由あり（重複）
];

const holidays = ['2025-10-13']; // 祝日リスト

// 1. 祝日チェック（重複チェックの前に実施）
const holidayErrors = [];
const holidayErrorRowIds = new Set();

console.log('📋 ステップ1: 祝日チェック');
testExpenses.forEach((expense) => {
  const isHoliday = holidays.includes(expense.date);

  if (isHoliday) {
    const validKeywords = ['休日出勤', '出張', '緊急対応', '出社'];
    const hasValidReason = validKeywords.some(keyword =>
      expense.remarks?.includes(keyword)
    );

    if (!hasValidReason) {
      console.log(`  ❌ ${expense.rowId}: 祝日エラー（理由なし） → 重複チェック対象外`);
      holidayErrors.push({
        type: 'holiday',
        rowId: expense.rowId,
        date: expense.date
      });
      holidayErrorRowIds.add(expense.rowId);
    } else {
      console.log(`  ✅ ${expense.rowId}: 祝日だが理由あり → 重複チェック対象に含む`);
    }
  } else {
    console.log(`  ⚪ ${expense.rowId}: 平日 → 重複チェック対象に含む`);
  }
});

// 2. 重複チェック（祝日エラーの申請を除外）
console.log('\n📋 ステップ2: 重複チェック（祝日エラー除外）');
const routeMap = new Map();

testExpenses.forEach((expense, index) => {
  // 祝日エラーの申請は重複チェック対象外
  if (holidayErrorRowIds.has(expense.rowId)) {
    console.log(`  🚫 ${expense.rowId}: 祝日エラーのためスキップ`);
    return;
  }

  const route = `${expense.from}→${expense.to}`;
  const key = `${expense.date}:${route}`;

  if (!routeMap.has(key)) {
    routeMap.set(key, []);
  }
  routeMap.get(key).push({ ...expense, originalIndex: index });
  console.log(`  ✅ ${expense.rowId}: 重複チェック対象に追加 (key: ${key})`);
});

// 重複検出
console.log('\n📋 ステップ3: 重複検出結果');
const duplicateErrors = [];

routeMap.forEach((expenses, key) => {
  if (expenses.length > 1) {
    console.log(`  🔁 重複検出: ${key} (${expenses.length}件)`);
    expenses.forEach((exp, idx) => {
      if (idx === 0) {
        console.log(`    ✅ ${exp.rowId}: 保持対象`);
        duplicateErrors.push({
          type: 'duplicate',
          subType: 'keep',
          rowId: exp.rowId
        });
      } else {
        console.log(`    🗑️ ${exp.rowId}: 削除対象`);
        duplicateErrors.push({
          type: 'duplicate',
          subType: 'delete',
          rowId: exp.rowId
        });
      }
    });
  } else {
    console.log(`  ⚪ 重複なし: ${key}`);
  }
});

// 最終結果サマリー
console.log('\n📊 最終結果サマリー');
console.log(`祝日エラー: ${holidayErrors.length}件`);
holidayErrors.forEach(err => {
  console.log(`  ❌ ${err.rowId} (${err.date})`);
});

console.log(`\n重複エラー: ${duplicateErrors.filter(e => e.subType === 'delete').length}件 + 保持対象: ${duplicateErrors.filter(e => e.subType === 'keep').length}件`);
duplicateErrors.forEach(err => {
  const icon = err.subType === 'keep' ? '✅' : '🗑️';
  console.log(`  ${icon} ${err.rowId} (${err.subType})`);
});

console.log('\n✨ 期待される動作:');
console.log('  - row1, row2: 祝日エラーのみ表示（重複グループ化なし）');
console.log('  - row3, row4: 重複として検出（row3保持、row4削除）');
console.log('  - row5, row6: 重複として検出（row5保持、row6削除）');
