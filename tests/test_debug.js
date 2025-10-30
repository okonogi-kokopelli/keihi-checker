// デバッグ用: スコアリング詳細を表示

function normalizeDate(dateStr) {
  const cleaned = dateStr.replace(/[年月]/g, '-').replace(/日/g, '').trim();
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

function selectKeepExpenseDebug(duplicates, allExpenses) {
  if (duplicates.length === 1) {
    return duplicates[0];
  }

  const targetDate = normalizeDate(duplicates[0].date);

  console.log(`\n🔍 スコアリング詳細 (対象日付: ${targetDate})`);

  const scored = duplicates.map(duplicate => {
    const originalIdx = duplicate.originalIndex;

    let prevDifferentDate = null;
    let nextDifferentDate = null;

    for (let i = originalIdx - 1; i >= 0; i--) {
      const checkDate = normalizeDate(allExpenses[i].date);
      if (checkDate !== targetDate) {
        prevDifferentDate = checkDate;
        break;
      }
    }

    for (let i = originalIdx + 1; i < allExpenses.length; i++) {
      const checkDate = normalizeDate(allExpenses[i].date);
      if (checkDate !== targetDate) {
        nextDifferentDate = checkDate;
        break;
      }
    }

    let score = 0;
    let reason = '';

    if (prevDifferentDate && nextDifferentDate) {
      score = 100;
      const distanceFromCenter = Math.abs(originalIdx - allExpenses.length / 2);
      score -= distanceFromCenter * 0.1;
      reason = `両側挟まれ (前:${prevDifferentDate}, 後:${nextDifferentDate}) 中央距離:${distanceFromCenter.toFixed(1)}`;
    }
    else if (prevDifferentDate || nextDifferentDate) {
      score = 50;
      score -= originalIdx * 0.5;
      const side = prevDifferentDate ? `前:${prevDifferentDate}` : `後:${nextDifferentDate}`;
      reason = `片側のみ (${side}) index補正:-${(originalIdx * 0.5).toFixed(1)}`;
    }
    else {
      score = -originalIdx;
      reason = `前後なし（連続同一日付） index:-${originalIdx}`;
    }

    console.log(`  [index:${originalIdx}] スコア:${score.toFixed(2)} | ${reason}`);

    return {
      expense: duplicate,
      originalIndex: originalIdx,
      score
    };
  });

  scored.sort((a, b) => b.score - a.score);

  console.log(`  ✅ 最高スコア: [index:${scored[0].originalIndex}] ${scored[0].score.toFixed(2)}`);

  return scored[0].expense;
}

// テスト実行
const testData = [
  { id: 0, date: '2025-10-01', route: 'A-B', rowId: 'row0', originalIndex: 0 },
  { id: 1, date: '2025-10-02', route: 'A-B', rowId: 'row1', originalIndex: 1 },
  { id: 2, date: '2025-10-08', route: 'A-B', rowId: 'row2', originalIndex: 2 },
  { id: 3, date: '2025-10-03', route: 'A-B', rowId: 'row3', originalIndex: 3 },
  { id: 4, date: '2025-10-04', route: 'A-B', rowId: 'row4', originalIndex: 4 },
  { id: 5, date: '2025-10-06', route: 'A-B', rowId: 'row5', originalIndex: 5 },
  { id: 6, date: '2025-10-08', route: 'A-B', rowId: 'row6', originalIndex: 6 },
  { id: 7, date: '2025-10-09', route: 'A-B', rowId: 'row7', originalIndex: 7 },
  { id: 8, date: '2025-10-13', route: 'A-B', rowId: 'row8', originalIndex: 8 },
  { id: 9, date: '2025-10-14', route: 'A-B', rowId: 'row9', originalIndex: 9 },
  { id: 10, date: '2025-10-08', route: 'A-B', rowId: 'row10', originalIndex: 10 },
  { id: 11, date: '2025-10-16', route: 'A-B', rowId: 'row11', originalIndex: 11 },
  { id: 12, date: '2025-10-21', route: 'A-B', rowId: 'row12', originalIndex: 12 },
  { id: 13, date: '2025-10-23', route: 'A-B', rowId: 'row13', originalIndex: 13 },
  { id: 14, date: '2025-10-08', route: 'A-B', rowId: 'row14', originalIndex: 14 },
  { id: 15, date: '2025-10-01', route: 'A-B', rowId: 'row15', originalIndex: 15 },
];

// 10/01の重複
const duplicates1001 = testData.filter(item => item.date === '2025-10-01');
console.log('\n========== 10/01 の重複 ==========');
selectKeepExpenseDebug(duplicates1001, testData);

// 10/08の重複
const duplicates1008 = testData.filter(item => item.date === '2025-10-08');
console.log('\n========== 10/08 の重複 ==========');
selectKeepExpenseDebug(duplicates1008, testData);
