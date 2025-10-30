#!/usr/bin/env node

/**
 * テストランナー: tests/ 配下の全テストファイルを実行
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const testsDir = __dirname; // tests.js自体がtestsディレクトリ内にある

// tests/ ディレクトリ内の全 .js ファイルを取得（tests.js自身を除外）
const testFiles = fs.readdirSync(testsDir)
  .filter(file => file.endsWith('.js') && file !== 'tests.js')
  .sort(); // アルファベット順にソート

console.log('╔═══════════════════════════════════════════════════════════════════╗');
console.log('║          ジョブカン交通費チェッカー - テストスイート実行          ║');
console.log('╚═══════════════════════════════════════════════════════════════════╝\n');

let totalTests = 0;
let passedTests = 0;
let failedTests = 0;

testFiles.forEach((file, index) => {
  const filePath = path.join(testsDir, file);
  const testNumber = index + 1;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`📝 テスト ${testNumber}/${testFiles.length}: ${file}`);
  console.log(`${'='.repeat(70)}\n`);

  try {
    totalTests++;
    execSync(`node "${filePath}"`, { stdio: 'inherit' });
    passedTests++;
    console.log(`\n✅ テスト完了: ${file}\n`);
  } catch (error) {
    failedTests++;
    console.error(`\n❌ テスト失敗: ${file}`);
    console.error(`エラー: ${error.message}\n`);
  }
});

// 最終結果サマリー
console.log('\n' + '═'.repeat(70));
console.log('📊 テスト結果サマリー');
console.log('═'.repeat(70));
console.log(`総テスト数: ${totalTests}`);
console.log(`✅ 成功: ${passedTests}`);
console.log(`❌ 失敗: ${failedTests}`);
console.log('═'.repeat(70));

if (failedTests > 0) {
  console.log('\n⚠️  一部のテストが失敗しました。');
  process.exit(1);
} else {
  console.log('\n🎉 全てのテストが成功しました！');
  process.exit(0);
}
