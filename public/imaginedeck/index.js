        /* =========================================
           1. 上フレームの処理（時計・ストップウォッチ・タイマー）
           ========================================= */

        // --- モード切り替え ---
        const topNavBtns = document.querySelectorAll('.top-nav button');
        const topModes = document.querySelectorAll('.top-mode-content');

        topNavBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                topNavBtns.forEach(b => b.classList.remove('active'));
                topModes.forEach(m => m.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(btn.dataset.target).classList.add('active');
            });
        });

        // --- 時計 ---
        function updateClock() {
            const now = new Date();
            const days = ['日', '月', '火', '水', '木', '金', '土'];

            const year = now.getFullYear();
            const month = now.getMonth() + 1;
            const date = now.getDate();
            const day = days[now.getDay()];

            const hours = String(now.getHours()).padStart(2, '0');
            const minutes = String(now.getMinutes()).padStart(2, '0');
            const seconds = String(now.getSeconds()).padStart(2, '0');

            document.getElementById('clock-date').textContent = `${year}年 ${month}月 ${date}日 (${day})`;
            document.getElementById('clock-h').textContent = hours;
            document.getElementById('clock-m').textContent = minutes;
            document.getElementById('clock-s').textContent = seconds;
        }
        setInterval(updateClock, 1000);
        updateClock();

        // --- ストップウォッチ ---
        let swInterval;
        let swStartTime;
        let swElapsedTime = 0;
        let isSwRunning = false;
        const swStartStopBtn = document.getElementById('sw-start-stop');
        const swResetBtn = document.getElementById('sw-reset');
        const swHDisp = document.getElementById('sw-h');
        const swMDisp = document.getElementById('sw-m');
        const swSDisp = document.getElementById('sw-s');
        const swMsDisp = document.getElementById('sw-ms-disp');
        const swNavBtn = document.querySelector('[data-target="mode-stopwatch"]');

        function updateStopwatch() {
            const now = Date.now();
            const ms = swElapsedTime + (now - swStartTime);

            const totalSeconds = Math.floor(ms / 1000);
            const hours = String(Math.floor(totalSeconds / 3600)).padStart(2, '0');
            const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0');
            const seconds = String(totalSeconds % 60).padStart(2, '0');
            const milliseconds = String(Math.floor((ms % 1000) / 10)).padStart(2, '0');

            swHDisp.textContent = hours;
            swMDisp.textContent = minutes;
            swSDisp.textContent = seconds;
            swMsDisp.textContent = `.${milliseconds}`;
        }

        swStartStopBtn.addEventListener('click', () => {
            if (isSwRunning) {
                clearInterval(swInterval);
                swElapsedTime += Date.now() - swStartTime;
                swStartStopBtn.textContent = 'スタート';
                swNavBtn.classList.remove('is-running');
                isSwRunning = false;
            } else {
                swStartTime = Date.now();
                swInterval = setInterval(updateStopwatch, 10);
                swStartStopBtn.textContent = 'ストップ';
                swNavBtn.classList.add('is-running');
                isSwRunning = true;
            }
        });

        swResetBtn.addEventListener('click', () => {
            clearInterval(swInterval);
            swElapsedTime = 0;
            isSwRunning = false;
            swStartStopBtn.textContent = 'スタート';
            swNavBtn.classList.remove('is-running');
            swHDisp.textContent = '00';
            swMDisp.textContent = '00';
            swSDisp.textContent = '00';
            swMsDisp.textContent = '.00';
        });

        // --- タイマー ---
        let timerInterval;
        let timerSettingMs = 5 * 60 * 1000; // デフォルト5分 (5 * 60000ms)
        let timerRemainingMs = timerSettingMs;
        let timerEndTime;
        let isTimerRunning = false;

        const timerDisplay = document.getElementById('timer-display');
        const timerSetup = document.getElementById('timer-setup');
        const timerStartStopBtn = document.getElementById('timer-start-stop');
        const timerResetBtn = document.getElementById('timer-reset');
        const tmHDisp = document.getElementById('tm-h');
        const tmMDisp = document.getElementById('tm-m');
        const tmSDisp = document.getElementById('tm-s');
        const tmNavBtn = document.querySelector('[data-target="mode-timer"]');

        function updateTimerDisplay() {
            // 設定値の表示 (時、分)
            const settingTotalSec = Math.floor(timerSettingMs / 1000);
            const settingH = String(Math.floor(settingTotalSec / 3600)).padStart(2, '0');
            const settingM = String(Math.floor((settingTotalSec % 3600) / 60)).padStart(2, '0');

            document.getElementById('timer-setting-h').textContent = settingH;
            document.getElementById('timer-setting-m').textContent = settingM;

            // 実行中の表示 (時：分：秒)
            const remTotalSec = Math.ceil(timerRemainingMs / 1000);
            const remH = String(Math.floor(remTotalSec / 3600)).padStart(2, '0');
            const remM = String(Math.floor((remTotalSec % 3600) / 60)).padStart(2, '0');
            const remS = String(remTotalSec % 60).padStart(2, '0');

            tmHDisp.textContent = remH;
            tmMDisp.textContent = remM;
            tmSDisp.textContent = remS;
        }

        // 時の増減 (Max 99時間、ループあり)
        document.getElementById('timer-h-up').addEventListener('click', () => {
            if (!isTimerRunning) {
                let h = Math.floor(timerSettingMs / 3600000);
                let m = Math.floor((timerSettingMs % 3600000) / 60000);
                h++;
                if (h > 99) h = 0;
                timerSettingMs = h * 3600000 + m * 60000;
                timerRemainingMs = timerSettingMs;
                updateTimerDisplay();
            }
        });
        document.getElementById('timer-h-down').addEventListener('click', () => {
            if (!isTimerRunning) {
                let h = Math.floor(timerSettingMs / 3600000);
                let m = Math.floor((timerSettingMs % 3600000) / 60000);
                h--;
                if (h < 0) h = 99;
                timerSettingMs = h * 3600000 + m * 60000;
                timerRemainingMs = timerSettingMs;
                updateTimerDisplay();
            }
        });

        // 分の増減 (Max 59分、ループあり)
        document.getElementById('timer-m-up').addEventListener('click', () => {
            if (!isTimerRunning) {
                let h = Math.floor(timerSettingMs / 3600000);
                let m = Math.floor((timerSettingMs % 3600000) / 60000);
                m++;
                if (m > 59) m = 0;
                timerSettingMs = h * 3600000 + m * 60000;
                timerRemainingMs = timerSettingMs;
                updateTimerDisplay();
            }
        });
        document.getElementById('timer-m-down').addEventListener('click', () => {
            if (!isTimerRunning) {
                let h = Math.floor(timerSettingMs / 3600000);
                let m = Math.floor((timerSettingMs % 3600000) / 60000);
                m--;
                if (m < 0) m = 59;
                timerSettingMs = h * 3600000 + m * 60000;
                timerRemainingMs = timerSettingMs;
                updateTimerDisplay();
            }
        });

        // --- Web Audio API を用いたベル音合成 ---
        let audioCtx;
        function initAudio() {
            if (!audioCtx) {
                audioCtx = new (window.AudioContext || window.webkitAudioContext)();
            }
            // ブラウザの自動再生ブロックを解除するため、ユーザーアクション時にresumeする
            if (audioCtx.state === 'suspended') {
                audioCtx.resume();
            }
        }

        function playBellSound() {
            if (!audioCtx) return;
            // ベルらしい音色にするため、複数の周波数（和音）を重ねる
            const freqs = [880, 1320, 1760]; // A5, E6, A6付近の周波数
            freqs.forEach(freq => {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();

                osc.type = 'sine';
                osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

                // アタック（立ち上がり）とリリース（減衰）の設定
                gain.gain.setValueAtTime(0, audioCtx.currentTime);
                gain.gain.linearRampToValueAtTime(0.3, audioCtx.currentTime + 0.05);
                gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 2.5);

                osc.connect(gain);
                gain.connect(audioCtx.destination);

                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 2.5);
            });
        }

        function updateTimer() {
            const now = Date.now();
            timerRemainingMs = timerEndTime - now;
            if (timerRemainingMs <= 0) {
                timerRemainingMs = 0;
                clearInterval(timerInterval);
                isTimerRunning = false;
                timerStartStopBtn.textContent = 'スタート';
                tmNavBtn.classList.remove('is-running');
                timerDisplay.classList.add('timer-end');

                // タイマー完了時に音を鳴らす
                playBellSound();

                // タイマーが0になって自動停止した時点から無操作カウントをリセット
                if (typeof resetInteractionTimer === 'function') resetInteractionTimer();
            }
            updateTimerDisplay();
        }

        timerStartStopBtn.addEventListener('click', () => {
            initAudio(); // 音声コンテキストの初期化（ブラウザ制限の解除）

            if (isTimerRunning) {
                clearInterval(timerInterval);
                isTimerRunning = false;
                timerStartStopBtn.textContent = 'スタート';
                tmNavBtn.classList.remove('is-running');
            } else {
                if (timerRemainingMs <= 0) return;
                timerEndTime = Date.now() + timerRemainingMs;
                timerInterval = setInterval(updateTimer, 50);
                isTimerRunning = true;
                timerStartStopBtn.textContent = 'ストップ';
                tmNavBtn.classList.add('is-running');
                timerDisplay.classList.remove('timer-end');
                timerSetup.style.display = 'none';
                timerDisplay.style.display = 'flex';
            }
        });

        timerResetBtn.addEventListener('click', () => {
            clearInterval(timerInterval);
            isTimerRunning = false;
            timerRemainingMs = timerSettingMs;
            timerStartStopBtn.textContent = 'スタート';
            tmNavBtn.classList.remove('is-running');
            timerDisplay.classList.remove('timer-end');
            updateTimerDisplay();
            timerSetup.style.display = 'flex';
            timerDisplay.style.display = 'none';
        });

        updateTimerDisplay();

        /* =========================================
           2. カレンダーの処理
           ========================================= */
        let today = new Date();
        let currentYear = today.getFullYear();
        let currentMonth = today.getMonth();
        let allNotices = []; // 初期化エラーを回避するため、変数宣言をカレンダー描画前に移動しました

        function renderCalendar(year, month) {
            const firstDay = new Date(year, month, 1).getDay();
            const daysInMonth = new Date(year, month + 1, 0).getDate();

            document.getElementById('calendar-month-year').textContent = `${year}年 ${month + 1}月`;

            const tbody = document.getElementById('calendar-body');
            tbody.innerHTML = '';

            let tr = document.createElement('tr');

            // 空白のセル（前月分）
            for (let i = 0; i < firstDay; i++) {
                tr.appendChild(document.createElement('td'));
            }

            // 日付セル
            for (let i = 1; i <= daysInMonth; i++) {
                const td = document.createElement('td');

                // その日のイベントを抽出
                const cellDateStr = `${year}.${String(month + 1).padStart(2, '0')}.${String(i).padStart(2, '0')}`;
                // allNotices配列(後述)から該当する日付のイベントをフィルタリング
                const eventsForDay = typeof allNotices !== 'undefined' ? allNotices.filter(n => n.date === cellDateStr) : [];
                let eventsHtml = '';
                if (eventsForDay.length > 0) {
                    eventsHtml = eventsForDay.map(e => `<div class="event-item">${e.title}</div>`).join('');
                }

                // 日付とイベントを書き込み
                td.innerHTML = `
                    <div class="date-num">${i}</div>
                    <div class="date-events">${eventsHtml}</div>
                `;

                // 今日の判定
                if (year === today.getFullYear() && month === today.getMonth() && i === today.getDate()) {
                    td.classList.add('today');
                }

                tr.appendChild(td);

                // 土曜日まで来たら次の行へ
                if ((i + firstDay) % 7 === 0) {
                    tbody.appendChild(tr);
                    tr = document.createElement('tr');
                }
            }

            // 最後の行の空白セルを埋める
            if (tr.children.length > 0 && tr.children.length < 7) {
                for (let i = tr.children.length; i < 7; i++) {
                    tr.appendChild(document.createElement('td'));
                }
                tbody.appendChild(tr);
            }
        }

        document.getElementById('prev-month').addEventListener('click', () => {
            currentMonth--;
            if (currentMonth < 0) { currentMonth = 11; currentYear--; }
            renderCalendar(currentYear, currentMonth);
        });

        document.getElementById('next-month').addEventListener('click', () => {
            currentMonth++;
            if (currentMonth > 11) { currentMonth = 0; currentYear++; }
            renderCalendar(currentYear, currentMonth);
        });

        renderCalendar(currentYear, currentMonth);

        // --- 無操作時のカレンダー当月復帰・時計復帰処理 ---
        let interactionTimeout;
        let topFrameTimeout;

        function resetCalendarToToday() {
            const now = new Date();
            const nowYear = now.getFullYear();
            const nowMonth = now.getMonth();

            // 既に当月の場合は再描画しない
            if (currentYear === nowYear && currentMonth === nowMonth) return;

            currentYear = nowYear;
            currentMonth = nowMonth;
            renderCalendar(currentYear, currentMonth);
        }

        function resetTopFrameToClock() {
            // ストップウォッチもタイマーも稼働していない場合のみ時計に戻す
            if (!isSwRunning && !isTimerRunning) {
                topNavBtns.forEach(b => b.classList.remove('active'));
                topModes.forEach(m => m.classList.remove('active'));

                const clockBtn = document.querySelector('[data-target="mode-clock"]');
                if (clockBtn) clockBtn.classList.add('active');

                const modeClock = document.getElementById('mode-clock');
                if (modeClock) modeClock.classList.add('active');
            }
        }

        function resetInteractionTimer() {
            clearTimeout(interactionTimeout);
            // 30秒後に当月に戻すタイマーをセット
            interactionTimeout = setTimeout(() => {
                resetCalendarToToday();
            }, 30000);

            clearTimeout(topFrameTimeout);
            // 3分(180秒)後に時計モードに戻すタイマーをセット
            topFrameTimeout = setTimeout(() => {
                resetTopFrameToClock();
            }, 180000);
        }

        // 画面全体のタッチやクリック操作を監視してタイマーをリセット
        document.addEventListener('click', resetInteractionTimer);
        document.addEventListener('touchstart', resetInteractionTimer, { passive: true });

        // 初回のタイマー起動
        resetInteractionTimer();

        /* =========================================
           3. お知らせフィード（ダミーデータ）の処理
           ========================================= */
        // 20件のダミーイベントタイトルを用意
        const dummyEventTitles = [
            "特別展「愛媛の昆虫と自然」開催のお知らせ", "ミュージアム講座：化石から読み解く古代の四国", "イマジン・デッキ ワークショップ：オリジナル化石レプリカ作り",
            "愛媛大学創立記念 特別企画展示のご案内", "学生企画展：私たちのフィールドワーク報告", "館内ガイドツアーのご案内（毎週土曜日開催）",
            "休館日のお知らせ（次回：来週火曜日）", "ミュージアムカフェ 季節の限定メニュー登場", "新収蔵品のご紹介：〇〇遺跡出土の土器",
            "愛媛大学研究者によるギャラリートーク（今週末）", "昆虫標本作成体験教室の参加者募集", "理学部合同企画「鉱物と宝石のひみつ」",
            "夏休み特別企画：キッズ・サイエンス・ラボ", "常設展示 一部リニューアルのお知らせ", "ミュージアムショップ 新着グッズのご案内",
            "大学祭（学生祭）期間中の開館時間延長について", "企画展「瀬戸内の海洋生物」入場者1万人突破！", "館内メンテナンスに伴う一部展示室の閉鎖について",
            "愛媛大学ミュージアム ボランティアガイド募集", "イマジン・デッキ利用時間変更のお知らせ"
        ];

        // ダミーのRSSフィード(XML形式)を生成する
        const dummyXmlString = `<?xml version="1.0" encoding="UTF-8" ?>
            <rss version="2.0">
            <channel>
                <title>サイネージお知らせフィード</title>
                ${dummyEventTitles.map((title, i) => {
            const d = new Date();
            d.setDate(d.getDate() + (i - 10)); // カレンダー上に散らばるように今日を中心に前後へずらす
            return `
                <item>
                    <title>${title}</title>
                    <pubDate>${d.toUTCString()}</pubDate>
            </item>`;
        }).join('')}
        </channel>
        </rss>`;

        let currentNoticePage = 0;
        const noticesPerPage = 5; // 1ページあたりの表示件数
        let noticeAutoPlayInterval;

        function parseFeed() {
            // XMLをパース
            const parser = new DOMParser();
            const xmlDoc = parser.parseFromString(dummyXmlString, "text/xml");
            const items = xmlDoc.querySelectorAll('item');

            allNotices = []; // 初期化

            items.forEach(item => {
                const title = item.querySelector('title').textContent;
                const pubDateStr = item.querySelector('pubDate').textContent;

                // 日付のフォーマット
                const d = new Date(pubDateStr);
                const formattedDate = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;

                allNotices.push({ title: title, date: formattedDate });
            });

            // 最初のページを表示して自動再生を開始
            renderNoticePage(0);
            startNoticeAutoPlay();

            // イベント情報を読み込んだ後にカレンダーを再描画してイベントを表示
            renderCalendar(currentYear, currentMonth);
        }

        function renderNoticePage(page) {
            const totalPages = Math.ceil(allNotices.length / noticesPerPage);
            if (totalPages === 0) return;

            // ページ範囲をループさせる
            if (page < 0) page = totalPages - 1;
            if (page >= totalPages) page = 0;

            currentNoticePage = page;

            const listElement = document.getElementById('notice-list');
            listElement.innerHTML = '';

            const startIdx = page * noticesPerPage;
            const endIdx = startIdx + noticesPerPage;
            const pageItems = allNotices.slice(startIdx, endIdx);

            pageItems.forEach(item => {
                const li = document.createElement('li');
                li.innerHTML = `
                    <span class="notice-date">${item.date}</span>
                    <span class="notice-text">${item.title}</span>
                `;
                listElement.appendChild(li);
            });

            // ページインジケーターの更新
            document.getElementById('notice-page-indicator').textContent = `${page + 1} / ${totalPages}`;
        }

        function nextNoticePage() {
            renderNoticePage(currentNoticePage + 1);
        }

        function prevNoticePage() {
            renderNoticePage(currentNoticePage - 1);
        }

        function startNoticeAutoPlay() {
            clearInterval(noticeAutoPlayInterval);
            // 8秒ごとに自動切り替え
            noticeAutoPlayInterval = setInterval(nextNoticePage, 8000);
        }

        // 手動切り替えボタンのイベントリスナー
        document.getElementById('prev-notice').addEventListener('click', () => {
            prevNoticePage();
            startNoticeAutoPlay(); // 手動操作時にタイマーをリセット
        });

        document.getElementById('next-notice').addEventListener('click', () => {
            nextNoticePage();
            startNoticeAutoPlay(); // 手動操作時にタイマーをリセット
        });

        parseFeed();
