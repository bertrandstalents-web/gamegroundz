window.initPublicActivityWidget = function(facility, surfaceIdParam) {
    const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';

    fetch(`${API_BASE_URL}/api/public_sessions/${facility.facility_id}?surface_id=${surfaceIdParam}`)
        .then(res => {
            if (!res.ok) throw new Error(`API returned ${res.status}`);
            return res.json();
        })
        .then(sessions => {
            if (sessions.error) throw new Error(sessions.error);
            
            // Relaxed filter: include sessions that either match the surface_id exactly or are facility-wide (null/undefined)
            const surfaceSessions = Array.isArray(sessions) ? sessions.filter(s => !s.surface_id || String(s.surface_id) === String(surfaceIdParam) || String(s.surface_id) === 'null') : [];
            
            const bookingWidget = document.getElementById('booking-widget-container');
            if (!bookingWidget) return;

            if (surfaceSessions.length === 0) {
                // No public sessions, display empty state
                bookingWidget.innerHTML = `
                <div class="bg-white lg:sticky lg:top-28 lg:border lg:border-slate-200 lg:shadow-xl rounded-t-3xl lg:rounded-2xl px-6 py-8 lg:p-8 text-center text-slate-500">
                    <i class="fa-regular fa-calendar-xmark text-4xl mb-4 text-slate-300"></i>
                    <h3 class="text-lg font-bold text-dark mb-2">No Sessions Available</h3>
                    <p class="text-sm">There are currently no public activities scheduled for this surface.</p>
                </div>`;
                return;
            }

            // Group sessions by date
            const sessionsByDate = {};
            surfaceSessions.forEach(session => {
                const dStr = session.booking_date;
                if (!sessionsByDate[dStr]) sessionsByDate[dStr] = [];
                sessionsByDate[dStr].push(session);
            });
            
            const dates = Object.keys(sessionsByDate).sort();

            // Build HTML
            let dateListHtml = '';
            dates.forEach(dStr => {
                const d = new Date(dStr + 'T12:00:00');
                const dLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
                dateListHtml += `<li class="px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 date-option" data-date="${dStr}">${dLabel}</li>`;
            });

            bookingWidget.innerHTML = `
                <!-- Mobile Handle -->
                <div class="lg:hidden w-full flex justify-center pt-3 pb-0 cursor-pointer" id="close-booking-handle">
                    <div class="w-12 h-1.5 bg-slate-300 rounded-full mb-2"></div>
                </div>

                <div class="bg-white lg:sticky lg:top-28 lg:border lg:border-slate-200 lg:shadow-xl rounded-t-3xl lg:rounded-2xl px-6 pt-2 pb-24 lg:p-6 lg:shadow-soft overflow-y-auto lg:overflow-visible max-h-[82vh] lg:max-h-none">
                    <div class="border border-slate-300 rounded-xl mb-4 relative z-[60]">
                        <div class="flex border-b border-slate-300 relative">
                            <!-- Date Dropdown Trigger -->
                            <div class="flex-1 p-3 border-r border-slate-300 cursor-pointer hover:bg-slate-50 transition-custom relative rounded-tl-xl group" id="pa-date-trigger">
                                <div class="text-sm font-medium text-slate-700 w-full h-full flex items-center pr-6 whitespace-nowrap" id="pa-selected-date">Select Date</div>
                                <div class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-primary transition-colors"><i class="fa-solid fa-chevron-down text-xs"></i></div>
                                
                                <div id="pa-date-dropdown" class="hidden absolute top-full left-0 mt-1 w-full bg-white border border-slate-200 rounded-lg shadow-lg z-[100] max-h-48 overflow-y-auto">
                                    <ul id="pa-date-list" class="py-1">${dateListHtml}</ul>
                                </div>
                            </div>

                            <!-- Time Slot Dropdown Trigger -->
                            <div class="flex-1 p-3 cursor-pointer hover:bg-slate-50 transition-custom relative rounded-tr-xl group" id="pa-time-trigger">
                                <div class="text-sm font-medium text-slate-700 overflow-hidden text-ellipsis whitespace-nowrap w-full h-full flex items-center pr-6" id="pa-selected-time">Select Time</div>
                                <div class="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 group-hover:text-primary transition-colors"><i class="fa-solid fa-chevron-down text-xs"></i></div>

                                <div id="pa-time-dropdown" class="hidden absolute top-[calc(100%+4px)] left-0 w-[200px] bg-white border border-slate-200 rounded-xl shadow-2xl z-[100] max-h-64 overflow-y-auto">
                                    <ul id="pa-time-list" class="py-1">
                                        <li class="px-4 py-2 text-sm text-slate-500 italic">Please select a date first</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                        
                        <div class="p-4 bg-white relative rounded-b-xl">
                            <div id="pa-tiers-container" class="space-y-3">
                                <div class="text-sm text-slate-400 italic text-center py-2">Select a time slot to see tickets</div>
                            </div>
                        </div>
                    </div>

                    <div class="bg-indigo-50/50 rounded-xl p-3 mb-5 border border-indigo-100/50">
                        <h4 class="text-[10px] font-bold text-indigo-800/70 uppercase tracking-wide mb-2">Selected Slots</h4>
                        <div id="pa-selected-summary" class="text-xs font-medium text-slate-600 bg-white/60 p-2 rounded border border-indigo-100/50">
                            No tickets selected
                        </div>
                    </div>

                    <button id="pa-reserve-btn" class="w-full bg-primary hover:bg-primaryHover text-white py-3.5 rounded-xl font-bold text-base transition-all duration-300 shadow-glow mb-4 opacity-50 cursor-not-allowed" disabled>
                        Reserve Now
                    </button>
                    <p class="text-center text-xs text-slate-400 mb-2 font-medium">You won't be charged yet</p>
                    
                    <div class="flex justify-between font-extrabold text-dark text-lg pt-4 px-1 border-t border-slate-200">
                        <span>Total <span class="text-xs font-semibold text-slate-400">(CAD)</span></span>
                        <span id="pa-total-amount" class="text-primary">$0.00</span>
                    </div>
                </div>
            `;

            // State
            let paSelectedDate = null;
            let paSelectedSession = null;
            let paTierSelections = {};
            
            // Logic
            const dateTrigger = document.getElementById('pa-date-trigger');
            const dateDropdown = document.getElementById('pa-date-dropdown');
            const timeTrigger = document.getElementById('pa-time-trigger');
            const timeDropdown = document.getElementById('pa-time-dropdown');
            const timeList = document.getElementById('pa-time-list');
            const tiersContainer = document.getElementById('pa-tiers-container');
            const reserveBtn = document.getElementById('pa-reserve-btn');

            // Close dropdowns on outside click
            document.addEventListener('click', (e) => {
                if (!dateTrigger.contains(e.target)) dateDropdown.classList.add('hidden');
                if (!timeTrigger.contains(e.target)) timeDropdown.classList.add('hidden');
            });

            // Date Selection
            dateTrigger.addEventListener('click', () => {
                dateDropdown.classList.toggle('hidden');
                timeDropdown.classList.add('hidden');
            });

            document.querySelectorAll('.date-option').forEach(opt => {
                opt.addEventListener('click', (e) => {
                    e.stopPropagation();
                    paSelectedDate = e.target.getAttribute('data-date');
                    
                    // Update checkmarks and text
                    document.querySelectorAll('.date-option').forEach(el => el.innerHTML = el.innerHTML.replace('✓ ', ''));
                    e.target.innerHTML = '✓ ' + e.target.innerHTML;
                    
                    document.getElementById('pa-selected-date').textContent = e.target.textContent.replace('✓ ', '');
                    dateDropdown.classList.add('hidden');

                    // Populate Times
                    const daySessions = sessionsByDate[paSelectedDate] || [];
                    let timeHtml = '';
                    daySessions.forEach((s, idx) => {
                        let slots = s.time_slots;
                        if (typeof slots === 'string') { try { slots = JSON.parse(slots); } catch(e) { slots = slots.split(','); } }
                        const timeLabel = slots && slots.length > 0 ? slots[0] : 'Time TBD';
                        
                        // Parse pricing_tiers to get lowest price
                        let minPrice = 'Free';
                        try {
                            let pt = s.pricing_tiers;
                            if (typeof pt === 'string' && pt.trim().length > 0) {
                                pt = JSON.parse(pt);
                            }
                            if (Array.isArray(pt) && pt.length > 0) {
                                let minP = Infinity;
                                pt.forEach(t => { if(parseFloat(t.price||0) < minP) minP = parseFloat(t.price||0); });
                                minPrice = minP === Infinity ? 'Free' : '$' + minP.toFixed(2);
                            } else if (!pt && (s.participant_price > 0 || s.participant_kid_price > 0)) {
                                let minP = Infinity;
                                if (s.participant_price !== undefined && s.participant_price > 0) minP = Math.min(minP, s.participant_price);
                                if (s.participant_kid_price !== undefined && s.participant_kid_price > 0) minP = Math.min(minP, s.participant_kid_price);
                                minPrice = minP === Infinity ? 'Free' : '$' + minP.toFixed(2);
                            }
                        } catch(e) {}

                        timeHtml += `<li class="px-4 py-2 hover:bg-slate-50 cursor-pointer text-sm font-medium text-slate-700 time-option flex justify-between" data-idx="${idx}">
                            <span>${timeLabel} - ${s.manual_notes || 'Activity'}</span>
                            <span class="text-xs text-primary">${minPrice}</span>
                        </li>`;
                    });
                    
                    timeList.innerHTML = timeHtml;
                    document.getElementById('pa-selected-time').textContent = 'Select Time';
                    tiersContainer.innerHTML = '<div class="text-sm text-slate-400 italic text-center py-2">Select a time slot to see tickets</div>';
                    paSelectedSession = null;
                    updateTotal();

                    // Attach time clicks
                    document.querySelectorAll('.time-option').forEach(opt => {
                        opt.addEventListener('click', (ev) => {
                            ev.stopPropagation();
                            const idx = ev.currentTarget.getAttribute('data-idx');
                            paSelectedSession = daySessions[idx];
                            
                            document.querySelectorAll('.time-option').forEach(el => el.innerHTML = el.innerHTML.replace('✓ ', ''));
                            ev.currentTarget.innerHTML = '✓ ' + ev.currentTarget.innerHTML;
                            
                            let slots = paSelectedSession.time_slots;
                            if (typeof slots === 'string') { try { slots = JSON.parse(slots); } catch(e) { slots = slots.split(','); } }
                            const timeLabel = slots && slots.length > 0 ? slots[0] : 'Time TBD';
                            
                            document.getElementById('pa-selected-time').textContent = timeLabel;
                            timeDropdown.classList.add('hidden');
                            
                            renderTiers();
                        });
                    });
                    
                    // Auto-select first time
                    const firstTimeOpt = timeList.querySelector('.time-option');
                    if (firstTimeOpt) firstTimeOpt.click();
                });
            });

            timeTrigger.addEventListener('click', () => {
                if (!paSelectedDate) return;
                timeDropdown.classList.toggle('hidden');
                dateDropdown.classList.add('hidden');
            });

            function renderTiers() {
                paTierSelections = {};
                let pricingTiers = [];
                try {
                    let pt = paSelectedSession.pricing_tiers;
                    if (typeof pt === 'string' && pt.trim().length > 0) {
                        pt = JSON.parse(pt);
                    }
                    if (Array.isArray(pt)) {
                        pricingTiers = pt;
                    } else {
                        pricingTiers = [];
                    }
                } catch (e) {
                    pricingTiers = [];
                }

                if (!pricingTiers || pricingTiers.length === 0) {
                    pricingTiers = [];
                    if (paSelectedSession.participant_price !== undefined && paSelectedSession.participant_price !== null && paSelectedSession.participant_price > 0) {
                        pricingTiers.push({ name: 'Adult (18+)', price: paSelectedSession.participant_price });
                    }
                    if (paSelectedSession.participant_kid_price !== undefined && paSelectedSession.participant_kid_price !== null && paSelectedSession.participant_kid_price > 0) {
                        pricingTiers.push({ name: 'Kids', price: paSelectedSession.participant_kid_price });
                    }
                }
                if (pricingTiers.length === 0) {
                    pricingTiers = [{ name: 'Participant', price: 0 }];
                }

                tiersContainer.innerHTML = '';
                pricingTiers.forEach((tier, index) => {
                    paTierSelections[tier.name] = 0;
                    const price = parseFloat(tier.price) || 0;
                    const priceText = price === 0 ? 'Free' : `$${price.toFixed(2)}`;

                    const row = document.createElement('div');
                    row.className = "flex items-center justify-between bg-slate-50 border border-slate-100 rounded-xl p-3";
                    row.innerHTML = `
                        <div class="flex flex-col">
                            <span class="font-bold text-dark text-sm">${tier.name}</span>
                            <span class="text-xs font-semibold text-primary">${priceText}</span>
                        </div>
                        <div class="flex items-center space-x-3 bg-white border border-slate-200 rounded-lg px-2 py-1 shadow-sm">
                            <button id="pa-minus-${index}" class="w-7 h-7 rounded-md bg-white flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-dark transition-colors disabled:opacity-30"><i class="fa-solid fa-minus text-xs"></i></button>
                            <span class="font-bold text-dark text-sm inline-block w-4 text-center" id="pa-count-${index}">0</span>
                            <button id="pa-plus-${index}" class="w-7 h-7 rounded-md bg-white flex items-center justify-center text-slate-500 hover:bg-slate-100 hover:text-dark transition-colors disabled:opacity-30"><i class="fa-solid fa-plus text-xs"></i></button>
                        </div>
                    `;
                    tiersContainer.appendChild(row);

                    document.getElementById(`pa-minus-${index}`).addEventListener('click', () => {
                        if (paTierSelections[tier.name] > 0) {
                            paTierSelections[tier.name]--;
                            updateTotal(pricingTiers);
                        }
                    });

                    document.getElementById(`pa-plus-${index}`).addEventListener('click', () => {
                        const totalJoined = Object.values(paTierSelections).reduce((a, b) => a + b, 0);
                        const maxSpots = Math.max(0, paSelectedSession.capacity - (paSelectedSession.joined_count || 0));
                        if (totalJoined < maxSpots) {
                            paTierSelections[tier.name]++;
                            updateTotal(pricingTiers);
                        }
                    });
                });
                
                // Select 1 of the first tier if spots available
                const maxSpots = Math.max(0, paSelectedSession.capacity - (paSelectedSession.joined_count || 0));
                if (maxSpots > 0 && pricingTiers.length > 0) {
                    paTierSelections[pricingTiers[0].name] = 1;
                }
                
                updateTotal(pricingTiers);
            }

            function updateTotal(pricingTiers = []) {
                if (!paSelectedSession) {
                    document.getElementById('pa-selected-summary').innerHTML = 'No tickets selected';
                    reserveBtn.disabled = true;
                    reserveBtn.classList.add('opacity-50', 'cursor-not-allowed');
                    document.getElementById('pa-total-amount').textContent = '$0.00';
                    return;
                }

                const maxSpots = Math.max(0, paSelectedSession.capacity - (paSelectedSession.joined_count || 0));
                let totalQty = 0;
                let subtotal = 0;
                
                pricingTiers.forEach((tier, index) => {
                    const qty = paTierSelections[tier.name];
                    totalQty += qty;
                    subtotal += (qty * parseFloat(tier.price || 0));
                    
                    const countEl = document.getElementById(`pa-count-${index}`);
                    if(countEl) countEl.textContent = qty;
                    
                    const minusBtn = document.getElementById(`pa-minus-${index}`);
                    if(minusBtn) minusBtn.disabled = qty <= 0;
                    
                    const plusBtn = document.getElementById(`pa-plus-${index}`);
                    if(plusBtn) plusBtn.disabled = totalQty >= maxSpots;
                });

                document.getElementById('pa-total-amount').textContent = `$${subtotal.toFixed(2)}`;
                
                // Update summary
                const d = new Date(paSelectedDate + 'T12:00:00');
                const dateLabel = d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
                let slots = paSelectedSession.time_slots;
                if (typeof slots === 'string') { try { slots = JSON.parse(slots); } catch(e) { slots = slots.split(','); } }
                const timeLabel = slots && slots.length > 0 ? slots[0] : 'Time TBD';

                document.getElementById('pa-selected-summary').innerHTML = `
                    <div class="text-emerald-600 font-bold">${dateLabel}</div>
                    <div class="text-slate-600">${timeLabel} - ${paSelectedSession.manual_notes || 'Activity'} <span class="font-bold">(${totalQty} spot${totalQty !== 1 ? 's' : ''})</span></div>
                `;

                if (maxSpots <= 0) {
                    reserveBtn.disabled = true;
                    reserveBtn.textContent = "Session Full";
                    reserveBtn.classList.add('opacity-50', 'cursor-not-allowed');
                } else if (totalQty === 0) {
                    reserveBtn.disabled = true;
                    reserveBtn.textContent = "Reserve Now";
                    reserveBtn.classList.add('opacity-50', 'cursor-not-allowed');
                } else {
                    reserveBtn.disabled = false;
                    reserveBtn.textContent = "Reserve Now";
                    reserveBtn.classList.remove('opacity-50', 'cursor-not-allowed');
                }
            }

            reserveBtn.addEventListener('click', async () => {
                // Check Auth
                let isLoggedIn = false;
                try {
                    const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' });
                    if (res.ok) isLoggedIn = true;
                } catch(e) {}

                if (!isLoggedIn) {
                    const loginModal = document.getElementById('login-modal');
                    if (loginModal) {
                        loginModal.classList.remove('hidden');
                    } else {
                        window.location.href = 'index.html?login=true&redirect=' + encodeURIComponent(window.location.pathname + window.location.search);
                    }
                    return;
                }

                // Check for Host role
                try {
                    const storedUser = localStorage.getItem('gg_user');
                    if (storedUser) {
                        const parsedUser = JSON.parse(storedUser);
                        if (parsedUser.role === 'host') {
                            if (typeof window.showAlertModal === 'function') {
                                window.showAlertModal('Booking Restricted', 'Hosts are not allowed to join public activities. Please log in as a Player.', 'OK', true);
                            } else {
                                alert('Hosts are not allowed to join public activities. Please log in as a Player.');
                            }
                            return;
                        }
                    }
                } catch(e) {}
                
                reserveBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>";
                reserveBtn.disabled = true;
                
                try {
                    const res = await fetch(`${API_BASE_URL}/api/public_sessions/join`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({
                            booking_id: paSelectedSession.id,
                            tierQuantities: paTierSelections
                        })
                    });
                    const data = await res.json();
                    
                    if (!res.ok) {
                        throw new Error(data.error || 'Failed to join session');
                    }

                    if (data.url) {
                        window.location.href = data.url;
                    } else if (data.redirectUrl) {
                        if (typeof window.showAlertModal === 'function') {
                            window.showAlertModal("Success", "You've successfully joined the public activity!");
                        } else {
                            alert("You've successfully joined the public activity!");
                        }
                        window.location.href = data.redirectUrl;
                    } else {
                        window.location.href = 'player-dashboard.html';
                    }
                } catch (error) {
                    if (typeof window.showAlertModal === 'function') {
                        window.showAlertModal('Error', error.message, 'OK', true);
                    } else {
                        alert(error.message);
                    }
                    reserveBtn.textContent = "Reserve Now";
                    reserveBtn.disabled = false;
                }
            });
            
            // Auto-select the first date
            if (dates.length > 0) {
                const firstDateTrigger = document.querySelector('.date-option');
                if (firstDateTrigger) firstDateTrigger.click();
            }
        });
};
