// ジョブカンの交通費申請画面からデータを抽出
(function() {
  'use strict';

  // サニタイゼーション関数: 危険な文字を除去
  function sanitizeText(text) {
    if (!text) return '';
    // 文字列に変換
    const str = String(text);
    // HTMLタグを除去し、特殊文字をエスケープ
    return str
      .replace(/<[^>]*>/g, '') // HTMLタグを除去
      .replace(/[<>'"&]/g, (char) => {
        // 特殊文字をエスケープ
        const escapeMap = {
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#x27;',
          '&': '&amp;'
        };
        return escapeMap[char] || char;
      })
      .trim();
  }

  // 交通費申請データを抽出する関数
  function extractExpenseData() {
    console.log('=== データ抽出開始 ===');

    // テーブルごとにデータを抽出
    const tables = document.querySelectorAll('table.tablelist.specificsSheet.pcTable');

    if (tables.length === 0) {
      console.warn('交通費申請テーブルが見つかりませんでした');
      return null;
    }

    const expensesByTable = [];

    tables.forEach((table, tableIndex) => {
      // テーブルのタイトルを取得
      const prevElement = table.previousElementSibling;
      let tableTitle = null;
      let isCommuteTable = false;

      if (prevElement && prevElement.innerText) {
        const titleText = prevElement.innerText.trim();
        if (titleText.includes('オフィスへの通勤')) {
          tableTitle = '通勤交通費';
          isCommuteTable = true;
        }
      }

      // 通勤交通費テーブル以外はスキップ
      if (!isCommuteTable) {
        return;
      }

      // このテーブル内のデータ行を取得
      const rows = table.querySelectorAll('tr.item.ng-scope');

      if (rows.length === 0) {
        return; // このテーブルにはデータがない
      }

      const expenses = [];
      let validRowIndex = 0; // 有効な行のインデックス

      rows.forEach((row, index) => {
        const cells = row.querySelectorAll('td');

        if (cells.length === 0) return;

        try {
          // ジョブカンの交通費テーブル構造:
          // セル0: 内訳
          // セル1: 出発地
          // セル2: 到着地
          // セル3: 往復/片道
          // セル4: 金額
          // セル5: 利用日
          // セル6: 目的・備考
          // セル7: グループ（オプション）
          // ...

          const dateCell = sanitizeText(cells[5]?.innerText || cells[5]?.textContent || '');
          const fromCell = sanitizeText(cells[1]?.innerText || cells[1]?.textContent || '');
          const toCell = sanitizeText(cells[2]?.innerText || cells[2]?.textContent || '');

          // 往復/片道の判定: selectタグから選択された値を取得
          const roundTripSelect = cells[3]?.querySelector('select');
          let roundTripCell = '';
          if (roundTripSelect) {
            // selectタグの選択されたoptionのテキストを取得
            const selectedOption = roundTripSelect.options[roundTripSelect.selectedIndex];
            roundTripCell = sanitizeText(selectedOption?.text || '');
          } else {
            // selectタグがない場合（確定後の表示など）はpre/textContentを取得
            const preTag = cells[3]?.querySelector('pre');
            roundTripCell = sanitizeText(preTag?.textContent || cells[3]?.textContent || '');
          }

          const purposeCell = sanitizeText(cells[6]?.innerText || cells[6]?.textContent || '');
          const remarksCell = purposeCell; // 目的と備考は同じセル

          // 金額の抽出（textContentから数値を抽出）
          const amountText = cells[4]?.textContent || '';
          // "1,072 円" のような形式から数値を抽出
          const amountMatch = amountText.match(/[\d,]+\s*円/);
          let amount = 0;
          if (amountMatch) {
            const numStr = amountMatch[0].replace(/[,円\s]/g, '');
            amount = parseInt(numStr, 10);
          }
          // マッチしない場合は全体から数値を探す
          if (!amount || isNaN(amount)) {
            const allNumbers = amountText.match(/\d+/g);
            if (allNumbers && allNumbers.length > 0) {
              // 最も大きい数値を金額とみなす（より確実）
              amount = Math.max(...allNumbers.map(n => parseInt(n, 10)));
            }
          }

          // 往復/片道を正規化
          // セルの内容を確認して明示的に判定
          let isRoundTrip;
          if (roundTripCell.includes('往復')) {
            isRoundTrip = true;
          } else if (roundTripCell.includes('片道')) {
            isRoundTrip = false;
          } else {
            // どちらも含まれない場合は、セルの実際の値をログに出力
            console.warn(`  行${index}: 区分が不明 - セル内容="${roundTripCell}"`);
            isRoundTrip = false; // デフォルトは片道
          }

          // 日付が有効な形式かチェック
          if (dateCell && /\d{4}[-/年]\d{1,2}[-/月]\d{1,2}/.test(dateCell)) {
            // 有効な行にのみIDを付与
            const rowId = `expense-row-${tableIndex}-${validRowIndex}`;
            row.setAttribute('data-expense-row-id', rowId);

            expenses.push({
              rowId: rowId,
              date: dateCell,
              from: fromCell,
              to: toCell,
              roundTrip: isRoundTrip,
              amount: amount,
              purpose: purposeCell,
              remarks: remarksCell
            });

            validRowIndex++; // 有効な行のカウントをインクリメント
          }
        } catch (e) {
          console.error(`  行${index}のパースエラー:`, e);
        }
      });

      // このテーブルにデータがある場合のみ追加
      if (expenses.length > 0) {
        expensesByTable.push({
          title: tableTitle,
          expenses: expenses
        });
        console.log(`  → ${expenses.length}件の申請を抽出`);
      }
    });

    console.log('=== 抽出完了 ===');
    console.log('テーブル数:', expensesByTable.length);

    return expensesByTable.length > 0 ? expensesByTable : null;
  }

  // 該当行にスクロールしてハイライトする関数
  function scrollToRow(rowId) {
    const row = document.querySelector(`[data-expense-row-id="${rowId}"]`);
    if (!row) {
      console.warn('行が見つかりませんでした:', rowId);
      return false;
    }

    // 既存のハイライトを削除
    document.querySelectorAll('.expense-highlight').forEach(el => {
      el.classList.remove('expense-highlight');
    });

    // スクロール
    row.scrollIntoView({ behavior: 'smooth', block: 'center' });

    // ハイライト用のスタイルを追加
    const style = document.createElement('style');
    style.id = 'expense-highlight-style';
    if (!document.getElementById('expense-highlight-style')) {
      style.textContent = `
        .expense-highlight {
          background-color: #fff3cd !important;
          outline: 3px solid #ffc107 !important;
          transition: background-color 0.3s ease, outline 0.3s ease;
        }
      `;
      document.head.appendChild(style);
    }

    // ハイライトを適用
    row.classList.add('expense-highlight');

    // 3秒後にハイライトを解除
    setTimeout(() => {
      row.classList.remove('expense-highlight');
    }, 3000);

    return true;
  }

  // 自動チェックの状態
  let autoCheckEnabled = false;
  let observer = null;
  let debounceTimer = null;
  let lastDataSnapshot = null;
  let isCheckRunning = false; // チェック実行中フラグ

  function startAutoCheck() {
    if (observer) {
      return;
    }

    // 初回のスナップショットを取得
    lastDataSnapshot = getDataSnapshot();

    // 監視対象のテーブルを取得
    const tables = document.querySelectorAll('table.tablelist.specificsSheet.pcTable');

    if (tables.length === 0) {
      console.warn('監視対象のテーブルが見つかりません');
      return;
    }

    // MutationObserverでDOM変更を監視
    observer = new MutationObserver((mutations) => {
      // 既にチェック実行中の場合はスキップ
      if (isCheckRunning) {
        return;
      }

      // デバウンス処理: 連続した変更を1回にまとめる（500ms）
      if (debounceTimer) {
        clearTimeout(debounceTimer);
      }

      debounceTimer = setTimeout(() => {
        const currentSnapshot = getDataSnapshot();

        if (currentSnapshot !== lastDataSnapshot) {
          lastDataSnapshot = currentSnapshot;
          isCheckRunning = true;

          // 変更があった場合のみチェックを実行
          chrome.runtime.sendMessage({ action: 'autoCheckTriggered' }, (response) => {
            // チェック完了後にフラグをリセット
            setTimeout(() => {
              isCheckRunning = false;
            }, 1000); // チェック完了後1秒間は新しいチェックをブロック
          });
        }
      }, 500); // 500msのデバウンス
    });

    // 各テーブルを監視
    tables.forEach((table) => {
      const prevElement = table.previousElementSibling;
      if (prevElement && prevElement.innerText && prevElement.innerText.includes('オフィスへの通勤')) {
        // テーブル全体の変更を監視
        observer.observe(table, {
          childList: true,
          subtree: true,
          characterData: true,
          attributes: true,
          attributeFilter: ['value', 'class']
        });
      }
    });

    // フォールバック: MutationObserverで検知できない変更のために定期チェック（2.5秒ごと）
    autoCheckInterval = setInterval(() => {
      if (isCheckRunning) {
        return;
      }

      const currentSnapshot = getDataSnapshot();
      if (currentSnapshot !== lastDataSnapshot) {
        lastDataSnapshot = currentSnapshot;
        isCheckRunning = true;

        chrome.runtime.sendMessage({ action: 'autoCheckTriggered' }, () => {
          setTimeout(() => {
            isCheckRunning = false;
          }, 1000);
        });
      }
    }, 2000); // 2秒ごと
  }

  function stopAutoCheck() {
    // MutationObserverを停止
    if (observer) {
      observer.disconnect();
      observer = null;
    }

    // デバウンスタイマーをクリア
    if (debounceTimer) {
      clearTimeout(debounceTimer);
      debounceTimer = null;
    }

    // フォールバックのインターバルをクリア
    if (autoCheckInterval) {
      clearInterval(autoCheckInterval);
      autoCheckInterval = null;
    }

    lastDataSnapshot = null;
    isCheckRunning = false;
  }

  // データのスナップショットを取得（最適化版）
  function getDataSnapshot() {
    const tables = document.querySelectorAll('table.tablelist.specificsSheet.pcTable');
    const snapshots = [];

    tables.forEach((table) => {
      const prevElement = table.previousElementSibling;
      if (prevElement && prevElement.innerText && prevElement.innerText.includes('オフィスへの通勤')) {
        // テーブル内の行数をカウント
        const rows = table.querySelectorAll('tr.item.ng-scope');
        snapshots.push(`rows:${rows.length}`);

        // 各行の主要データのみを取得（最初の100文字）
        rows.forEach((row, index) => {
          if (index < 50) { // 最大50行まで
            const cells = row.querySelectorAll('td');
            if (cells.length >= 6) {
              // 日付、出発地、到着地、金額のみを取得
              const key = `${cells[5]?.textContent?.trim() || ''}-${cells[1]?.textContent?.trim() || ''}-${cells[2]?.textContent?.trim() || ''}-${cells[4]?.textContent?.trim() || ''}`;
              snapshots.push(key.substring(0, 100));
            }
          }
        });
      }
    });

    return snapshots.join('|');
  }

  // 変数宣言を追加（フォールバック用）
  let autoCheckInterval = null;

  // メッセージリスナー: popup からのリクエストに応答
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'extractData') {
      const data = extractExpenseData();
      sendResponse({ success: !!data, data: data });
    } else if (request.action === 'scrollToRow') {
      const success = scrollToRow(request.rowId);
      sendResponse({ success: success });
    } else if (request.action === 'setAutoCheck') {
      autoCheckEnabled = request.enabled;
      if (autoCheckEnabled) {
        startAutoCheck();
      } else {
        stopAutoCheck();
      }
      sendResponse({ success: true });
    }
    return true; // 非同期レスポンスを許可
  });

  // ページロード時に自動抽出（オプション）
  if (document.readyState === 'complete') {
    const data = extractExpenseData();
    if (data) {
      chrome.runtime.sendMessage({
        action: 'dataExtracted',
        data: data
      });
    }
  } else {
    window.addEventListener('load', () => {
      const data = extractExpenseData();
      if (data) {
        chrome.runtime.sendMessage({
          action: 'dataExtracted',
          data: data
        });
      }
    });
  }
})();
