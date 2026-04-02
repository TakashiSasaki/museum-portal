/**
 * えひめ連携企業紹介 - データおよび制御ロジック
 */

// 企業データの定義
const categories = [
    {
        id: 1,
        name: "機械マニュファクチャリング",
        description: "造船・機械・金属など、愛媛の基幹となるものづくり産業",
        companies: [
            "(株)アテックス", "井関農機(株)", "潮冷熱(株)", "越智昇鉄工(株)",
            "川之江造機(株)", "四国溶材(株)", "新和工業(株)", "住友重機械工業(株)",
            "西部鉄工(株)", "(株)土居鉄工所", "(株)ヒカリ", "BEMAC(株)",
            "松山容器(株)", "眞鍋造機(株)", "三浦工業(株)"
        ]
    },
    {
        id: 2,
        name: "先端素材・化学",
        description: "化学・非鉄金属・製紙・繊維など、グローバルに展開する素材産業",
        companies: [
            "住友化学(株) 愛媛工場", "住友金属鉱山(株) 技術本部新居浜研究所",
            "(株)タケチ", "帝人(株) 松山事業所", "帝人フロンティア(株)",
            "(株)トーヨ", "日泉化学(株)"
        ]
    },
    {
        id: 3,
        name: "社会基盤エンジニアリング",
        description: "建設・コンサルタント・プラント施工など、空間やインフラを築く産業",
        companies: [
            "(株)一宮工務店", "共立工営(株)", "(株)キクノ", "(株)コスにじゅういち",
            "(株)シアテック", "四国通建(株)", "(株)親和技術コンサルタント",
            "ダイオーエンジニアリング(株)", "(株)トップシステム", "南海測量設計(株)",
            "日滝工業(株)", "(株)富士建設コンサルタント", "(株)フジコソ",
            "(株)芙蓉コンサルタント", "(株)米北測量設計事務所"
        ]
    },
    {
        id: 4,
        name: "デジタル・IT",
        description: "ITシステム・ソフトウェア・通信機器など、DXと情報を支える産業",
        companies: [
            "(株)アイサイト", "NECプラットフォームズ(株)", "(株)NPシステム開発",
            "(株)愛媛電算", "(株)シーライブ", "セキ(株)", "(株)ダイテック",
            "(株)パルソフトウェアサービス"
        ]
    },
    {
        id: 5,
        name: "インフラ・環境",
        description: "エネルギー・交通・環境マネジメントなど、社会を維持する産業",
        companies: [
            "(株)イージーエス", "(株)伊予鉄グループ", "オオノ開發(株)",
            "四国ガス(株)", "四国電力(株) 愛媛支店"
        ]
    },
    {
        id: 6,
        name: "金融・経済エコシステム",
        description: "金融機関・経済団体・シンクタンクなど、ビジネス土壌を育む組織",
        companies: [
            "(株)伊予銀行", "(株)いよぎん地域経済研究センター", "(株)愛媛銀行",
            "愛媛県経営者協会", "愛媛経済同友会", "愛媛県商工会議所連合会",
            "愛媛県商工会連合会", "愛媛県中小企業団体中央会", "愛媛信用金庫",
            "(一財)四国産業・技術振興センター"
        ]
    },
    {
        id: 7,
        name: "生活・消費財サービス",
        description: "食品・卸売・メディア・サービスなど、生活に密着する産業",
        companies: [
            "朝日共販(株)", "ANAクラウンプラザホテル松山", "(株)門田商店",
            "菅機械産業(株)", "四国乳業(株)", "(株)テレビ愛媛", "マルトモ(株)"
        ]
    }
];

/**
 * ダミーロゴ SVG の生成
 */
function createDummyLogo(name) {
    const hash = name.split('').reduce((acc, char) => char.charCodeAt(0) + acc, 0);
    const hue = hash % 360;
    const cleanName = name.replace(/(株式会社|\(株\)|一般財団法人|\(一財\)|グループ)/g, '').trim();
    const initial = cleanName.substring(0, 1) || name.substring(0, 1);

    return `
        <svg class="w-full h-full opacity-80" viewBox="0 0 100 60" xmlns="http://www.w3.org/2000/svg">
            <rect width="100%" height="100%" fill="hsl(${hue}, 40%, 20%)" rx="8" />
            <path d="M0,0 L40,40 M60,0 L100,40" stroke="hsl(${hue}, 40%, 30%)" stroke-width="2" opacity="0.3" />
            <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-size="24" font-weight="bold" fill="hsl(${hue}, 70%, 70%)" font-family="sans-serif">${initial}</text>
            <text x="50%" y="75%" dominant-baseline="middle" text-anchor="middle" font-size="6" font-weight="bold" fill="hsl(${hue}, 50%, 50%)" font-family="sans-serif" opacity="0.6">PARTNER</text>
        </svg>
    `;
}

/**
 * UI の描画
 */
function renderApp() {
    const tabNav = document.getElementById('tab-navigation');
    const contentArea = document.getElementById('tab-content');
    let activeTabId = categories[0].id;

    const updateContent = (categoryId) => {
        const category = categories.find(c => c.id === categoryId);
        if (!category) return;

        // タブの状態更新
        document.querySelectorAll('.tab-btn').forEach(btn => {
            if (parseInt(btn.dataset.id) === categoryId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        });

        // コンテンツ描画
        contentArea.innerHTML = `
            <div class="flex flex-col h-full">
                <div class="mb-2 sm:mb-4 px-2">
                    <h2 class="text-base sm:text-xl font-bold text-cyan-300 border-l-4 border-[#b1a348] pl-3 drop-shadow-glow">
                        ${category.name}
                    </h2>
                    <p class="text-[10px] sm:text-sm text-slate-400 mt-1 ml-4 opacity-80">
                        ${category.description}
                    </p>
                </div>

                <div class="flex-1 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 overflow-hidden" id="company-grid">
                    ${category.companies.map(company => `
                        <div class="cosmic-card p-2 flex flex-col items-center justify-center text-center group">
                            <div class="w-full aspect-[16/10] mb-2 flex items-center justify-center p-1">
                                ${createDummyLogo(company)}
                            </div>
                            <span class="text-[9px] sm:text-[11px] font-medium text-slate-200 leading-tight tracking-wide group-hover:text-cyan-300 transition-colors">
                                ${company}
                            </span>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    };

    // 初期タブの生成
    tabNav.innerHTML = categories.map(category => `
        <button class="tab-btn px-3 py-1.5 rounded-full text-[10px] sm:text-xs font-medium transition-all duration-300 whitespace-nowrap" data-id="${category.id}">
            ${category.name}
        </button>
    `).join('');

    // イベントリスナー
    tabNav.addEventListener('click', (e) => {
        const btn = e.target.closest('.tab-btn');
        if (btn) {
            const id = parseInt(btn.dataset.id);
            updateContent(id);
        }
    });

    // 初期表示
    updateContent(activeTabId);
}

document.addEventListener('DOMContentLoaded', () => {
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
    renderApp();
});
