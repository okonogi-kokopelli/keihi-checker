// バックグラウンドスクリプト: 祝日データ取得とチェックロジック

// 祝日データのキャッシュ
let holidaysCache = {
  data: [],
  lastFetched: null,
  expiresIn: 24 * 60 * 60 * 1000 // 24時間
};

// JP Holiday APIから祝日データを取得
async function fetchHolidays(year) {
  try {
    // キャッシュチェック（年ごと）
    const now = Date.now();
    const cacheKey = `holidays_${year}`;

    if (holidaysCache[cacheKey] && holidaysCache.lastFetched &&
        (now - holidaysCache.lastFetched < holidaysCache.expiresIn)) {
      return holidaysCache[cacheKey];
    }

    // JP Holiday APIから祝日データを取得
    const response = await fetch(`https://holidays-jp.github.io/api/v1/${year}/date.json`);

    if (!response.ok) {
      console.warn(`祝日API取得失敗 (${year}): ${response.status}`);
      return getJapaneseHolidaysFallback(year);
    }

    const data = await response.json();

    // データ形式検証: オブジェクトであることを確認
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      console.warn('無効な祝日データ形式:', data);
      return getJapaneseHolidaysFallback(year);
    }

    // データ形式: {"2025-01-01": "元日", "2025-01-13": "成人の日", ...}
    const holidays = Object.keys(data).filter(key => {
      // 日付形式の検証 (YYYY-MM-DD)
      return /^\d{4}-\d{2}-\d{2}$/.test(key);
    });

    // キャッシュに保存
    holidaysCache[cacheKey] = holidays;
    holidaysCache.lastFetched = now;

    return holidays;
  } catch (error) {
    console.error('祝日データの取得に失敗:', error);
    return getJapaneseHolidaysFallback(year);
  }
}

// フォールバック用の祝日データ（API取得失敗時）
function getJapaneseHolidaysFallback(year) {
  const holidays = {
    2025: [
      '2025-01-01', // 元日
      '2025-01-13', // 成人の日
      '2025-02-11', // 建国記念の日
      '2025-02-23', // 天皇誕生日
      '2025-02-24', // 振替休日
      '2025-03-20', // 春分の日
      '2025-04-29', // 昭和の日
      '2025-05-03', // 憲法記念日
      '2025-05-04', // みどりの日
      '2025-05-05', // こどもの日
      '2025-05-06', // 振替休日
      '2025-07-21', // 海の日
      '2025-08-11', // 山の日
      '2025-09-15', // 敬老の日
      '2025-09-23', // 秋分の日
      '2025-10-13', // スポーツの日
      '2025-11-03', // 文化の日
      '2025-11-23', // 勤労感謝の日
      '2025-11-24', // 振替休日
    ],
    2026: [
      '2026-01-01', // 元日
      '2026-01-12', // 成人の日
      '2026-02-11', // 建国記念の日
      '2026-02-23', // 天皇誕生日
      '2026-03-20', // 春分の日
      '2026-04-29', // 昭和の日
      '2026-05-03', // 憲法記念日
      '2026-05-04', // みどりの日
      '2026-05-05', // こどもの日
      '2026-05-06', // 振替休日
      '2026-07-20', // 海の日
      '2026-08-11', // 山の日
      '2026-09-21', // 敬老の日
      '2026-09-22', // 秋分の日
      '2026-10-12', // スポーツの日
      '2026-11-03', // 文化の日
      '2026-11-23', // 勤労感謝の日
    ]
  };

  return holidays[year] || [];
}

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

// チェック処理（テーブルごと）
async function checkExpensesByTable(tableData) {
  const result = {
    title: tableData.title,
    errors: [],
    warnings: [],
    success: false
  };

  const expenses = tableData.expenses;

  if (!expenses || expenses.length === 0) {
    return result;
  }

  // 1. 祝日チェック（重複チェックの前に実施）
  const year = new Date().getFullYear();
  const holidays = await fetchHolidays(year);
  const holidayErrorRowIds = new Set(); // 祝日エラーの申請を記録

  expenses.forEach((expense) => {
    const normalizedDate = normalizeDate(expense.date);
    if (!normalizedDate) return;

    const date = new Date(normalizedDate);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6; // 日曜 or 土曜
    const isHoliday = holidays.includes(normalizedDate);

    if (isWeekend || isHoliday) {
      // 備考欄に正当な理由があるかチェック
      const validKeywords = ['休日出勤', '出張', '緊急対応', '出社'];
      const hasValidReason = validKeywords.some(keyword =>
        expense.remarks?.includes(keyword) || expense.purpose?.includes(keyword)
      );

      if (!hasValidReason) {
        const dayType = isHoliday ? '祝日' : (dayOfWeek === 0 ? '日曜日' : '土曜日');
        result.errors.push({
          type: 'holiday',
          date: expense.date,
          rowId: expense.rowId,
          detail: `${dayType}の申請です`,
          action: '備考欄には出勤理由を記入するか、不要な場合は削除してください'
        });
        // 祝日エラーの申請を記録
        holidayErrorRowIds.add(expense.rowId);
      }
    }
  });

  // 2. 日付の重複チェック（祝日エラーの申請を除外）
  const dateMap = new Map();
  const routeMap = new Map();

  expenses.forEach((expense, index) => {
    // 祝日エラーの申請は重複チェック対象外
    if (holidayErrorRowIds.has(expense.rowId)) {
      return;
    }

    const normalizedDate = normalizeDate(expense.date);
    if (!normalizedDate) return;

    const route = `${expense.from}→${expense.to}`;
    const key = `${normalizedDate}:${route}`;

    // 同じ日付の申請をトラッキング
    if (!dateMap.has(normalizedDate)) {
      dateMap.set(normalizedDate, []);
    }
    dateMap.get(normalizedDate).push({ ...expense, index, route });

    // 同じルートの重複チェック（全ての出現を記録）
    if (!routeMap.has(key)) {
      routeMap.set(key, {
        allExpenses: []
      });
    }
    routeMap.get(key).allExpenses.push({ ...expense, originalIndex: index });
  });

  // 重複をエラーとして登録（同じ日付ごとにグループ化）
  const dateGroupMap = new Map(); // 日付ごとにグループ化

  routeMap.forEach((data, key) => {
    // 2つ以上の申請がある場合のみ重複として扱う
    if (data.allExpenses.length > 1) {
      const [date, route] = key.split(':');

      // 同じ日付のグループを取得または作成
      if (!dateGroupMap.has(date)) {
        dateGroupMap.set(date, {
          routeGroups: [] // ルートごとのグループを配列で保持
        });
      }

      const group = dateGroupMap.get(date);

      // 【新ロジック】連続性・近接性を考慮した保持対象の決定
      const keepExpense = selectKeepExpense(data.allExpenses, expenses);
      const duplicates = data.allExpenses.filter(exp => exp.rowId !== keepExpense.rowId);

      // ルートグループを追加
      group.routeGroups.push({
        route: route,
        keepRowId: keepExpense.rowId,
        deleteRowIds: duplicates.map(d => d.rowId),
        duplicates: duplicates,
        firstExpense: keepExpense
      });
    }
  });

  // 日付ごとにグループをエラーとして登録
  let duplicateGroupId = 0;
  dateGroupMap.forEach((group, date) => {
    const groupId = `dup-group-${duplicateGroupId++}`;

    // 各ルートグループを処理
    group.routeGroups.forEach(routeGroup => {
      const route = routeGroup.route;

      // 削除対象を先に追加
      routeGroup.duplicates.forEach(duplicate => {
        result.errors.push({
          type: 'duplicate',
          subType: 'delete',
          date: duplicate.date,
          rowId: duplicate.rowId,
          detail: `同日に「${route}」が重複して申請されています`,
          action: '重複を削除してください',
          groupId: groupId
        });
      });

      // 保持対象を後に追加
      result.errors.push({
        type: 'duplicate',
        subType: 'keep',
        date: routeGroup.firstExpense.date,
        rowId: routeGroup.firstExpense.rowId,
        detail: `同日に「${route}」が重複して申請されています`,
        action: '保持対象',
        duplicateCount: routeGroup.duplicates.length,
        groupId: groupId
      });
    });
  });

  // 3. 平日の入力漏れチェック（週ごとに分けて表示）
  const sortedDates = Array.from(dateMap.keys()).sort();
  if (sortedDates.length > 1) {
    // 全ての抜けた平日を収集
    const allMissingWeekdays = [];
    for (let i = 0; i < sortedDates.length - 1; i++) {
      const currentDate = new Date(sortedDates[i]);
      const nextDate = new Date(sortedDates[i + 1]);
      const diffDays = Math.floor((nextDate - currentDate) / (1000 * 60 * 60 * 24));

      // 間に平日があるかチェック
      if (diffDays > 1) {
        for (let j = 1; j < diffDays; j++) {
          const checkDate = new Date(currentDate);
          checkDate.setDate(checkDate.getDate() + j);
          const dayOfWeek = checkDate.getDay();
          const checkDateStr = normalizeDate(checkDate.toISOString());
          const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
          const isHoliday = holidays.includes(checkDateStr);

          // 平日かつ祝日でない場合
          if (!isWeekend && !isHoliday) {
            allMissingWeekdays.push({
              date: checkDateStr,
              dateObj: new Date(checkDateStr)
            });
          }
        }
      }
    }

    // 週ごとにグループ化（月曜始まり）
    const weekGroups = new Map();
    allMissingWeekdays.forEach(missing => {
      const date = missing.dateObj;
      // 週の開始日（月曜日）を取得
      const dayOfWeek = date.getDay();
      const diff = (dayOfWeek === 0 ? -6 : 1) - dayOfWeek; // 月曜日までの日数差
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() + diff);
      const weekKey = normalizeDate(weekStart.toISOString());

      if (!weekGroups.has(weekKey)) {
        weekGroups.set(weekKey, []);
      }
      weekGroups.get(weekKey).push(missing.date);
    });

    // 週ごとに警告を生成
    weekGroups.forEach((missingDates, weekStart) => {
      // 日付をソート
      missingDates.sort();

      // 週の終了日（金曜日）を計算
      const weekStartDate = new Date(weekStart);
      const weekEndDate = new Date(weekStartDate);
      weekEndDate.setDate(weekStartDate.getDate() + 4); // 月曜 + 4日 = 金曜

      // 日付フォーマット関数（YYYY/MM/DD形式）
      const formatDate = (dateStr) => {
        const d = new Date(dateStr);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${year}/${month}/${day}`;
      };

      // 週の範囲表示（月/日形式）
      const formatDateShort = (dateStr) => {
        const d = new Date(dateStr);
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        return `${month}/${day}`;
      };
      const weekRange = `${formatDateShort(weekStart)}～${formatDateShort(normalizeDate(weekEndDate.toISOString()))}`;

      // 日付表示のフォーマット（3日以上連続時のグルーピング）
      let dateDisplay;
      if (missingDates.length === 1) {
        // 1日のみ - YYYY/MM/DD形式に変換
        dateDisplay = formatDate(missingDates[0]);
      } else {
        // 連続する日付をグループ化
        const groups = [];
        let currentGroup = [missingDates[0]];

        for (let i = 1; i < missingDates.length; i++) {
          const prevDate = new Date(missingDates[i - 1]);
          const currDate = new Date(missingDates[i]);
          const diffDays = Math.floor((currDate - prevDate) / (1000 * 60 * 60 * 24));

          if (diffDays === 1) {
            // 連続している
            currentGroup.push(missingDates[i]);
          } else {
            // 連続していない
            groups.push(currentGroup);
            currentGroup = [missingDates[i]];
          }
        }
        groups.push(currentGroup);

        // グループをフォーマット（YYYY/MM/DD形式）
        const formattedGroups = groups.map(group => {
          if (group.length === 1) {
            return formatDate(group[0]);
          } else if (group.length === 2) {
            return `${formatDate(group[0])}, ${formatDate(group[1])}`;
          } else {
            // 3日以上連続の場合は範囲表示
            return `${formatDate(group[0])}～${formatDate(group[group.length - 1])}`;
          }
        });

        dateDisplay = formattedGroups.join(', ');
      }

      result.warnings.push({
        type: 'continuity',
        date: `${dateDisplay}（週: ${weekRange}）`,
        detail: `平日に交通費申請が抜けています（${missingDates.length}日分）`,
        action: '実際に出勤が無かったか確認してください'
      });
    });
  }

  // 4. 金額の不一致チェック（片道基準統一方式）
  const routeAmountMap = new Map(); // key: "出発→到着", value: [片道金額の配列]

  expenses.forEach((expense) => {
    if (expense.amount && expense.amount > 0) {
      // 往復金額が奇数の場合はエラー（片道計算不可）
      if (expense.roundTrip && expense.amount % 2 !== 0) {
        result.errors.push({
          type: 'odd_roundtrip',
          date: expense.date,
          rowId: expense.rowId,
          detail: `往復金額が奇数です: ${expense.amount}円（片道計算できません）`,
          action: '金額を確認してください'
        });
        return; // この申請は金額不一致チェックから除外
      }

      // すべて片道金額に正規化
      const normalizedAmount = expense.roundTrip ? expense.amount / 2 : expense.amount;
      const routeKey = `${expense.from}→${expense.to}`;

      if (!routeAmountMap.has(routeKey)) {
        routeAmountMap.set(routeKey, []);
      }
      routeAmountMap.get(routeKey).push({
        normalizedAmount: normalizedAmount,
        originalAmount: expense.amount,
        isRoundTrip: expense.roundTrip,
        date: expense.date,
        rowId: expense.rowId
      });
    }
  });

  // 同じルートで金額が異なる場合、最頻値と異なるもののみをエラーとする
  routeAmountMap.forEach((amounts, routeKey) => {
    if (amounts.length > 1) {
      // 片道金額ごとの出現回数をカウント
      const amountCount = new Map();
      amounts.forEach(item => {
        amountCount.set(item.normalizedAmount, (amountCount.get(item.normalizedAmount) || 0) + 1);
      });

      // 最頻値（最も多く使われている片道金額）を正常値とする
      let maxCount = 0;
      let normalAmount = 0;
      amountCount.forEach((count, amount) => {
        if (count > maxCount) {
          maxCount = count;
          normalAmount = amount;
        }
      });

      // 正常値と異なる金額のみをエラーとして抽出
      const abnormalItems = amounts.filter(item => item.normalizedAmount !== normalAmount);

      if (abnormalItems.length > 0) {
        abnormalItems.forEach(item => {
          const tripType = item.isRoundTrip ? '往復' : '片道';
          const expectedAmount = item.isRoundTrip ? normalAmount * 2 : normalAmount;

          // シンプル化された表示
          let detail;
          if (item.isRoundTrip) {
            // 往復の場合: 片道基準も表示
            detail = `「${routeKey}（往復）」の金額が異なります\n申請: ${item.originalAmount}円\n正常: ${expectedAmount}円（片道${normalAmount}円）`;
          } else {
            // 片道の場合: シンプルに
            detail = `「${routeKey}（片道）」の金額が異なります\n申請: ${item.originalAmount}円\n正常: ${expectedAmount}円`;
          }

          result.errors.push({
            type: 'amount_mismatch',
            date: item.date,
            rowId: item.rowId,
            detail: detail,
            action: '金額を確認してください'
          });
        });
      }
    }
  });

  // 総合判定
  result.success = result.errors.length === 0;

  return result;
}

// 全テーブルのチェック処理
async function checkAllExpenses(expensesByTable) {
  if (!expensesByTable || expensesByTable.length === 0) {
    return {
      tables: [],
      overallSuccess: false,
      totalErrors: 0,
      totalWarnings: 0
    };
  }

  const results = [];
  for (const tableData of expensesByTable) {
    const result = await checkExpensesByTable(tableData);
    results.push(result);
  }

  // 全体の集計
  const totalErrors = results.reduce((sum, r) => sum + r.errors.length, 0);
  const totalWarnings = results.reduce((sum, r) => sum + r.warnings.length, 0);

  return {
    tables: results,
    overallSuccess: totalErrors === 0,
    totalErrors: totalErrors,
    totalWarnings: totalWarnings
  };
}

// タブ更新時にジョブカンのページでサイドパネルを有効化
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
    // ジョブカンのURLかチェック
    if (tab.url.includes('jobcan.jp')) {
      try {
        await chrome.sidePanel.setOptions({
          tabId,
          path: 'popup.html',
          enabled: true
        });
      } catch (error) {
        console.error('サイドパネル設定エラー:', error);
      }
    }
  }
});

// 拡張機能アイコンクリック時にサイドパネルを開く
chrome.action.onClicked.addListener(async (tab) => {
  try {
    await chrome.sidePanel.open({ tabId: tab.id });
  } catch (error) {
    console.error('サイドパネルオープンエラー:', error);
  }
});

// メッセージリスナー
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'checkExpenses') {
    checkAllExpenses(request.data).then(results => {
      sendResponse(results);
    }).catch(error => {
      sendResponse({
        tables: [],
        overallSuccess: false,
        totalErrors: 1,
        totalWarnings: 0,
        error: error.message
      });
    });
    return true; // 非同期レスポンス
  }

  if (request.action === 'dataExtracted') {
    // content.jsから自動抽出されたデータを保存
    chrome.storage.local.set({ latestExpenseData: request.data });
  }

  // autoCheckTriggered は content.js から直接 popup.js に送信されるため、
  // background.js での中継は不要（削除）
});
