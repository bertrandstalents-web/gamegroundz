/**
 * GameGroundz Cookie Consent & Analytics Manager
 * Handles GDPR/CCPA compliance and dynamic injection of Google Analytics (G-9PGN9ZHVP6)
 */

document.addEventListener('DOMContentLoaded', () => {
    const CONSENT_KEY = 'gg_cookie_consent';
    const GA_MEASUREMENT_ID = 'G-9PGN9ZHVP6';

    // 1. Check current consent status
    const currentConsent = localStorage.getItem(CONSENT_KEY);

    if (currentConsent === 'all') {
        loadGoogleAnalytics();
    } else if (!currentConsent) {
        showConsentBanner();
    }

    // 2. Load Google Analytics
    function loadGoogleAnalytics() {
        if (window.gaLoaded) return; // Prevent multiple loads
        window.gaLoaded = true;

        // Inject gtag script
        const script = document.createElement('script');
        script.async = true;
        script.src = `https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`;
        document.head.appendChild(script);

        // Initialize gtag
        window.dataLayer = window.dataLayer || [];
        function gtag(){dataLayer.push(arguments);}
        gtag('js', new Date());
        gtag('config', GA_MEASUREMENT_ID);
        
        console.log("GameGroundz: Analytics tracking enabled.");
    }

    // 3. Show Consent Banner
    function showConsentBanner() {
        const bannerHTML = `
            <div id="cookie-consent-banner" class="fixed bottom-0 left-0 w-full z-[9999] p-4 sm:p-6 transform transition-transform duration-500 translate-y-full">
                <div class="max-w-5xl mx-auto bg-white/95 backdrop-blur-xl border border-slate-200 shadow-2xl rounded-2xl p-6 sm:p-8 flex flex-col md:flex-row items-center justify-between gap-6">
                    
                    <div class="flex-1 flex flex-col gap-2">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center text-primary text-xl">
                                <i class="fa-solid fa-cookie-bite"></i>
                            </div>
                            <h3 class="text-xl font-bold text-dark"><span class="lang-en-only">We Value Your Privacy</span><span class="lang-fr-only notranslate">Nous respectons votre vie privée</span></h3>
                        </div>
                        <p class="text-slate-600 text-sm leading-relaxed">
                            <span class="lang-en-only">We use essential cookies to keep you logged in. We'd also like to use analytics cookies to understand how our site is used and improve your experience.</span>
                            <span class="lang-fr-only notranslate">Nous utilisons des cookies essentiels pour vous garder connecté. Nous aimerions également utiliser des cookies analytiques pour comprendre comment notre site est utilisé et améliorer votre expérience.</span>
                        </p>
                    </div>

                    <div class="flex flex-col sm:flex-row gap-3 w-full md:w-auto shrink-0">
                        <button id="cookie-decline-btn" class="px-6 py-3 rounded-xl font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-custom whitespace-nowrap">
                            <span class="lang-en-only">Essential Only</span>
                            <span class="lang-fr-only notranslate">Essentiels Uniquement</span>
                        </button>
                        <button id="cookie-accept-btn" class="px-8 py-3 rounded-xl font-bold text-white bg-primary hover:bg-primaryHover shadow-glow transition-custom whitespace-nowrap">
                            <span class="lang-en-only">Accept All</span>
                            <span class="lang-fr-only notranslate">Tout Accepter</span>
                        </button>
                    </div>

                </div>
            </div>
        `;

        // Inject banner into body
        document.body.insertAdjacentHTML('beforeend', bannerHTML);

        const bannerEl = document.getElementById('cookie-consent-banner');
        
        // Trigger slide up animation
        setTimeout(() => {
            bannerEl.classList.remove('translate-y-full');
            bannerEl.classList.add('translate-y-0');
        }, 500);

        // Handle Accept
        document.getElementById('cookie-accept-btn').addEventListener('click', () => {
            localStorage.setItem(CONSENT_KEY, 'all');
            hideBanner(bannerEl);
            loadGoogleAnalytics();
        });

        // Handle Decline
        document.getElementById('cookie-decline-btn').addEventListener('click', () => {
            localStorage.setItem(CONSENT_KEY, 'essential');
            hideBanner(bannerEl);
        });
    }

    // 4. Hide Banner
    function hideBanner(bannerEl) {
        bannerEl.classList.remove('translate-y-0');
        bannerEl.classList.add('translate-y-full');
        setTimeout(() => {
            bannerEl.remove();
        }, 500);
    }
});
