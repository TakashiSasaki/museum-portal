// Initialize icons
lucide.createIcons();

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
