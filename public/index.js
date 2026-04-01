// Initialize icons
lucide.createIcons();

// Load Portal Cards from Firestore
document.addEventListener('DOMContentLoaded', () => {
    if (typeof firebase === 'undefined') return;

    const db = firebase.firestore();
    const portalGrid = document.getElementById('portal-grid');
    if (!portalGrid) return;

    // Default configuration mapping for color themes to tailwind classes
    // Some cards use -700, others use -800, we map them as best effort
    const themeMap = {
        'cyan': { text: 'text-cyan-400', grad: 'from-cyan-500 to-cyan-700' },
        'emerald': { text: 'text-emerald-400', grad: 'from-emerald-500 to-emerald-800' },
        'yellow': { text: 'text-yellow-400', grad: 'from-yellow-400 to-yellow-600' },
        'fuchsia': { text: 'text-fuchsia-400', grad: 'from-fuchsia-500 to-purple-700' },
        'rose': { text: 'text-rose-500', grad: 'from-rose-500 to-rose-800' },
        'orange': { text: 'text-orange-500', grad: 'from-orange-500 to-orange-700' },
        'blue': { text: 'text-blue-500', grad: 'from-blue-500 to-blue-800' },
        'indigo': { text: 'text-indigo-400', grad: 'from-indigo-500 to-indigo-800' }
    };

    // Try to get data from cache first for fast loading
    db.collection("portalCards").get({ source: 'cache' }).then((querySnapshot) => {
        if (!querySnapshot.empty) {
            renderPortalCards(querySnapshot);
        }
    }).catch((error) => {
        console.log("Failed to load from cache:", error);
    });

    // Then try to get fresh data from server
    db.collection("portalCards").get({ source: 'server' }).then((querySnapshot) => {
        if (!querySnapshot.empty) {
            renderPortalCards(querySnapshot);
        }
    }).catch((error) => {
        console.log("Failed to load from server:", error);
    });

    function renderPortalCards(querySnapshot) {
        querySnapshot.forEach((doc) => {
            const cardData = doc.data();
            const docId = doc.id; // e.g., 'card1', 'card2'
            const existingLink = portalGrid.querySelector(`[data-page="${docId}"]`);

            if (existingLink) {
                // Update link
                if (cardData.url) {
                    existingLink.href = cardData.url;
                }

                // Update title
                if (cardData.title) {
                    const spanElement = existingLink.querySelector('span');
                    if (spanElement) {
                        // The original HTML has <br> tags in some titles for wrapping,
                        // If firestore doesn't have it, we just set the text.
                        // Ideally firestore title doesn't break UI layout.
                        spanElement.innerHTML = cardData.title;
                    }
                }

                // Update icon
                const iconContainer = existingLink.querySelector('.plasma-sphere');
                if (iconContainer && cardData.svgCode) {
                    iconContainer.innerHTML = cardData.svgCode;

                    // Add 'text-white icon-glow' to the svg if not present to match styling
                    const svgElement = iconContainer.querySelector('svg');
                    if (svgElement) {
                        svgElement.classList.add('text-white', 'icon-glow');
                    }
                }

                // Update theme color
                if (cardData.colorTheme && themeMap[cardData.colorTheme]) {
                    const theme = themeMap[cardData.colorTheme];

                    // Replace existing text-* class on main <a> element (excluding generic ones like text-center)
                    const textClasses = Array.from(existingLink.classList).filter(c => c.startsWith('text-') && !['text-center', 'text-left', 'text-right', 'text-justify'].includes(c));
                    existingLink.classList.remove(...textClasses);
                    existingLink.classList.add(theme.text);

                    // Update the gradient on the .plasma-sphere
                    if (iconContainer) {
                        // Remove existing gradients
                        const gradClasses = Array.from(iconContainer.classList).filter(c => c.startsWith('from-') || c.startsWith('to-'));
                        iconContainer.classList.remove(...gradClasses);

                        // Add new gradients
                        theme.grad.split(' ').forEach(cls => iconContainer.classList.add(cls));
                    }
                }
            }
        });

        // Re-initialize any lucide icons that might have been loaded
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }
    }
});

/**
 * Log the current orientation to the console for debugging
 */
const checkOrientation = () => {
  const isLandscape = window.matchMedia("(orientation: landscape)").matches;
  console.log(`[DEBUG] Current Orientation: ${isLandscape ? "Landscape" : "Portrait"} (Viewport: ${window.innerWidth}x${window.innerHeight})`);
};

// Initial check and listen for resize
checkOrientation();
window.addEventListener("resize", checkOrientation);

// Service Worker Registration
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register("sw.js")
      .then((reg) => console.log("Service worker registered.", reg))
      .catch((err) => console.log("Service worker registration failed: ", err));
  });
}

// Long Press for Admin Access
const footerTrigger = document.getElementById('footer-trigger');
if (footerTrigger) {
  let longPressTimer;
  const pressDuration = 2000; // 2 seconds

  const startPress = () => {
    longPressTimer = setTimeout(() => {
      window.location.href = '/admin/';
    }, pressDuration);
  };

  const cancelPress = () => {
    clearTimeout(longPressTimer);
  };

  // Mouse events
  footerTrigger.addEventListener('mousedown', startPress);
  footerTrigger.addEventListener('mouseup', cancelPress);
  footerTrigger.addEventListener('mouseleave', cancelPress);

  // Touch events
  footerTrigger.addEventListener('touchstart', (e) => {
    // Prevent default context menu on mobiles
    // e.preventDefault(); 
    startPress();
  });
  footerTrigger.addEventListener('touchend', cancelPress);
  footerTrigger.addEventListener('touchcancel', cancelPress);
}
