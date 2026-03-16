lucide.createIcons();

const museumItems = document.querySelectorAll('.museum-item');
const iframe = document.getElementById('content-frame');
const baseUrl = 'https://script.google.com/macros/s/AKfycbyhraKi6oqu33iU1VNa9cSP4Oi9K7Kb7g3GrEOSjAUiqK7oELrhuCaAK2ElN4tneWUA/exec';

const loadContent = (page) => {
    const url = `${baseUrl}?page=${page}&mime=text/plain`;
    iframe.src = 'about:blank';
    iframe.srcdoc = `<div style="color: #94a3b8; display: flex; justify-content: center; align-items: center; height: 100%; font-family: sans-serif;">読み込み中...</div>`;

    fetch(url)
        .then(response => response.text())
        .then(html => {
            const styledHtml = `
                <style>
                    body { 
                        color: #e2e8f0; 
                        background-color: transparent;
                        font-family: 'Noto Sans JP', sans-serif;
                        padding: 1rem;
                    } 
                    a { color: #60a5fa; }
                    h1, h2, h3, h4, h5, h6 { border-color: rgba(255,255,255,0.2); }
                </style>
                ${html}
            `;
            iframe.srcdoc = styledHtml;
        })
        .catch(error => {
            console.error('Error fetching content:', error);
            iframe.srcdoc = `<div style="color: #f87171; display: flex; justify-content: center; align-items: center; height: 100%;">コンテンツの読み込みに失敗しました。</div>`;
        });
};

museumItems.forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        
        museumItems.forEach(i => i.classList.remove('active'));
        item.classList.add('active');

        const page = item.getAttribute('data-page');
        loadContent(page);
    });
});

if (museumItems.length > 0) {
    museumItems[0].classList.add('active');
    loadContent(museumItems[0].getAttribute('data-page'));
}
