// ポップアップUI制御スクリプト

let currentResults = null; // 現在の結果を保持
let autoCheckEnabled = false; // 自動チェックのON/OFF

document.addEventListener('DOMContentLoaded', () => {
  const checkButton = document.getElementById('checkButton');
  const loadingDiv = document.getElementById('loading');
  const resultsDiv = document.getElementById('results');
  const sortDateAsc = document.getElementById('sortDateAsc');
  const sortDateDesc = document.getElementById('sortDateDesc');
  const autoCheckToggle = document.getElementById('autoCheckToggle');

  // チェックボタンのクリックイベント
  checkButton.addEventListener('click', async () => {
    await performCheck();
  });

  // ソートボタンのクリックイベント
  sortDateAsc.addEventListener('click', () => {
    if (currentResults) {
      sortResults('asc');
      displayResults(currentResults);
    }
  });

  sortDateDesc.addEventListener('click', () => {
    if (currentResults) {
      sortResults('desc');
      displayResults(currentResults);
    }
  });

  // 自動チェックのON/OFF切り替え
  autoCheckToggle.addEventListener('change', async (e) => {
    autoCheckEnabled = e.target.checked;

    // 設定を保存
    chrome.storage.local.set({ autoCheckEnabled: autoCheckEnabled });

    // アクティブなタブに自動チェックの状態を通知
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab && tab.id) {
      chrome.tabs.sendMessage(tab.id, {
        action: 'setAutoCheck',
        enabled: autoCheckEnabled
      });
    }

    if (autoCheckEnabled) {
      // ONにした時に即座にチェック実行
      await performCheck();
    }
  });

  // 自動チェックの設定を復元
  chrome.storage.local.get(['autoCheckEnabled'], (result) => {
    if (result.autoCheckEnabled !== undefined) {
      autoCheckEnabled = result.autoCheckEnabled;
      autoCheckToggle.checked = autoCheckEnabled;

      // タブに自動チェックの状態を通知
      chrome.tabs.query({ active: true, currentWindow: true }, ([tab]) => {
        if (tab && tab.id) {
          chrome.tabs.sendMessage(tab.id, {
            action: 'setAutoCheck',
            enabled: autoCheckEnabled
          });
        }
      });
    }
  });

  // content.jsからの自動チェックリクエストを受信
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'autoCheckTriggered') {
      if (autoCheckEnabled) {
        performCheck(true).then(() => {
          // チェック完了を応答
          sendResponse({ success: true });
        }).catch((error) => {
          console.error('自動チェックエラー:', error);
          sendResponse({ success: false, error: error.message });
        });
        return true; // 非同期レスポンスを許可
      } else {
        sendResponse({ success: false, reason: 'autoCheckDisabled' });
      }
    }
  });
});

let isChecking = false; // チェック中フラグ

async function performCheck(backgroundMode = false) {
  // 既にチェック中の場合はスキップ
  if (isChecking) {
    return;
  }

  isChecking = true;

  const checkButton = document.getElementById('checkButton');
  const loadingDiv = document.getElementById('loading');
  const resultsDiv = document.getElementById('results');

  // バックグラウンドモードの場合はローディング表示をしない
  if (!backgroundMode) {
    checkButton.disabled = true;
    loadingDiv.style.display = 'block';
    resultsDiv.style.display = 'none';
  }

  try {
    // アクティブなタブを取得
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

    if (!tab || !tab.id) {
      displayError('タブ情報を取得できませんでした。');
      return;
    }

    // URLチェック
    if (!tab.url || !tab.url.includes('jobcan.jp')) {
      displayError('ジョブカンの交通費申請画面で実行してください。');
      return;
    }

    // content.jsにデータ抽出を要求
    let response;
    try {
      response = await chrome.tabs.sendMessage(tab.id, { action: 'extractData' });
    } catch (msgError) {
      console.error('メッセージ送信エラー:', msgError);
      displayError('ページにスクリプトを読み込めませんでした。ページをリロード(F5)してから再度お試しください。');
      return;
    }

    if (!response || !response.success || !response.data) {
      console.warn('データ抽出失敗:', response);
      displayNoData();
      return;
    }

    // background.jsにチェックを要求
    const results = await chrome.runtime.sendMessage({
      action: 'checkExpenses',
      data: response.data
    });

    // 結果を保存
    currentResults = results;

    // デフォルトで昇順ソート
    sortResults('asc');

    // ソートコントロールを表示
    document.getElementById('sortControls').style.display = 'block';

    // 結果を表示
    displayResults(results);

  } catch (error) {
    console.error('チェックエラー:', error);
    if (!backgroundMode) {
      displayError(`エラーが発生しました: ${error.message}`);
    }
  } finally {
    if (!backgroundMode) {
      checkButton.disabled = false;
      loadingDiv.style.display = 'none';
    }
    isChecking = false;
  }
}

// 日付文字列を正規化してDateオブジェクトに変換
function parseDate(dateStr) {
  if (!dateStr) return new Date('9999-12-31');

  // 様々な日付形式に対応: "2025-10-01", "2025年10月1日", "2025/10/01" など
  const cleaned = String(dateStr).replace(/[年月]/g, '-').replace(/日/g, '').trim();
  const date = new Date(cleaned);

  // 無効な日付の場合はデフォルト値
  if (isNaN(date.getTime())) {
    return new Date('9999-12-31');
  }

  return date;
}

// 結果をソートする関数（安定ソート: 同じ日付の場合は元の順序を保持）
function sortResults(order) {
  if (!currentResults || !currentResults.tables) return;

  currentResults.tables.forEach(tableResult => {
    // エラーをソート（元のインデックスを保持）
    if (tableResult.errors && tableResult.errors.length > 0) {
      // 元のインデックスを付与
      const errorsWithIndex = tableResult.errors.map((error, index) => ({
        ...error,
        _originalIndex: index
      }));

      errorsWithIndex.sort((a, b) => {
        const dateA = parseDate(a.date);
        const dateB = parseDate(b.date);

        // 日付でソート
        if (dateA.getTime() !== dateB.getTime()) {
          return order === 'asc' ? dateA - dateB : dateB - dateA;
        }

        // 日付が同じ場合、重複グループは一緒に並べる
        if (a.groupId && b.groupId) {
          if (a.groupId !== b.groupId) {
            return a.groupId.localeCompare(b.groupId);
          }
          // 同じグループ内では、削除対象を先に、保持対象を後に
          if (a.subType === 'delete' && b.subType === 'keep') return -1;
          if (a.subType === 'keep' && b.subType === 'delete') return 1;
        }

        // グループIDがない場合、または同じグループ内では元のインデックスで順序を保持
        return a._originalIndex - b._originalIndex;
      });

      // 元のインデックスを削除
      tableResult.errors = errorsWithIndex.map(({ _originalIndex, ...error }) => error);
    }

    // 警告をソート（元のインデックスを保持）
    if (tableResult.warnings && tableResult.warnings.length > 0) {
      const warningsWithIndex = tableResult.warnings.map((warning, index) => ({
        ...warning,
        _originalIndex: index
      }));

      warningsWithIndex.sort((a, b) => {
        // 日付範囲の場合は最初の日付でソート
        const getFirstDate = (dateStr) => {
          if (!dateStr) return new Date('9999-12-31');
          // "2025-10-02 ～ 2025-10-04" のような範囲形式から最初の日付を抽出
          const match = dateStr.match(/\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/);
          if (match) {
            return parseDate(match[0]);
          }
          return new Date('9999-12-31');
        };

        const dateA = getFirstDate(a.date);
        const dateB = getFirstDate(b.date);

        // 日付が同じ場合は元のインデックスで順序を保持（安定ソート）
        if (dateA.getTime() === dateB.getTime()) {
          return a._originalIndex - b._originalIndex;
        }

        return order === 'asc' ? dateA - dateB : dateB - dateA;
      });

      tableResult.warnings = warningsWithIndex.map(({ _originalIndex, ...warning }) => warning);
    }
  });
}

function displayResults(results) {
  const resultsDiv = document.getElementById('results');
  resultsDiv.style.display = 'block';
  resultsDiv.innerHTML = '';

  // 総合判定
  const summary = document.createElement('div');
  summary.className = 'summary';
  summary.innerHTML = `
    <div class="summary-title">承認可否: ${results.overallSuccess ? '✅ 承認可能' : '❌ 要修正'}</div>
    <div class="summary-content">
      問題: ${results.totalErrors}件 / 警告: ${results.totalWarnings}件
    </div>
  `;
  resultsDiv.appendChild(summary);

  // テーブルごとに結果を表示
  results.tables.forEach((tableResult, index) => {
    // テーブルのタイトル
    const tableSection = document.createElement('div');
    tableSection.style.marginTop = '20px';
    tableSection.style.paddingTop = '12px';
    tableSection.style.borderTop = index > 0 ? '2px solid #eee' : 'none';

    const tableTitle = document.createElement('h3');
    tableTitle.style.fontSize = '15px';
    tableTitle.style.fontWeight = 'bold';
    tableTitle.style.marginBottom = '12px';
    tableTitle.style.color = '#333';

    const statusIcon = tableResult.success ? '✅' : '❌';
    tableTitle.textContent = `${statusIcon} ${tableResult.title}`;
    tableSection.appendChild(tableTitle);

    // エラー（❌ 問題あり）
    if (tableResult.errors.length > 0) {
      const errorSection = document.createElement('div');
      errorSection.className = 'result-section';
      errorSection.innerHTML = '<div class="result-title">❌ 問題あり（必須対応）</div>';

      // エラーをソート順に処理（グループ化せずに順番通りに表示）
      let currentGroup = null;
      let groupContainer = null;

      tableResult.errors.forEach((error, index) => {
        if (error.type === 'duplicate' && error.groupId) {
          // 新しいグループの開始
          if (currentGroup !== error.groupId) {
            // 前のグループを追加
            if (groupContainer) {
              errorSection.appendChild(groupContainer);
            }

            // 新しいグループコンテナを作成
            currentGroup = error.groupId;
            groupContainer = document.createElement('div');
            groupContainer.style.cssText = `
              background: #ffebee;
              border-left: 4px solid #f44336;
              border-radius: 4px;
              margin-bottom: 12px;
              overflow: hidden;
            `;
          }

          // グループ内のアイテムを追加
          const item = createResultItem('error', error);
          item.style.background = 'transparent';
          item.style.border = 'none';
          item.style.borderLeft = 'none';
          item.style.borderRadius = '0';
          item.style.marginBottom = '0';
          item.style.padding = '12px';
          groupContainer.appendChild(item);
        } else {
          // 前のグループを追加
          if (groupContainer) {
            errorSection.appendChild(groupContainer);
            groupContainer = null;
            currentGroup = null;
          }

          // その他のエラーを追加
          const item = createResultItem('error', error);
          errorSection.appendChild(item);
        }
      });

      // 最後のグループを追加
      if (groupContainer) {
        errorSection.appendChild(groupContainer);
      }

      tableSection.appendChild(errorSection);
    }

    // 警告（⚠️ 要確認事項）
    if (tableResult.warnings.length > 0) {
      const warningSection = document.createElement('div');
      warningSection.className = 'result-section';
      warningSection.innerHTML = '<div class="result-title">⚠️ 要確認事項（推奨）</div>';

      tableResult.warnings.forEach(warning => {
        const item = createResultItem('warning', warning);
        warningSection.appendChild(item);
      });

      tableSection.appendChild(warningSection);
    }

    // 成功（✅ 問題なし）- エラーも警告もない場合のみ表示
    if (tableResult.success && tableResult.warnings.length === 0) {
      const successSection = document.createElement('div');
      successSection.className = 'result-section';
      successSection.innerHTML = `
        <div class="result-item success">
          <span class="item-icon">✅</span>
          <div class="item-detail">問題はありません</div>
        </div>
      `;
      tableSection.appendChild(successSection);
    }

    resultsDiv.appendChild(tableSection);
  });
}

function createResultItem(type, data, groupErrors = null) {
  const item = document.createElement('div');
  item.className = `result-item ${type}`;

  const icon = type === 'error' ? '❌' : '⚠️';
  const problemType = {
    'duplicate': '重複申請',
    'holiday': '休日申請',
    'continuity': '連続性抜け',
    'amount_mismatch': '金額不一致',
    'odd_roundtrip': '往復金額エラー',
    'no_data': 'データなし',
    'error': 'エラー'
  }[data.type] || '問題';

  // 削除対象の重複の場合
  if (data.type === 'duplicate' && data.subType === 'delete') {
    // アイコンとボタンを両端に配置
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 4px;
    `;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'item-icon';
    iconSpan.textContent = '🗑️';
    header.appendChild(iconSpan);

    // 修正ボタン（保持対象にスクロール）
    const button = document.createElement('button');
    button.textContent = '修正する';
    button.style.cssText = `
      padding: 6px 12px;
      background: #f44336;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: inline-block;
      width: auto;
    `;
    button.addEventListener('mouseover', () => {
      button.style.background = '#d32f2f';
    });
    button.addEventListener('mouseout', () => {
      button.style.background = '#f44336';
    });
    button.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      // 削除対象自身の行にスクロール
      if (data.rowId) {
        chrome.tabs.sendMessage(tab.id, { action: 'scrollToRow', rowId: data.rowId });
      }
    });
    header.appendChild(button);

    item.appendChild(header);

    // 詳細情報
    const details = document.createElement('div');

    if (data.date) {
      const dateDiv = document.createElement('div');
      dateDiv.className = 'item-date';
      dateDiv.textContent = `日付: ${data.date}`;
      details.appendChild(dateDiv);
    }

    const actionDiv = document.createElement('div');
    actionDiv.className = 'item-action';
    actionDiv.style.cssText = 'color: #d32f2f; font-weight: 500;';
    actionDiv.textContent = '❌ 削除対象';
    details.appendChild(actionDiv);

    const actionDetailDiv = document.createElement('div');
    actionDetailDiv.className = 'item-detail';
    actionDetailDiv.style.fontSize = '12px';
    actionDetailDiv.textContent = data.action || '';
    details.appendChild(actionDetailDiv);

    item.appendChild(details);

    return item;
  }

  // 保持対象の重複の場合
  if (data.type === 'duplicate' && data.subType === 'keep') {
    // 上部に区切り線を追加
    const divider = document.createElement('div');
    divider.style.cssText = `
      border-top: 1px dashed #ccc;
      margin: 8px 0;
    `;
    item.appendChild(divider);

    // アイコンとボタンを両端に配置
    const header = document.createElement('div');
    header.style.cssText = `
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 4px;
    `;

    const iconSpan = document.createElement('span');
    iconSpan.className = 'item-icon';
    iconSpan.textContent = '✅';
    header.appendChild(iconSpan);

    // 表示ボタン（削除対象の最初の1つにスクロール）
    const button = document.createElement('button');
    button.textContent = '表示する';
    button.style.cssText = `
      padding: 6px 12px;
      background: #4CAF50;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: inline-block;
      width: auto;
    `;
    button.addEventListener('mouseover', () => {
      button.style.background = '#45a049';
    });
    button.addEventListener('mouseout', () => {
      button.style.background = '#4CAF50';
    });
    button.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      // 保持対象自身の行にスクロール
      if (data.rowId) {
        chrome.tabs.sendMessage(tab.id, { action: 'scrollToRow', rowId: data.rowId });
      }
    });
    header.appendChild(button);

    item.appendChild(header);

    // 詳細情報
    const details = document.createElement('div');

    if (data.date) {
      const dateDiv = document.createElement('div');
      dateDiv.className = 'item-date';
      dateDiv.textContent = `日付: ${data.date}`;
      details.appendChild(dateDiv);
    }

    const actionDiv = document.createElement('div');
    actionDiv.className = 'item-action';
    actionDiv.style.cssText = 'color: #4CAF50; font-weight: 500;';
    actionDiv.textContent = '✅ 保持対象';
    details.appendChild(actionDiv);

    const countDiv = document.createElement('div');
    countDiv.className = 'item-detail';
    countDiv.style.fontSize = '12px';
    countDiv.textContent = `${data.duplicateCount}件の重複があります`;
    details.appendChild(countDiv);

    item.appendChild(details);

    return item;
  }

  // 通常のエラー表示
  const header = document.createElement('div');
  header.style.cssText = `
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 4px;
  `;

  const iconSpan = document.createElement('span');
  iconSpan.className = 'item-icon';
  iconSpan.textContent = icon;
  header.appendChild(iconSpan);

  // 修正ボタンを追加
  if (data.rowId) {
    const button = document.createElement('button');
    button.textContent = '修正する';
    button.style.cssText = `
      padding: 6px 12px;
      background: #f44336;
      color: white;
      border: none;
      border-radius: 4px;
      font-size: 12px;
      font-weight: 500;
      cursor: pointer;
      display: inline-block;
      width: auto;
    `;
    button.addEventListener('mouseover', () => {
      button.style.background = '#d32f2f';
    });
    button.addEventListener('mouseout', () => {
      button.style.background = '#f44336';
    });
    button.addEventListener('click', async () => {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      chrome.tabs.sendMessage(tab.id, { action: 'scrollToRow', rowId: data.rowId });
    });
    header.appendChild(button);
  }

  item.appendChild(header);

  // 詳細情報
  const details = document.createElement('div');

  if (data.date) {
    const dateDiv = document.createElement('div');
    dateDiv.className = 'item-date';
    dateDiv.textContent = `日付: ${data.date}`;
    details.appendChild(dateDiv);
  }

  const problemDiv = document.createElement('div');
  problemDiv.className = 'item-detail';
  problemDiv.textContent = `問題内容: ${problemType}`;
  details.appendChild(problemDiv);

  if (data.detail) {
    const detailDiv = document.createElement('div');
    detailDiv.className = 'item-detail';
    detailDiv.style.whiteSpace = 'pre-line'; // 改行を有効化
    detailDiv.textContent = `詳細: ${data.detail}`;
    details.appendChild(detailDiv);
  }

  if (data.action) {
    const actionDiv = document.createElement('div');
    actionDiv.className = 'item-action';
    actionDiv.textContent = `対応: ${data.action}`;
    details.appendChild(actionDiv);
  }

  if (data.message) {
    const messageDiv = document.createElement('div');
    messageDiv.className = 'item-detail';
    messageDiv.textContent = data.message;
    details.appendChild(messageDiv);
  }

  item.appendChild(details);

  return item;
}

function displayNoData() {
  const resultsDiv = document.getElementById('results');
  resultsDiv.style.display = 'block';
  resultsDiv.innerHTML = `
    <div class="no-data">
      <p>交通費申請データが見つかりませんでした</p>
      <p style="margin-top: 8px; font-size: 12px;">ジョブカンの交通費申請画面で実行してください</p>
    </div>
  `;
}

function displayError(message) {
  const resultsDiv = document.getElementById('results');
  resultsDiv.style.display = 'block';
  resultsDiv.innerHTML = `
    <div class="result-item error">
      <span class="item-icon">❌</span>
      <div>
        <div class="item-detail">${message}</div>
      </div>
    </div>
  `;
}
