// i18n.js - Handles global translation state and custom toggle for Google Translate

// 1. Get saved language
const savedLang = localStorage.getItem('gg_language') || 'en';
document.documentElement.setAttribute('data-lang', savedLang);

// 2. Inject Google Translate script dynamically
(function() {
    // Add Google Translate Element container hidden properly (not display:none so it still renders internally)
    const gtContainer = document.createElement('div');
    gtContainer.id = 'google_translate_element';
    gtContainer.style.cssText = 'opacity: 0; width: 0; height: 0; position: absolute; overflow: hidden; left: -9999px;';
    document.body.appendChild(gtContainer);

    // Initialization callback
    window.googleTranslateElementInit = function() {
        new window.google.translate.TranslateElement({
            pageLanguage: 'en',
            includedLanguages: 'en,fr',
            autoDisplay: false
        }, 'google_translate_element');
        
        // Update UI to match current state
        updateToggleUI(savedLang);
    };

    // Load external script securely
    const script = document.createElement('script');
    script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    document.body.appendChild(script);

    // Inject CSS to hide the Google Translate top banner & keep body in place
    const style = document.createElement('style');
    style.innerHTML = `
        .goog-te-banner-frame.skiptranslate { display: none !important; }
        body { top: 0px !important; }
        #goog-gt-tt { display: none !important; opacity: 0 !important; }
        .goog-tooltip, .goog-tooltip:hover { display: none !important; opacity: 0 !important; }
        font { background-color: transparent !important; box-shadow: none !important; }
        .VIpgJd-ZVi9od-ORHb-OEVmcd { display: none !important; }
    `;
    document.head.appendChild(style);
})();

// Global function to be called by our custom toggle buttons
window.switchLanguage = function(lang) {
    if (localStorage.getItem('gg_language') === lang) return; // already in this language
    
    // Store preference
    localStorage.setItem('gg_language', lang);
    
    // Update local UI
    updateToggleUI(lang);
    
    // Trigger actual translation
    triggerGoogleTranslate(lang);
};

// Helper: actually trigger the hidden google translate element
function triggerGoogleTranslate(targetLangCode) {
    // Determine the proper cookie value for Google Translate
    // format is '/auto/fr' or '/en/fr' depending on setup. '/en/target' works best.
    const gtCookieVal = targetLangCode === 'fr' ? '/en/fr' : '/en/en';
    
    // Set the cookie for the root path
    document.cookie = `googtrans=${gtCookieVal}; path=/`;
    
    // Also set for domain contexts to ensure complete coverage
    if (window.location.hostname) {
        document.cookie = `googtrans=${gtCookieVal}; domain=${window.location.hostname}; path=/`;
        document.cookie = `googtrans=${gtCookieVal}; domain=.${window.location.hostname}; path=/`;
    }
    
    // The only 100% reliable way to switch back and forth repeatedly without Google
    // Translate's internal DOM state "freezing" or losing event listeners is to reload.
    window.location.reload();
}

// Helper: update the UI of the custom toggle switches
function updateToggleUI(currentLang) {
    // Desktop UI elements (Old style in header)
    const btnEn = document.getElementById('lang-btn-en');
    const btnFr = document.getElementById('lang-btn-fr');

    if (btnEn && btnFr) {
        if (currentLang === 'en') {
            btnEn.className = "px-3 py-1 rounded-full text-sm font-bold bg-white text-dark shadow-sm transition-all duration-200 notranslate";
            btnFr.className = "px-3 py-1 rounded-full text-sm font-bold text-slate-500 hover:text-dark transition-all duration-200 cursor-pointer notranslate";
        } else {
            // French active
            btnFr.className = "px-3 py-1 rounded-full text-sm font-bold bg-white text-dark shadow-sm transition-all duration-200 notranslate";
            btnEn.className = "px-3 py-1 rounded-full text-sm font-bold text-slate-500 hover:text-dark transition-all duration-200 cursor-pointer notranslate";
        }
    }

    // Dropdown UI elements (New style in puck dropdown)
    const dropBtnEn = document.getElementById('dropdown-lang-btn-en');
    const dropBtnFr = document.getElementById('dropdown-lang-btn-fr');

    if (dropBtnEn && dropBtnFr) {
        if (currentLang === 'en') {
            dropBtnEn.className = "px-2 py-0.5 rounded text-xs font-bold bg-white text-dark shadow-sm border border-slate-200 cursor-pointer notranslate";
            dropBtnFr.className = "px-2 py-0.5 rounded text-xs font-bold text-slate-500 hover:text-dark border border-transparent cursor-pointer notranslate";
        } else {
            // French active
            dropBtnFr.className = "px-2 py-0.5 rounded text-xs font-bold bg-white text-dark shadow-sm border border-slate-200 cursor-pointer notranslate";
            dropBtnEn.className = "px-2 py-0.5 rounded text-xs font-bold text-slate-500 hover:text-dark border border-transparent cursor-pointer notranslate";
        }
    }

    // Mobile UI elements
    const mobileBtnEn = document.getElementById('mobile-lang-btn-en');
    const mobileBtnFr = document.getElementById('mobile-lang-btn-fr');

    if (mobileBtnEn && mobileBtnFr) {
        if (currentLang === 'en') {
             mobileBtnEn.className = "px-3 py-1 rounded-full text-sm font-bold bg-slate-200 text-dark shadow-sm transition-all duration-200 notranslate";
             mobileBtnFr.className = "px-3 py-1 rounded-full text-sm font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 transition-all duration-200 cursor-pointer notranslate";
        } else {
             // French active
             mobileBtnFr.className = "px-3 py-1 rounded-full text-sm font-bold bg-slate-200 text-dark shadow-sm transition-all duration-200 notranslate";
             mobileBtnEn.className = "px-3 py-1 rounded-full text-sm font-bold text-slate-500 bg-slate-50 hover:bg-slate-100 transition-all duration-200 cursor-pointer notranslate";
        }
    }
}
