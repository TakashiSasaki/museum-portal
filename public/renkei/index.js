/**
 * えひめ連携企業紹介 - ポータルページ制御
 */

document.addEventListener('DOMContentLoaded', () => {
    // Lucide アイコンの初期化
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }

    // カードのパララックス/ティルト効果の準備
    // （将来的な機能拡張に対応できるように準備）
    const card = document.querySelector('.cosmic-card');
    if (card) {
        card.style.willChange = 'transform, opacity';
    }

    // 戻るボタンの確認
    const backBtn = document.querySelector('.back-button');
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            // スムーズな遷移（遷移前にフェードアウトさせるなど）のフックとして利用
            console.log('Navigating back to portal...');
        });
    }
});
