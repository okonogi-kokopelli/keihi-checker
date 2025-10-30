// テスト用スクリプト: 重複検出ロジックの検証

// 日付を正規化（YYYY-MM-DD形式）
function normalizeDate(dateStr) {
  // 様々な日付形式に対応
  const cleaned = dateStr.replace(/[年月]/g, '-').replace(/日/g, '').trim();
  const date = new Date(cleaned);
  if (isNaN(date.getTime())) return null;

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
}

/**
 * 連続性・近接性を考慮した保持対象の選択
 * @param {Array} duplicates - 同一ルート・同一日付の重複申請リスト（originalIndex付き）
 * @param {Array} allExpenses - 元の全体配列
 * @returns {Object} 保持すべき申請
 */
function selectKeepExpense(duplicates, allExpenses) {
  if (duplicates.length === 1) {
    return duplicates[0];
  }

  const targetDate = normalizeDate(duplicates[0].date);

  // 各重複出現位置での「近接度スコア」を計算
  const scored = duplicates.map(duplicate => {
    const originalIdx = duplicate.originalIndex;

    // 元の配列での前後の要素を確認
    let prevDifferentDate = null;
    let nextDifferentDate = null;

    // 前方向に異なる日付を探す
    for (let i = originalIdx - 1; i >= 0; i--) {
      const checkDate = normalizeDate(allExpenses[i].date);
      if (checkDate !== targetDate) {
        prevDifferentDate = checkDate;
        break;
      }
    }

    // 後方向に異なる日付を探す
    for (let i = originalIdx + 1; i < allExpenses.length; i++) {
      const checkDate = normalizeDate(allExpenses[i].date);
      if (checkDate !== targetDate) {
        nextDifferentDate = checkDate;
        break;
      }
    }

    // スコアリング: 前後に異なる日付が存在する = 挟まれている = 高スコア
    let score = 0;

    // 両側に異なる日付がある場合、最も高スコア
    if (prevDifferentDate && nextDifferentDate) {
      score = 100;

      // さらに、全体配列の中央に近いほど高評価
      const distanceFromCenter = Math.abs(originalIdx - allExpenses.length / 2);
      score -= distanceFromCenter * 0.1; // 中央に近いほどスコアが高い
    }
    // 片側だけに異なる日付がある場合
    else if (prevDifferentDate || nextDifferentDate) {
      score = 50;
      // 片側の場合は、配列の最初の方を優先（連続性の始点）
      score -= originalIdx * 0.5; // indexが小さいほど高スコア
    }
    // 両側とも同じ日付（全て同じ日付が連続）
    else {
      // この場合は単純に元の配列の最初の出現を優先
      score = -originalIdx;
    }

    return {
      expense: duplicate,
      originalIndex: originalIdx,
      score
    };
  });

  // スコアが最も高いものを保持
  scored.sort((a, b) => b.score - a.score);

  return scored[0].expense;
}

// ========================================
// テストケース1: ユーザー提供の実データ
// ========================================
console.log('=== テストケース1: ユーザー提供の実データ ===');
const testData1 = [
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

// ルートでグループ化(この例では全て同一ルート)
const routeGroups1 = new Map();
testData1.forEach(item => {
  const key = `${normalizeDate(item.date)}:${item.route}`;
  if (!routeGroups1.has(key)) {
    routeGroups1.set(key, []);
  }
  routeGroups1.get(key).push(item);
});

console.log('\n入力データ（元の配列順序）:');
testData1.forEach(item => {
  console.log(`  [${item.originalIndex}] ID:${item.id} 日付:${item.date} ルート:${item.route}`);
});

console.log('\nルート別グループ:');
routeGroups1.forEach((items, key) => {
  console.log(`  ${key}: ${items.length}件`);
  if (items.length > 1) {
    const keep = selectKeepExpense(items, testData1);
    console.log(`    保持対象: ID:${keep.id} [元index:${keep.originalIndex}] (${keep.date}) rowId:${keep.rowId}`);
    items.forEach(item => {
      const status = item.rowId === keep.rowId ? '✅ keep' : '🗑️ remove';
      console.log(`      ${status} - ID:${item.id} [元index:${item.originalIndex}] 日付:${item.date}`);
    });
  }
});

// 期待される出力:
// 10/01: index 0 と 15 → index 0 を保持（最初の出現、連続日付の始点）
// 10/08: index 2, 6, 10, 14 → index 6 を保持（10/06と10/09に挟まれている）

console.log('\n\n=== テストケース2: 単一の日付に複数重複（全て同じ日付） ===');
const testData2 = [
  { id: 0, date: '2025-10-08', route: 'A-B', rowId: 'row0', originalIndex: 0 },
  { id: 1, date: '2025-10-08', route: 'A-B', rowId: 'row1', originalIndex: 1 },
  { id: 2, date: '2025-10-08', route: 'A-B', rowId: 'row2', originalIndex: 2 },
  { id: 3, date: '2025-10-08', route: 'A-B', rowId: 'row3', originalIndex: 3 },
];

const routeGroups2 = new Map();
testData2.forEach(item => {
  const key = `${normalizeDate(item.date)}:${item.route}`;
  if (!routeGroups2.has(key)) {
    routeGroups2.set(key, []);
  }
  routeGroups2.get(key).push(item);
});

console.log('\n入力データ:');
testData2.forEach(item => {
  console.log(`  [${item.originalIndex}] ID:${item.id} 日付:${item.date}`);
});

console.log('\nルート別グループ:');
routeGroups2.forEach((items, key) => {
  console.log(`  ${key}: ${items.length}件`);
  if (items.length > 1) {
    const keep = selectKeepExpense(items, testData2);
    console.log(`    保持対象: ID:${keep.id} [元index:${keep.originalIndex}] rowId:${keep.rowId}`);
    items.forEach(item => {
      const status = item.rowId === keep.rowId ? '✅ keep' : '🗑️ remove';
      console.log(`      ${status} - ID:${item.id} [元index:${item.originalIndex}]`);
    });
  }
});

// 期待される出力:
// 全て同じ日付なので、前後に異なる日付がない → 最初の出現(index 0)を保持
