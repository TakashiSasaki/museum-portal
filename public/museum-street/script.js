document.addEventListener('DOMContentLoaded', () => {
    const navContainer = document.getElementById('museum-nav');
    const contentFrame = document.getElementById('content-frame');
    const mapFrame = document.getElementById('map-frame');
    const tabEvents = document.getElementById('tab-events');
    const tabMap = document.getElementById('tab-map');
    
    // Mobile navigation elements
    const navBackdrop = document.getElementById('nav-backdrop');
    const menuToggle = document.getElementById('menu-toggle');
    
    const defaultPage = '1';
    let currentPage = defaultPage;
    let currentTab = 'events';

    // Menu toggle logic
    const closeMenu = () => {
        if (!navContainer || !navBackdrop) return;
        if (!navContainer.classList.contains('-translate-x-full')) {
            navContainer.classList.add('-translate-x-full');
            navBackdrop.classList.add('opacity-0');
            setTimeout(() => {
                navBackdrop.classList.add('hidden');
            }, 300);
        }
    };

    const toggleMenu = () => {
        if (!navContainer || !navBackdrop) return;
        if (navContainer.classList.contains('-translate-x-full')) {
            navContainer.classList.remove('-translate-x-full');
            navBackdrop.classList.remove('hidden');
            setTimeout(() => {
                navBackdrop.classList.remove('opacity-0');
            }, 10);
        } else {
            closeMenu();
        }
    };

    if (menuToggle) {
        menuToggle.addEventListener('click', toggleMenu);
    }
    if (navBackdrop) {
        navBackdrop.addEventListener('click', closeMenu);
    }

    const updateTabs = () => {
        if (!tabEvents || !tabMap) return;
        
        if (currentTab === 'events') {
            tabEvents.classList.add('bg-slate-800/80', 'text-white', 'shadow-[0_0_10px_rgba(255,255,255,0.1)]', 'active-tab');
            tabEvents.classList.remove('bg-slate-900/40', 'text-slate-400', 'opacity-60', 'hover:opacity-100', 'inactive-tab');
            
            tabMap.classList.add('bg-slate-900/40', 'text-slate-400', 'opacity-60', 'hover:opacity-100', 'inactive-tab');
            tabMap.classList.remove('bg-slate-800/80', 'text-white', 'shadow-[0_0_10px_rgba(255,255,255,0.1)]', 'active-tab');

            contentFrame.classList.remove('hidden');
            mapFrame.classList.add('hidden');
        } else {
            tabMap.classList.add('bg-slate-800/80', 'text-white', 'shadow-[0_0_10px_rgba(255,255,255,0.1)]', 'active-tab');
            tabMap.classList.remove('bg-slate-900/40', 'text-slate-400', 'opacity-60', 'hover:opacity-100', 'inactive-tab');

            tabEvents.classList.add('bg-slate-900/40', 'text-slate-400', 'opacity-60', 'hover:opacity-100', 'inactive-tab');
            tabEvents.classList.remove('bg-slate-800/80', 'text-white', 'shadow-[0_0_10px_rgba(255,255,255,0.1)]', 'active-tab');

            contentFrame.classList.add('hidden');
            mapFrame.classList.remove('hidden');
            
            // マップがまだ読み込まれていなければ読み込む
            loadMapContent(currentPage);
        }
    };

    if (tabEvents) {
        tabEvents.addEventListener('click', () => {
            if (currentTab !== 'events') {
                currentTab = 'events';
                updateTabs();
            }
        });
    }

    if (tabMap) {
        tabMap.addEventListener('click', () => {
            if (currentTab !== 'map') {
                currentTab = 'map';
                updateTabs();
            }
        });
    }

    const loadMapContent = (page) => {
        if (!mapFrame || mapFrame.dataset.loadedPage === String(page)) {
            return; 
        }
        
        const url = `mymap/${String(page).padStart(2, '0')}-mymap.html`;
        fetch(url)
            .then(res => {
                if (!res.ok) throw new Error("Map HTML fetch failed");
                return res.text();
            })
            .then(html => {
                const parser = new DOMParser();
                const doc = parser.parseFromString(html, 'text/html');
                const embeddedIframe = doc.querySelector('iframe');
                if (embeddedIframe && embeddedIframe.src) {
                    mapFrame.src = embeddedIframe.src;
                    mapFrame.dataset.loadedPage = String(page);
                }
            })
            .catch(err => {
                console.warn("Could not load map content", err);
            });
    };

    const loadEventsContent = (page) => {
        const url = `events/${String(page).padStart(2, '0')}-events.html`;

        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                return response.text();
            })
            .then(html => {
                const styledHtml = `
                    <style>
                        body {
                            color: #e2e8f0; 
                            background-color: transparent;
                            font-family: 'Noto Sans JP', sans-serif;
                            padding: 0; 
                            line-height: 1.8;
                        }
                        a { color: #60a5fa; text-decoration: underline; }
                        h1,h2,h3,h4,h5,h6 { border-color: rgba(255,255,255,0.2); margin-top: 1.5em; margin-bottom: 0.75em; font-weight: 600; }
                        h1 { font-size: 1.875rem; } 
                        h2 { font-size: 1.5rem; } 
                        h3 { font-size: 1.25rem; } 
                        ul, ol { list-style-position: inside; } 
                        hr { border-color: rgba(255,255,255,0.15); margin-top: 2rem; margin-bottom: 2rem; }
                    </style>
                    ${html}
                `;
                contentFrame.srcdoc = styledHtml;
            })
            .catch(error => {
                console.warn('Fetch failed, likely offline. Falling back to src attribute for Service Worker.', error);
                // オフライン時、Service Workerがキャッシュを返すように、srcに直接URLを設定する
                contentFrame.src = url;
            });
    };

    // Iframeのロード完了時に、動的にパディングを強制的にゼロにする
    contentFrame.addEventListener('load', () => {
        try {
            if (contentFrame.contentDocument && contentFrame.contentDocument.body) {
                contentFrame.contentDocument.body.style.padding = '0';
                console.log('[DEBUG] Iframe body padding set to 0');
            }
        } catch (e) {
            console.warn('[DEBUG] Could not set padding for iframe content (possibly cross-origin or navigation issue)', e);
        }
    });

    navContainer.addEventListener('click', (e) => {
        const link = e.target.closest('.museum-item');
        if (link) {
            e.preventDefault();
            const page = link.dataset.page;
            
            if (currentPage !== page) {
                currentPage = page;
                
                document.querySelectorAll('.museum-item').forEach(item => {
                    item.classList.remove('active');
                });
                link.classList.add('active');

                // 現在のタブに応じてコンテンツを更新する
                loadEventsContent(currentPage);
                
                if (currentTab === 'map') {
                    loadMapContent(currentPage);
                } else if (mapFrame) {
                    // 他のタブを見ている間にキャッシュだけ消去しておく
                    mapFrame.dataset.loadedPage = "";
                }
            }
            // モバイルの場合は選択後にメニューを閉じる
            if (window.innerWidth < 768) {
                closeMenu();
            }
        }
    });

    // 初期コンテンツの読み込み
    const initialLink = navContainer.querySelector(`[data-page="${defaultPage}"]`);
    if (initialLink) {
        initialLink.classList.add('active');
        loadEventsContent(defaultPage);
        if (currentTab === 'map') {
            loadMapContent(defaultPage);
        }
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});
