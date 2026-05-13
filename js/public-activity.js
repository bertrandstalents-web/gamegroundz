
document.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    const bookingId = urlParams.get('id');

    if (!bookingId) {
        window.location.href = 'index.html';
        return;
    }

    const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
    let activityData = null;
    let pricingTiers = [];
    let tierSelections = {}; // e.g. { "Adult (18+)": 1, "Child": 0 }

    async function showAlertModal(title, message, btnText = 'OK', isError = false) {
        return new Promise((resolve) => {
            const modal = document.getElementById('alert-modal');
            const titleEl = document.getElementById('alert-modal-title');
            const messageEl = document.getElementById('alert-modal-message');
            const iconContainer = document.getElementById('alert-icon-container');
            const icon = document.getElementById('alert-icon');
            const btn = document.getElementById('alert-modal-ok-btn');

            titleEl.textContent = title;
            messageEl.textContent = message;
            btn.textContent = btnText;

            iconContainer.className = `w-12 h-12 rounded-full mb-3 flex items-center justify-center shrink-0 ${isError ? 'bg-red-100' : 'bg-emerald-100'}`;
            icon.className = `fa-solid ${isError ? 'fa-triangle-exclamation text-red-600' : 'fa-check text-emerald-600'} text-xl`;

            modal.classList.remove('hidden');

            const closeAlert = () => {
                modal.classList.add('hidden');
                btn.removeEventListener('click', closeAlert);
                resolve();
            };

            btn.addEventListener('click', closeAlert);
        });
    }

    async function loadActivity() {
        try {
            const res = await fetch(`${API_BASE_URL}/api/public_sessions/single/${bookingId}`);
            if (!res.ok) throw new Error('Failed to load activity');
            
            activityData = await res.json();
            
            if (activityData.error) throw new Error(activityData.error);
            
            renderActivityDetails();
            renderPricingTiers();
            updateTotal();
        } catch (error) {
            console.error("Error loading activity:", error);
            await showAlertModal("Error", "Could not load this public activity. It may have been cancelled or deleted.", "OK", true);
            window.location.href = 'index.html';
        }
    }

    function renderActivityDetails() {
        const dObj = new Date(activityData.booking_date + 'T00:00:00');
        const dayLabel = dObj.toLocaleString(window.currentLang === 'fr' ? 'fr-CA' : 'en-US', { weekday: 'long', month: 'short', day: 'numeric', year: 'numeric' });
        
        let slots = activityData.time_slots;
        if (typeof slots === 'string') {
            try { slots = JSON.parse(slots); } catch(e) { slots = slots.split(','); }
        }
        let ampm = 'AM';
        let [h, m] = slots[0].split(':');
        h = parseInt(h);
        if (h >= 12) { ampm = 'PM'; if (h > 12) h -= 12; }
        if (h === 0) h = 12;
        const timeLabel = `${h}:${m} ${ampm}`;

        document.getElementById('activity-title').textContent = activityData.manual_notes || 'Public Activity';
        document.getElementById('activity-subtitle').innerHTML = `
            <i class="fa-solid fa-calendar-day mr-2 text-primary"></i> ${dayLabel}
            <span class="mx-3 text-slate-300">•</span>
            <i class="fa-regular fa-clock mr-2 text-primary"></i> ${timeLabel}
            <span class="mx-3 text-slate-300">•</span>
            <i class="fa-solid fa-location-dot mr-2 text-primary"></i> ${activityData.facility_name}
        `;

        // Image
        const skeleton = document.getElementById('hero-skeleton');
        const img = document.getElementById('hero-img');
        if (activityData.image_url) {
            img.src = activityData.image_url;
            img.onload = () => {
                skeleton.classList.add('hidden');
                img.classList.remove('hidden');
            };
        } else {
            skeleton.innerHTML = '<i class="fa-solid fa-image text-slate-300 text-5xl"></i>';
        }

        // Operator Details
        const operatorEl = document.getElementById('operator-name');
        if (operatorEl) {
            operatorEl.textContent = activityData.company_name || activityData.host_name || 'GameGroundz Host';
        }
        const hostPicEl = document.getElementById('host-profile-picture');
        if (hostPicEl) {
            if (activityData.host_profile_picture) {
                hostPicEl.src = activityData.host_profile_picture;
            } else {
                hostPicEl.src = 'https://ui-avatars.com/api/?name=' + encodeURIComponent(activityData.company_name || activityData.host_name || 'Host') + '&background=f1f5f9&color=64748b';
            }
        }

        // Description / Rules
        let rulesHtml = '';
        if (activityData.rules && activityData.rules.trim() !== '') {
            const rules = activityData.rules.split('\n');
            rules.forEach(r => {
                if(r.trim() !== '') {
                    rulesHtml += `<li class="flex items-start"><i class="fa-solid fa-check text-primary mt-1 mr-3"></i><span class="text-slate-600">${r}</span></li>`;
                }
            });
            document.getElementById('host-rules-list').innerHTML = rulesHtml;
            document.getElementById('host-rules-section').style.display = 'block';
        }

        document.getElementById('activity-description').innerHTML = activityData.description ? activityData.description.replace(/\n/g, '<br>') : 'Join us for this public activity!';

        // Badges
        const maxCapacity = activityData.capacity || 1;
        const joinedCount = activityData.joined_count || 0;
        const spotsLeft = Math.max(0, maxCapacity - joinedCount);
        
        document.getElementById('spots-remaining-badge').textContent = `${spotsLeft} Spot${spotsLeft !== 1 ? 's' : ''} Left`;
        
        if (activityData.residents_only) {
            document.getElementById('residency-warning').classList.remove('hidden');
        }

        // Facility Details
        const facilityDescEl = document.getElementById('facility-description');
        const facilityDescToggle = document.getElementById('facility-description-toggle');
        if (activityData.facility_description && activityData.facility_description.trim() !== '') {
            facilityDescEl.innerHTML = activityData.facility_description.replace(/\n/g, '<br>');
            // Slight delay to check overflow after rendering
            setTimeout(() => {
                if (facilityDescEl.scrollHeight > facilityDescEl.clientHeight) {
                    facilityDescToggle.classList.remove('hidden');
                }
            }, 100);
        } else {
            document.getElementById('facility-about-section').style.display = 'none';
        }

        const amenityMeta = {
            "wifi": { icon: "fa-wifi", text: "Wifi" },
            "parking": { icon: "fa-square-parking", text: "Free parking" },
            "tv": { icon: "fa-tv", text: "TV" },
            "first_aid": { icon: "fa-truck-medical", text: "First Aid Kit" },
            "accessibility": { icon: "fa-wheelchair", text: "Wheelchair accessible" },
            "concessions": { icon: "fa-utensils", text: "Concessions" },
            "locker_rooms": { icon: "fa-door-open", text: "Locker Rooms" },
            "showers": { icon: "fa-shower", text: "Showers" },
            "pro_shop": { icon: "fa-shop", text: "Pro Shop" },
            "beer": { icon: "fa-beer-mug-empty", text: "Beer" },
            "livebarn": { icon: "fa-video", text: "<span class='notranslate'>LiveBarn</span>" },
            "scoreboard": { icon: "fa-hashtag", text: "Scoreboard" },
            "sound_system": { icon: "fa-volume-high", text: "Sound System" }
        };

        const amenitiesContainer = document.getElementById('facility-amenities-container');
        let parsedAmenities = [];
        try {
            if (activityData.facility_amenities) {
                parsedAmenities = JSON.parse(activityData.facility_amenities);
            }
        } catch(e) {}

        if (parsedAmenities && parsedAmenities.length > 0) {
            let amenitiesHtml = '';
            parsedAmenities.forEach(am => {
                const meta = amenityMeta[am] || { icon: "fa-check", text: am.replace(/_/g, ' ') };
                amenitiesHtml += `<div class="flex items-center"><i class="fa-solid ${meta.icon} w-8 text-xl text-slate-400"></i> ${meta.text}</div>`;
            });
            amenitiesContainer.innerHTML = amenitiesHtml;
        } else {
            document.getElementById('facility-amenities-section').style.display = 'none';
        }

        // Reviews
        document.getElementById('facility-rating-score').textContent = activityData.facility_rating || '5.0';
        const reviewsCount = activityData.facility_reviews_count || 0;
        
        document.getElementById('facility-reviews-link').href = `facility.html?id=${activityData.facility_id}#reviews`;
        
        if (reviewsCount > 0) {
            document.getElementById('facility-reviews-link').innerHTML = `
                <span class="lang-en-only">${reviewsCount} reviews</span>
                <span class="lang-fr-only notranslate">${reviewsCount} avis</span>
            `;
            document.getElementById('facility-reviews-empty').style.display = 'none';
        } else {
            document.getElementById('facility-reviews-link').innerHTML = `
                <span class="lang-en-only">0 reviews</span>
                <span class="lang-fr-only notranslate">0 avis</span>
            `;
            document.getElementById('facility-reviews-empty').style.display = 'block';
        }
    }

    window.toggleFacilityDescription = function() {
        const el = document.getElementById('facility-description');
        const icon = document.getElementById('facility-description-toggle-icon');
        const textEn = document.getElementById('facility-description-toggle-text-en');
        const textFr = document.getElementById('facility-description-toggle-text-fr');
        
        if (el.classList.contains('line-clamp-3')) {
            el.classList.remove('line-clamp-3');
            icon.classList.remove('fa-chevron-down');
            icon.classList.add('fa-chevron-up');
            textEn.textContent = 'Show less';
            textFr.textContent = 'Afficher moins';
        } else {
            el.classList.add('line-clamp-3');
            icon.classList.remove('fa-chevron-up');
            icon.classList.add('fa-chevron-down');
            textEn.textContent = 'Show more';
            textFr.textContent = 'Afficher plus';
        }
    };

    function renderPricingTiers() {
        try {
            pricingTiers = JSON.parse(activityData.pricing_tiers);
        } catch (e) {
            pricingTiers = [];
        }

        // Fallback for legacy data
        if (!pricingTiers || pricingTiers.length === 0) {
            pricingTiers = [];
            if (activityData.participant_price !== undefined) {
                pricingTiers.push({ name: 'Adult (18+)', price: activityData.participant_price });
            }
            if (activityData.participant_kid_price !== undefined) {
                pricingTiers.push({ name: 'Child', price: activityData.participant_kid_price });
            }
        }

        const container = document.getElementById('tier-controls-container');
        container.innerHTML = '';

        if (pricingTiers.length === 0) {
            pricingTiers = [{ name: 'Participant', price: 0 }];
        }

        pricingTiers.forEach((tier, index) => {
            const price = parseFloat(tier.price) || 0;
            // Default 1 to the first tier, 0 to the rest
            tierSelections[tier.name] = index === 0 ? 1 : 0;
            
            const priceText = price === 0 ? 'Free' : `$${price.toFixed(2)}`;

            const row = document.createElement('div');
            row.className = "flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-3";
            
            row.innerHTML = `
                <div class="flex flex-col">
                    <span class="font-bold text-dark text-sm">${tier.name}</span>
                    <span class="text-xs font-semibold text-primary">${priceText}</span>
                </div>
                <div class="flex items-center space-x-3 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
                    <button id="minus-${index}" class="w-7 h-7 rounded-md bg-white flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-dark transition-colors disabled:opacity-30"><i class="fa-solid fa-minus text-xs"></i></button>
                    <span class="font-bold text-dark text-sm inline-block w-4 text-center" id="count-${index}">${tierSelections[tier.name]}</span>
                    <button id="plus-${index}" class="w-7 h-7 rounded-md bg-white flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-dark transition-colors disabled:opacity-30"><i class="fa-solid fa-plus text-xs"></i></button>
                </div>
            `;
            
            container.appendChild(row);

            const minQty = index === 0 ? 0 : 0; // We will enforce total >= 1 elsewhere, so individual can go to 0

            document.getElementById(`minus-${index}`).addEventListener('click', () => {
                if (tierSelections[tier.name] > 0) {
                    tierSelections[tier.name]--;
                    updateTotal();
                }
            });

            document.getElementById(`plus-${index}`).addEventListener('click', () => {
                const totalJoined = Object.values(tierSelections).reduce((a, b) => a + b, 0);
                const maxSpots = Math.max(0, activityData.capacity - (activityData.joined_count || 0));
                
                if (totalJoined < maxSpots) {
                    tierSelections[tier.name]++;
                    updateTotal();
                }
            });
        });
        
        // Ensure at least 1 total spot is selected if there are spots left
        const maxSpots = Math.max(0, activityData.capacity - (activityData.joined_count || 0));
        if (maxSpots > 0) {
           let totalSelected = Object.values(tierSelections).reduce((a,b) => a+b, 0);
           if (totalSelected === 0 && pricingTiers.length > 0) {
               tierSelections[pricingTiers[0].name] = 1;
           }
        }
    }

    function updateTotal() {
        const maxSpots = Math.max(0, activityData.capacity - (activityData.joined_count || 0));
        let totalQty = 0;
        let subtotal = 0;
        
        pricingTiers.forEach((tier, index) => {
            const qty = tierSelections[tier.name];
            totalQty += qty;
            subtotal += (qty * parseFloat(tier.price || 0));
            
            const countEl = document.getElementById(`count-${index}`);
            if(countEl) countEl.textContent = qty;
            
            const minusBtn = document.getElementById(`minus-${index}`);
            if(minusBtn) minusBtn.disabled = qty <= 0;
            
            const plusBtn = document.getElementById(`plus-${index}`);
            if(plusBtn) plusBtn.disabled = totalQty >= maxSpots;
        });

        document.getElementById('subtotal-amount').textContent = `$${subtotal.toFixed(2)}`;
        document.getElementById('total-amount').textContent = `$${subtotal.toFixed(2)}`;
        
        // Setup starting at text
        let minPrice = Infinity;
        pricingTiers.forEach(t => {
            if(parseFloat(t.price||0) < minPrice) minPrice = parseFloat(t.price||0);
        });
        if (minPrice === Infinity) minPrice = 0;
        
        document.getElementById('checkout-price-display').textContent = `$${minPrice.toFixed(2)}`;
        document.getElementById('mobile-footer-price').innerHTML = `$${subtotal.toFixed(2)} <span class="text-xs font-normal text-slate-500">Total</span>`;
        
        const btn = document.getElementById('reserve-btn');
        const mBtn = document.getElementById('mobile-reserve-btn');
        
        if (maxSpots <= 0) {
            btn.disabled = true;
            btn.innerHTML = "Session Full";
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            mBtn.disabled = true;
            mBtn.innerHTML = "Full";
        } else if (totalQty === 0) {
            btn.disabled = true;
            btn.classList.add('opacity-50', 'cursor-not-allowed');
            mBtn.disabled = true;
        } else {
            btn.disabled = false;
            btn.innerHTML = `<span class="lang-en-only">Join Session</span><span class="lang-fr-only notranslate">Rejoindre la Session</span>`;
            btn.classList.remove('opacity-50', 'cursor-not-allowed');
            mBtn.disabled = false;
            mBtn.innerHTML = `<span class="lang-en-only">Join</span><span class="lang-fr-only notranslate">Rejoindre</span>`;
        }
        
        if (typeof window.applyTranslations === 'function') {
            window.applyTranslations();
        }
    }

    async function handleJoin() {
        const btn = document.getElementById('reserve-btn');
        const mBtn = document.getElementById('mobile-reserve-btn');
        
        // Check Auth
        let isLoggedIn = false;
        try {
            const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' });
            if (res.ok) isLoggedIn = true;
        } catch(e) {}

        if (!isLoggedIn) {
            document.getElementById('login-modal').classList.remove('hidden');
            return;
        }
        
        btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>";
        btn.disabled = true;
        mBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>";
        mBtn.disabled = true;
        
        try {
            const res = await fetch(`${API_BASE_URL}/api/public_sessions/join`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    booking_id: bookingId,
                    tierQuantities: tierSelections
                })
            });
            
            const data = await res.json();
            
            if (!res.ok) {
                await showAlertModal("Join Error", data.error || "Failed to join session", "OK", true);
            } else {
                if (data.url) {
                    window.location.href = data.url;
                } else if (data.redirectUrl) {
                    await showAlertModal("Success", "You've successfully joined the public activity!");
                    window.location.href = data.redirectUrl;
                }
            }
        } catch (e) {
            console.error(e);
            await showAlertModal("Error", "A network error occurred. Please try again.", "OK", true);
        } finally {
            updateTotal(); // Restore button text
        }
    }

    document.getElementById('reserve-btn').addEventListener('click', handleJoin);
    document.getElementById('mobile-reserve-btn').addEventListener('click', handleJoin);
    
    // Check if redirect params exist from stripe cancel
    if (urlParams.get('session_joined') === 'cancel') {
        showAlertModal("Payment Cancelled", "Your checkout was cancelled. Your spot has not been reserved.", "OK", true);
    }

    window.closeLoginModal = () => document.getElementById('login-modal').classList.add('hidden');

    // Profile Puck dropdown logic
    const puckBtn = document.getElementById('profile-puck-btn');
    const puckDropdown = document.getElementById('puck-dropdown');
    if (puckBtn && puckDropdown) {
        puckBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            puckDropdown.classList.toggle('hidden');
        });
        document.addEventListener('click', (e) => {
            if (!puckBtn.contains(e.target) && !puckDropdown.contains(e.target)) {
                puckDropdown.classList.add('hidden');
            }
        });
    }

    function updateNavUI(user) {
        const puckIcon = document.getElementById('puck-icon');
        const puckInitials = document.getElementById('puck-initials');
        const puckImg = document.getElementById('puck-img');
        const puckLoggedOut = document.getElementById('puck-logged-out');
        const puckLoggedIn = document.getElementById('puck-logged-in');
        const puckName = document.getElementById('puck-name');
        const puckEmail = document.getElementById('puck-email');
        const puckDashboard = document.getElementById('puck-dashboard');
        
        if (user) {
            if (puckIcon) puckIcon.classList.add('hidden');
            if (user.profile_picture) {
                if (puckImg) {
                    puckImg.src = user.profile_picture;
                    puckImg.classList.remove('hidden');
                }
                if (puckInitials) puckInitials.classList.add('hidden');
            } else {
                if (puckImg) puckImg.classList.add('hidden');
                if (puckInitials) {
                    const initials = (user.name || user.first_name || 'U').substring(0, 2);
                    puckInitials.textContent = initials;
                    puckInitials.classList.remove('hidden');
                }
            }
            if (puckLoggedOut) puckLoggedOut.classList.add('hidden');
            if (puckLoggedIn) {
                puckLoggedIn.classList.remove('hidden');
                if (puckName) puckName.textContent = user.name || user.first_name || 'User';
                if (puckEmail) puckEmail.textContent = user.email || '';
                if (puckDashboard) {
                    if (user.role === 'admin') puckDashboard.href = 'admin-dashboard.html';
                    else if (user.role === 'host') puckDashboard.href = 'owner-dashboard.html';
                    else puckDashboard.href = 'player-dashboard.html';
                }
            }
            
            const puckLogout = document.getElementById('puck-logout');
            if (puckLogout) {
                puckLogout.onclick = async (e) => {
                    e.preventDefault();
                    await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
                    localStorage.removeItem('gg_user');
                    window.location.reload();
                };
            }
        } else {
            if (puckIcon) puckIcon.classList.remove('hidden');
            if (puckInitials) puckInitials.classList.add('hidden');
            if (puckImg) puckImg.classList.add('hidden');
            if (puckLoggedOut) puckLoggedOut.classList.remove('hidden');
            if (puckLoggedIn) puckLoggedIn.classList.add('hidden');
        }
    }

    const storedUser = localStorage.getItem('gg_user');
    if (storedUser) {
        try { updateNavUI(JSON.parse(storedUser)); } catch(e){}
    }

    try {
        const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' });
        if (res.ok) {
            const data = await res.json();
            updateNavUI(data.user);
            (function(){ const _u = {...data.user}; delete _u.profile_picture; localStorage.setItem('gg_user', JSON.stringify(_u)); })();
        }
    } catch (e) { }

    loadActivity();
});
