document.addEventListener('DOMContentLoaded', () => {
    const navContainer = document.getElementById('museum-nav');
    const contentFrame = document.getElementById('content-frame');
    const defaultPage = '1';

    const loadContent = (page) => {
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

            document.querySelectorAll('.museum-item').forEach(item => {
                item.classList.remove('active');
            });
            link.classList.add('active');

            loadContent(page);
        }
    });

    // 初期コンテンツの読み込み
    const initialLink = navContainer.querySelector(`[data-page="${defaultPage}"]`);
    if (initialLink) {
        initialLink.classList.add('active');
        loadContent(defaultPage);
    }
    
    if (typeof lucide !== 'undefined') {
        lucide.createIcons();
    }
});
