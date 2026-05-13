const fs = require('fs');
let content = fs.readFileSync('surface.html', 'utf-8');

// The block we want to refactor starts around line 867
let targetStart = content.indexOf(`if (!Array.isArray(pricingRules) && pricingRules.booking_model) {`);
let targetEnd = content.indexOf(`window.pricingUnit = facility.pricing_unit || 'hour';`);

let newLogic = `
                    let isDropInOnly = (!Array.isArray(pricingRules) && pricingRules.booking_model === 'drop_in_only');

                    if (!Array.isArray(pricingRules) && pricingRules.booking_model) {
                        window.currentBookingModel = pricingRules.booking_model;
                        if (pricingRules.booking_model === 'shared_zone') {
                            window.totalLanes = pricingRules.total_zones || 8;
                            hourlyRate = pricingRules.zone_price || facility.base_price;
                            pricingRules = pricingRules.time_slots || [];
                            
                            const laneSelector = document.getElementById('lane-selector-container');
                            if (laneSelector) laneSelector.classList.remove('hidden');
                        } else if (pricingRules.booking_model === 'drop_in_only') {
                            pricingRules = [];
                            const availSec = document.getElementById('availability-section');
                            if(availSec) availSec.style.display = 'none';
                        } else {
                            pricingRules = pricingRules.time_slots || [];
                        }
                    }

                    // Always check for public activities and inject the widget if they exist or if it's drop-in only
                    fetch(\`\${API_BASE_URL}/api/public_sessions/\${facility.facility_id}?surface_id=\${surfaceIdParam}\`)
                        .then(res => res.json())
                        .then(sessions => {
                            const surfaceSessions = sessions.filter(s => String(s.surface_id) === String(surfaceIdParam));
                            
                            if (surfaceSessions.length === 0 && !isDropInOnly) {
                                // Do nothing, let the private booking widget remain
                                return;
                            }

                            const bookingWidget = document.getElementById('booking-widget-container');
                            if (!bookingWidget) return;

                            if (surfaceSessions.length === 0 && isDropInOnly) {
                                bookingWidget.innerHTML = \`
                                    <!-- Mobile Handle -->
                                    <div class="lg:hidden w-full flex justify-center pt-3 pb-0 cursor-pointer" id="close-booking-handle">
                                        <div class="w-12 h-1.5 bg-slate-300 rounded-full mb-2"></div>
                                    </div>

                                    <div class="bg-white lg:sticky lg:top-28 lg:border lg:border-slate-200 lg:shadow-xl rounded-t-3xl lg:rounded-2xl px-6 pt-2 pb-24 lg:p-6 lg:shadow-soft overflow-y-auto lg:overflow-visible max-h-[82vh] lg:max-h-none">
                                        <div class="bg-blue-50 border border-blue-100 rounded-2xl p-6 text-center">
                                            <div class="w-12 h-12 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
                                                <i class="fa-solid fa-users text-xl"></i>
                                            </div>
                                            <h3 class="text-lg font-bold text-dark mb-2">Public Activities Only</h3>
                                            <p class="text-sm text-slate-600">No upcoming public activities are currently scheduled for this surface. Please check back later.</p>
                                        </div>
                                    </div>
                                \`;
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
                            
                            let dateOptions = '';
                            dates.forEach(dStr => {
                                const d = new Date(dStr + 'T12:00:00');
                                const dLabel = d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', weekday: 'short' });
                                dateOptions += \`<option value="\${dStr}">\${dLabel}</option>\`;
                            });

                            let toggleHtml = '';
                            if (!isDropInOnly) {
                                toggleHtml = \`
                                    <div class="flex p-1 bg-slate-100 rounded-xl mb-6 relative">
                                        <button id="tab-public" class="flex-1 py-2 text-sm font-bold rounded-lg bg-white shadow-sm text-dark transition-custom relative z-10">Public Activities</button>
                                        <button id="tab-private" class="flex-1 py-2 text-sm font-bold rounded-lg text-slate-500 hover:text-dark transition-custom relative z-10">Private Booking</button>
                                    </div>
                                \`;
                            }
                            
                            // Let's improve the dropdowns ("slicker")
                            bookingWidget.innerHTML = \`
                                <!-- Mobile Handle -->
                                <div class="lg:hidden w-full flex justify-center pt-3 pb-0 cursor-pointer" id="close-booking-handle">
                                    <div class="w-12 h-1.5 bg-slate-300 rounded-full mb-2"></div>
                                </div>

                                <div class="bg-white lg:sticky lg:top-28 lg:border lg:border-slate-200 lg:shadow-xl rounded-t-3xl lg:rounded-2xl px-6 pt-2 pb-24 lg:p-6 lg:shadow-soft overflow-y-auto lg:overflow-visible max-h-[82vh] lg:max-h-none">
                                    \${toggleHtml}

                                    <div id="public-booking-content">
                                        <div class="border border-slate-300/60 rounded-2xl mb-5 relative z-10 bg-white shadow-sm overflow-hidden">
                                            <div class="flex flex-col border-b border-slate-200 relative">
                                                <div class="p-4 border-b border-slate-200 relative hover:bg-slate-50/80 transition-custom">
                                                    <label class="flex items-center text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                                                        <i class="fa-regular fa-calendar text-primary mr-1.5"></i> Date
                                                    </label>
                                                    <div class="relative group">
                                                        <input type="text" id="public-date-flatpickr" class="w-full text-base font-bold text-dark bg-transparent outline-none cursor-pointer placeholder-slate-400 group-hover:text-primary transition-colors" placeholder="Select a date" readonly>
                                                        <div class="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-transform group-hover:translate-x-1">
                                                            <i class="fa-solid fa-chevron-right text-sm"></i>
                                                        </div>
                                                    </div>
                                                </div>
                                                <div class="p-4 relative hover:bg-slate-50/80 transition-custom" id="public-time-trigger">
                                                    <label class="flex items-center text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5 cursor-pointer">
                                                        <i class="fa-regular fa-clock text-primary mr-1.5"></i> Time Slot
                                                    </label>
                                                    <div class="relative cursor-pointer group" id="public-time-display-container">
                                                        <div id="public-time-display" class="w-full text-base font-bold text-dark bg-transparent outline-none truncate pr-6 group-hover:text-primary transition-colors">Select a time slot</div>
                                                        <div class="absolute right-0 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none transition-transform group-hover:translate-y-0.5">
                                                            <i class="fa-solid fa-chevron-down text-sm"></i>
                                                        </div>
                                                    </div>
                                                    <select id="public-time-select" class="hidden"></select>
                                                    
                                                    <div id="public-time-dropdown" class="hidden absolute top-[calc(100%+8px)] left-0 right-0 bg-white border border-slate-200 rounded-xl shadow-[0_20px_40px_-10px_rgba(0,0,0,0.15)] z-[100] max-h-72 overflow-y-auto overflow-x-hidden ring-1 ring-black ring-opacity-5 origin-top scale-95 opacity-0 transition-all duration-200">
                                                        <ul id="public-time-list" class="py-2"></ul>
                                                    </div>
                                                </div>
                                            </div>
                                            <div class="p-4 bg-slate-50/50 relative">
                                                <label class="flex items-center text-xs font-bold uppercase tracking-wider text-slate-500 mb-3">
                                                    <i class="fa-solid fa-user-group text-primary mr-1.5"></i> Tickets
                                                </label>
                                                <div id="public-tiers-container" class="space-y-2.5">
                                                    <!-- Dynamic tiers injected here -->
                                                </div>
                                            </div>
                                        </div>

                                        <div class="bg-indigo-50/50 rounded-xl p-3.5 mb-5 border border-indigo-100/50">
                                            <h4 class="text-xs font-bold text-indigo-800/70 uppercase tracking-wide mb-2 flex items-center"><i class="fa-solid fa-ticket text-indigo-400 mr-1.5"></i> Selected Entry</h4>
                                            <div class="flex flex-wrap gap-2" id="public-selected-slots-container">
                                                <span class="text-sm font-medium text-slate-400 italic">No tickets selected</span>
                                            </div>
                                        </div>

                                        <button id="book-public-activity-btn" class="w-full bg-primary hover:bg-primaryHover text-white py-4 rounded-xl font-bold text-lg transition-all duration-300 shadow-glow hover:shadow-[0_0_25px_rgba(16,185,129,0.4)] mb-4 hover:-translate-y-0.5">
                                            Reserve Spot
                                        </button>
                                        <p class="text-center text-sm text-slate-400 mb-6 font-medium">You won't be charged yet</p>

                                        <!-- Price breakdown -->
                                        <div class="space-y-3 text-slate-600 pb-4 border-b border-slate-200 px-1">
                                            <div class="flex justify-between text-base">
                                                <span class="underline cursor-pointer decoration-slate-300 underline-offset-2" id="public-price-calculation">$0 x 0 spots</span>
                                                <span id="public-subtotal-amount" class="font-medium">$0.00</span>
                                            </div>
                                            <div class="flex justify-between text-base hidden" id="public-processing-fee-row">
                                                <span class="underline cursor-pointer decoration-slate-300 underline-offset-2">Processing fee</span>
                                                <span id="public-processing-fee-amount" class="font-medium">$0.00</span>
                                            </div>
                                            <div class="flex justify-between text-base">
                                                <span class="underline cursor-pointer decoration-slate-300 underline-offset-2 notranslate">Taxes</span>
                                                <span id="public-tax-amount" class="font-medium">$0.00</span>
                                            </div>
                                        </div>

                                        <div class="flex justify-between font-extrabold text-dark text-xl pt-4 px-1">
                                            <span>Total <span class="text-sm font-semibold text-slate-400">(CAD)</span></span>
                                            <span id="public-total-amount" class="text-primary">$0.00</span>
                                        </div>
                                    </div>
                                </div>
                            \`;

                            if (!isDropInOnly) {
                                document.getElementById('tab-private').addEventListener('click', () => {
                                    window.location.reload(); 
                                });
                            }
`;

// Extract everything from \`const timeSelect = document.getElementById('public-time-select');\` down to \`.catch(err => {\`
let timeSelectStart = content.indexOf(\`const timeSelect = document.getElementById('public-time-select');\`);
let catchBlockStart = content.indexOf(\`})\`, timeSelectStart);
let catchBlockEnd = content.indexOf(\`}\`, catchBlockStart + 2) + 1; // get to the end of .catch

let innerLogic = content.substring(timeSelectStart, catchBlockEnd);

// Also need to patch the dropdown toggle logic to include the animation classes
innerLogic = innerLogic.replace(
    /timeDropdown.classList.toggle\('hidden'\);/,
    "if (timeDropdown.classList.contains('hidden')) { timeDropdown.classList.remove('hidden'); setTimeout(() => { timeDropdown.classList.remove('scale-95', 'opacity-0'); timeDropdown.classList.add('scale-100', 'opacity-100'); }, 10); } else { timeDropdown.classList.remove('scale-100', 'opacity-100'); timeDropdown.classList.add('scale-95', 'opacity-0'); setTimeout(() => timeDropdown.classList.add('hidden'), 200); }"
);

innerLogic = innerLogic.replace(
    /timeDropdown.classList.add\('hidden'\);/g,
    "timeDropdown.classList.remove('scale-100', 'opacity-100'); timeDropdown.classList.add('scale-95', 'opacity-0'); setTimeout(() => timeDropdown.classList.add('hidden'), 200);"
);

newLogic += '\n                            ' + innerLogic + '\n';

content = content.substring(0, targetStart) + newLogic + '\n                    ' + content.substring(targetEnd);

fs.writeFileSync('surface.html', content);
console.log('Refactoring complete');
