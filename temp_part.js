        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        primary: '#10b981',
                        primaryHover: '#059669',
                        dark: '#0f172a',
                        darker: '#020617',
                        light: '#f8fafc',
                    },
                    fontFamily: {
                        sans: ['Outfit', 'sans-serif'],
                    },
                    boxShadow: {
                        'soft': '0 10px 40px -10px rgba(0,0,0,0.08)',
                        'glow': '0 0 20px rgba(16, 185, 129, 0.3)',
                    }
                }
            }
        }
        // Booking Widget Logic
        document.addEventListener('DOMContentLoaded', async () => {
            let hourlyRate = 197;
            let pricingRules = [];
            let processingFee = 15;
            const taxRate = 0.14975; // ~15% tax in Quebec

            function getPriceForTimeSlot(timeStr, basePrice, rules, isWeekend) {
                if (!rules || rules.length === 0) return parseFloat(basePrice);
                const match = timeStr.match(/(\d+):(\d+)\s*(AM|PM)/i);
                if (!match) return parseFloat(basePrice);
                
                let h = parseInt(match[1]);
                const isPM = match[3].toUpperCase() === 'PM';
                if (isPM && h !== 12) h += 12;
                if (!isPM && h === 12) h = 0;
                
                const time24 = `${h.toString().padStart(2, '0')}:${match[2]}`;
                for (let i = 0; i < rules.length; i++) {
                    const rule = rules[i];
                    
                    if (rule.days === 'weekdays' && isWeekend) continue;
                    if (rule.days === 'weekends' && !isWeekend) continue;

                    if (time24 >= rule.start && time24 < rule.end) {
                        return parseFloat(rule.price);
                    }
                }
                return parseFloat(basePrice);
            }
            
            // Dynamically generated slots based on operating hours
            let availableSlots = [];
            let facilityOperatingHours = { open: "06:00", close: "23:00" };

            function formatTime12(h, m) {
                let period = 'AM';
                let h12 = h;
                if (h12 >= 12) {
                    period = 'PM';
                    if (h12 > 12) h12 -= 12;
                }
                if (h12 === 0) h12 = 12;
                return `${h12}:${m.toString().padStart(2, '0')} ${period}`;
            }

            function generateDailySlots(opHours) {
                const slots = [];
                let [openH, openM] = opHours.open.split(':').map(Number);
                let [closeH, closeM] = opHours.close.split(':').map(Number);
                
                // Allow rolling over to midnight (24:00)
                if (closeH === 0 && closeM === 0) closeH = 24;

                let currentMins = openH * 60 + openM;
                const endMins = closeH * 60 + closeM;

                while (currentMins + 30 <= endMins) {
                    const h1 = Math.floor(currentMins / 60);
                    const m1 = currentMins % 60;
                    const h2 = Math.floor((currentMins + 30) / 60);
                    const m2 = (currentMins + 30) % 60;

                    const time12Str1 = formatTime12(h1, m1);
                    const time12Str2 = h2 >= 24 ? "12:00 AM" : formatTime12(h2, m2);
                    
                    const time24Str = `${h1.toString().padStart(2, '0')}:${m1.toString().padStart(2, '0')}`;

                    // ID is now the canonical HH:MM start time string
                    slots.push({ id: time24Str, time: `${time12Str1} - ${time12Str2}` });
                    currentMins += 30; // 30-min slots
                }
                return slots;
            }
            
            let selectedSlotIds = new Set(); // Start with no slots selected

            const trigger = document.getElementById('time-slot-trigger');
            const dropdown = document.getElementById('time-slot-dropdown');
            const slotsList = document.getElementById('available-slots-list');
            const slotsSummary = document.getElementById('slots-summary');
            const selectedContainer = document.getElementById('selected-slots-container');
            const reserveBtn = document.getElementById('reserve-btn');

            window.publicSessionSlots = new Map(); // "YYYY-MM-DD|HH:MM" -> public_session object

            let bookedSlotIds = new Set(); // Stores IDs of private slots AND fully loaded public sessions

            async function fetchBookedSlots() {
                if (!currentFacilityId) return new Set();
                try {
                    const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                    // Fetch all without date param
                    const response = await fetch(`${API_BASE_URL}/api/bookings/${currentFacilityId}`);
                    if (response.ok) {
                        const bookings = await response.json();
                        let bookedIds = new Set();
                        window.publicSessionSlots.clear();
                        
                        bookings.forEach(b => {
                            if (b.time_slots && b.booking_date) {
                                const dStr = b.booking_date.split('T')[0];
                                const isPublic = b.booking_type === 'public_session';
                                const isFull = isPublic && b.joined_count >= b.capacity;
                                
                                try {
                                    const slotsArr = JSON.parse(b.time_slots);
                                    if(Array.isArray(slotsArr)) {
                                        slotsArr.forEach(id => {
                                            const key = `${dStr}|${String(id)}`;
                                            if (isPublic) {
                                                window.publicSessionSlots.set(key, b);
                                                if (isFull) bookedIds.add(key);
                                            } else {
                                                bookedIds.add(key);
                                            }
                                        });
                                    } else {
                                        b.time_slots.split(',').forEach(id => {
                                            const key = `${dStr}|${String(id).trim()}`;
                                            if (isPublic) {
                                                window.publicSessionSlots.set(key, b);
                                                if (isFull) bookedIds.add(key);
                                            } else bookedIds.add(key);
                                        });
                                    }
                                } catch(e) {
                                    b.time_slots.split(',').forEach(id => {
                                        const key = `${dStr}|${String(id).trim()}`;
                                        if (isPublic) {
                                            window.publicSessionSlots.set(key, b);
                                            if (isFull) bookedIds.add(key);
                                        } else bookedIds.add(key);
                                    });
                                }
                            }
                        });
                        return bookedIds;
                    }
                } catch (err) {
                    console.error("Failed to fetch booked slots:", err);
                }
                return new Set();
            }

            const priceCalcEl = document.getElementById('price-calculation');
            const subtotalEl = document.getElementById('subtotal-amount');
            const taxEl = document.getElementById('tax-amount');
            const totalEl = document.getElementById('total-amount');


            const mobileReserveBtn = document.getElementById('mobile-reserve-btn');
            
            let currentTotal = 0;
            let currentFacilityName = "Loading Facility..."; // Default
            let currentFacilityId = null;

            // --- FETCH FACILITY DATA ---
            const urlParams = new URLSearchParams(window.location.search);
            const facilityIdParam = urlParams.get('id');

            if (facilityIdParam) {
                try {
                    const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                    const response = await fetch(`${API_BASE_URL}/api/facilities/${facilityIdParam}`);
                    if (!response.ok) throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                    
                    const text = await response.text();
                    if (!text) throw new Error("Server returned an empty response.");
                    
                    let facility;
                    try {
                        facility = JSON.parse(text);
                    } catch (e) {
                        throw new Error("Invalid format received from server.");
                    }
                    
                    // Update global state
                    hourlyRate = facility.base_price || facility.price || 197;
                    let hasProcessingFee = (facility.has_processing_fee == 1 || facility.has_processing_fee === true || facility.has_processing_fee === '1' || facility.has_processing_fee === undefined);
                    processingFee = hasProcessingFee ? (facility.processing_fee_amount !== undefined ? Number(facility.processing_fee_amount) : 15.00) : 0;
                    try {
                        pricingRules = JSON.parse(facility.pricing_rules || '[]');
                    } catch (e) {
                        pricingRules = [];
                    }
                    try {
                        facilityOperatingHours = JSON.parse(facility.operating_hours || '{"open": "06:00", "close": "23:00"}');
                    } catch (e) {
                        facilityOperatingHours = { open: "06:00", close: "23:00" };
                    }
                    // Generate slots for the booking widget
                    availableSlots = generateDailySlots(facilityOperatingHours);

                    currentFacilityName = facility.name;
                    currentFacilityId = facility.id;
                    const facilityDiscounts = facility.discounts || [];
                    
                    // Handle Connected Facilities Switcher
                    const connectedContainer = document.getElementById('connected-facilities-switcher-container');
                    const connectedSelect = document.getElementById('connected-facility-select');
                    
                    if (facility.connected_facilities_data && facility.connected_facilities_data.length > 0) {
                        connectedContainer.classList.remove('hidden');
                        
                        let optionsHtml = `<option value="${facility.id}" selected>${facility.name} (Current)</option>`;
                        facility.connected_facilities_data.forEach(f => {
                            optionsHtml += `<option value="${f.id}">${f.name}</option>`;
                        });
                        
                        connectedSelect.innerHTML = optionsHtml;
                        
                        // Listen for switch
                        connectedSelect.addEventListener('change', (e) => {
                            if (e.target.value != facility.id) {
                                window.location.href = `facility.html?id=${e.target.value}`;
                            }
                        });
                    }

                    // Expose it globally for render
                    window.facilityDiscounts = facilityDiscounts;

                    // Update UI elements
                    document.title = `${facility.name} | GameGroundz`;
                    
                    // Image Gallery Logic
                    const galleryContainer = document.getElementById('facility-gallery');
                    let images = [];

                    try {
                        const parsed = JSON.parse(facility.image_url);
                        if (Array.isArray(parsed) && parsed.length > 0) {
                            images = parsed;
                        } else if (facility.image_url) {
                            images = [facility.image_url];
                        }
                    } catch (e) {
                        if (facility.image_url) images = [facility.image_url];
                    }

                    // Fallback neutral image if none exist
                    if (images.length === 0) {
                        images = ['https://images.unsplash.com/photo-1518605368461-1ee0ab24b829?ixlib=rb-4.0.3&auto=format&fit=crop&w=1400&q=80'];
                    }

                    // Dynamically build the gallery
                    galleryContainer.innerHTML = '';
                    const baseClass = "flex overflow-x-auto snap-x snap-mandatory hide-scrollbar md:grid gap-2 h-64 md:h-[450px] mb-8 md:mb-12 md:rounded-2xl md:overflow-hidden cursor-pointer group w-[100vw] -ml-4 sm:-ml-6 lg:ml-0 lg:w-full px-4 sm:px-6 lg:px-0";
                    const mobileImgClass = "w-[85vw] md:w-full h-full flex-shrink-0 snap-center rounded-xl md:rounded-none overflow-hidden relative bg-slate-100 flex items-center justify-center";
                    
                    if (images.length === 1) {
                        galleryContainer.className = `${baseClass} md:grid-cols-1 w-full mt-4 md:mt-0`;
                        galleryContainer.innerHTML = `
                            <div class="${mobileImgClass} w-full pr-4 md:pr-0">
                                <img src="${images[0]}" class="w-full h-full object-cover transition duration-500">
                            </div>
                        `;
                    } else if (images.length === 2) {
                        galleryContainer.className = `${baseClass} md:grid-cols-2 mt-4 md:mt-0`;
                        galleryContainer.innerHTML = `
                            <div class="${mobileImgClass}">
                                <img src="${images[0]}" class="w-full h-full object-cover transition duration-500">
                            </div>
                            <div class="${mobileImgClass} pr-4 md:pr-0">
                                <img src="${images[1]}" class="w-full h-full object-cover transition duration-500">
                            </div>
                        `;
                    } else if (images.length === 3) {
                        galleryContainer.className = `${baseClass} md:grid-cols-3 mt-4 md:mt-0`;
                        galleryContainer.innerHTML = `
                            <div class="${mobileImgClass} md:col-span-2">
                                <img src="${images[0]}" class="w-full h-full object-cover transition duration-500">
                            </div>
                            <div class="hidden md:flex flex-col gap-2 h-full w-[85vw] md:w-auto flex-shrink-0 snap-center">
                                <div class="relative flex-1 overflow-hidden bg-slate-100 block">
                                    <img src="${images[1]}" class="w-full h-full object-cover transition duration-500">
                                </div>
                                <div class="relative flex-1 overflow-hidden bg-slate-100 block">
                                    <img src="${images[2]}" class="w-full h-full object-cover transition duration-500">
                                </div>
                            </div>
                            <div class="md:hidden ${mobileImgClass}"><img src="${images[1]}" class="w-full h-full object-cover transition duration-500"></div>
                            <div class="md:hidden ${mobileImgClass} pr-4 md:pr-0"><img src="${images[2]}" class="w-full h-full object-cover transition duration-500"></div>
                        `;
                    } else if (images.length >= 4) {
                        galleryContainer.className = `${baseClass} md:grid-cols-4 mt-4 md:mt-0`;
                        
                        let html = `
                            <div class="${mobileImgClass} md:col-span-2 md:row-span-2">
                                <img src="${images[0]}" class="w-full h-full object-cover hover:scale-105 transition duration-500">
                            </div>
                            <div class="${mobileImgClass}">
                                <img src="${images[1]}" class="w-full h-full object-cover hover:scale-105 transition duration-500">
                            </div>
                            <div class="${mobileImgClass}">
                                <img src="${images[2]}" class="w-full h-full object-cover hover:scale-105 transition duration-500">
                            </div>
                            <div class="${mobileImgClass} md:block">
                                <img src="${images[3]}" class="w-full h-full object-cover hover:scale-105 transition duration-500">
                            </div>
                        `;
                        
                        if (images.length >= 5) {
                            html += `
                                <div class="${mobileImgClass} md:block ${images.length === 5 ? 'pr-4 md:pr-0' : ''}">
                                    <img src="${images[4]}" class="w-full h-full object-cover hover:scale-105 transition duration-500">
                                    ${images.length > 5 ? `
                                    <div class="absolute inset-0 bg-black/40 flex items-center justify-center transition-custom hover:bg-black/50">
                                        <button class="bg-white/90 backdrop-blur text-dark px-4 py-2 rounded-lg font-bold shadow-sm hover:bg-white transition-custom text-sm flex items-center transform hover:scale-105">
                                            <i class="fa-solid fa-images mr-2"></i> Showcase All
                                        </button>
                                    </div>
                                    ` : ''}
                                </div>
                            `;
                            for (let i = 5; i < images.length; i++) {
                                html += `<div class="${mobileImgClass} md:hidden ${i === images.length - 1 ? 'pr-4' : ''}">
                                            <img src="${images[i]}" class="w-full h-full object-cover">
                                         </div>`;
                            }
                        }

                        galleryContainer.innerHTML = html;
                    }

                    // Dynamic Description
                    const descContainer = document.getElementById('facility-description-container');
                    if(descContainer) {
                        if (facility.description && facility.description.trim() !== '') {
                            // If owner provided a custom description, display it. Replace newlines with <br>
                            descContainer.innerHTML = `<p>${facility.description.replace(/\n/g, '<br>')}</p>`;
                        } else {
                            // Fallback to generic description
                            const facilityTypeLabel = facility.type === 'ice' ? 'ice hockey' : 
                                                      facility.type === 'turf' ? 'synthetic turf' : 
                                                      facility.type === 'court' ? 'hardwood court' : facility.type;
                            
                            descContainer.innerHTML = `
                                <p><strong>${facility.name}</strong> is a premier ${facilityTypeLabel} facility located in the heart of ${facility.location.split(',')[0]}. Our state-of-the-art playing surface features excellent lighting and amenities for practices or games.</p>
                                <p>Perfect for team practices, adult leagues, private coaching sessions, or corporate events.</p>
                                <p class="font-medium text-dark mt-4">Included in your rental:</p>
                                <ul class="list-disc pl-5 space-y-1 text-base text-slate-600">
                                    <li>Standard playing surface time</li>
                                    <li>Use of standard equipment (nets/hoops)</li>
                                    <li>Scoreboard access and controller</li>
                                    <li>Dressing rooms and showers</li>
                                </ul>
                            `;
                        }
                    }

                    // Header Section
                    const titleEl = document.querySelector('h1.text-3xl.font-extrabold');
                    if(titleEl) titleEl.textContent = facility.name;
                    titleEl.classList.add('notranslate');
                    
                    const operatorEl = document.getElementById('operator-name');
                    if (operatorEl) {
                        operatorEl.textContent = facility.company_name || facility.host_name || 'GameGroundz Host';
                    }
                    
                    const hostPicEl = document.getElementById('host-profile-picture');
                    if (hostPicEl && facility.host_profile_picture) {
                        hostPicEl.src = facility.host_profile_picture;
                    }
                    
                    const subtitleEl = document.getElementById('header-subtitle');
                    if(subtitleEl) {
                        if (facility.subtitle && facility.subtitle.trim() !== '') {
                            subtitleEl.textContent = facility.subtitle;
                        } else {
                            const subtitleText = facility.type === 'ice' ? 'Professional NHL-sized Ice Rink' :
                                                 facility.type === 'turf' ? 'Premium Synthetic Turf Field' :
                                                 facility.type === 'court' ? 'Professional Hardwood Court' :
                                                 facility.type === 'gym' ? 'Fully Equipped Fitness Center' : 'Premium Sports Facility';
                            subtitleEl.textContent = subtitleText;
                        }
                    }

                    // Dynamic Basics
                    const basicsContainer = document.getElementById('header-basics');
                    if (basicsContainer) {
                        let basicsArr = [];
                        if (facility.size_info) basicsArr.push(`<span>${facility.size_info}</span>`);
                        basicsArr.push(`<span>${facility.environment.charAt(0).toUpperCase() + facility.environment.slice(1)}</span>`);
                        if (facility.capacity > 0) basicsArr.push(`<span>Max ${facility.capacity} players</span>`);
                        if (facility.locker_rooms > 0) basicsArr.push(`<span>${facility.locker_rooms} Locker Rooms</span>`);
                        
                        basicsContainer.innerHTML = basicsArr.join('<span class="text-slate-300">•</span>');
                    }

                    const headerStats = document.querySelector('div.flex.items-center.text-sm.font-medium.text-slate-600');
                    if(headerStats) {
                        headerStats.innerHTML = `
                            <span class="flex items-center"><i class="fa-solid fa-star text-yellow-400 mr-1.5 text-base"></i> ${facility.rating || '4.9'} <span class="text-slate-400 font-normal underline ml-1 cursor-pointer hover:text-dark" onclick="document.getElementById('reviews-section').scrollIntoView({behavior: 'smooth'})">(${facility.reviews_count || 0} reviews)</span></span>
                            <span class="mx-3 text-slate-300">•</span>
                            <span class="flex items-center text-slate-500"><i class="fa-solid fa-medal text-primary mr-1.5"></i> Superhost Facility</span>
                            <span class="mx-3 text-slate-300">•</span>
                            <span class="flex items-center underline cursor-pointer hover:text-dark"><i class="fa-solid fa-location-dot mr-1.5"></i> ${facility.location}</span>
                        `;
                    }

                    // Price Focus & Widget Rating
                    const priceEl = document.querySelector('.sticky.top-28 .text-2xl.font-bold.text-dark');
                    if(priceEl && priceEl.parentElement) {
                        priceEl.parentElement.innerHTML = `<span class="text-2xl font-bold text-dark">From $${hourlyRate}</span><span class="text-slate-500 font-medium"> / hour</span>`;
                    }
                    
                    const widgetRatingEl = document.querySelector('.sticky.top-28 .flex.flex-col.items-end');
                    if (widgetRatingEl) {
                        widgetRatingEl.innerHTML = `
                            <span class="flex items-center font-bold text-sm"><i class="fa-solid fa-star text-yellow-400 text-xs mr-1"></i> ${facility.rating || '4.9'}</span>
                            <span class="text-xs text-slate-400 underline cursor-pointer hover:text-dark" onclick="document.getElementById('reviews-section').scrollIntoView({behavior: 'smooth'})">${facility.reviews_count || 0} reviews</span>
                        `;
                    }

                    // Tags
                    const typeDisplay = facility.type.charAt(0).toUpperCase() + facility.type.slice(1);
                    const envDisplay = facility.environment.charAt(0).toUpperCase() + facility.environment.slice(1);
                    const tagContainer = document.querySelector('.flex.flex-wrap.gap-2.mb-6');
                    if(tagContainer) {
                        tagContainer.innerHTML = `
                            <span class="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold">${typeDisplay}</span>
                            <span class="px-3 py-1.5 bg-slate-100 text-slate-600 rounded-lg text-sm font-semibold">${envDisplay}</span>
                        `;
                    }
                    
                    // Features
                    const featuresContainer = document.getElementById('facility-features-container');
                    if (featuresContainer) {
                        let featuresHtml = '';
                        let parsedFeatures = [];
                        
                        try {
                            if (facility.features) {
                                parsedFeatures = JSON.parse(facility.features);
                            }
                        } catch(e) {}
                        
                        if (parsedFeatures && parsedFeatures.length > 0) {
                            parsedFeatures.forEach(feature => {
                                featuresHtml += `
                                    <div class="flex items-start">
                                        <i class="fa-solid fa-check text-2xl text-primary mt-1 mr-4 w-6 text-center"></i>
                                        <div>
                                            <h3 class="font-bold text-dark mb-1">${feature.title}</h3>
                                            <p class="text-slate-500 text-sm leading-relaxed">${feature.description}</p>
                                        </div>
                                    </div>
                                `;
                            });
                        } else {
                            // Default generic features based on instant book
                            let instantBookHtml = facility.is_instant_book === 1 ? `
                                <div class="flex items-start">
                                    <i class="fa-solid fa-bolt text-2xl text-primary mt-1 mr-4 w-6 text-center"></i>
                                    <div>
                                        <h3 class="font-bold text-dark mb-1">Instant Booking Ready</h3>
                                        <p class="text-slate-500 text-sm leading-relaxed">No waiting for approval. Pick your slot, pay, and your booking is confirmed immediately.</p>
                                    </div>
                                </div>
                            ` : '';
                            
                            featuresHtml = `
                                <div class="flex items-start">
                                    <i class="fa-solid fa-stopwatch text-2xl text-slate-700 mt-1 mr-4 w-6 text-center"></i>
                                    <div>
                                        <h3 class="font-bold text-dark mb-1">Standard Rental Block</h3>
                                        <p class="text-slate-500 text-sm leading-relaxed">Access to the facility for your selected time slots.</p>
                                    </div>
                                </div>
                                ${instantBookHtml}
                            `;
                        }
                        
                        featuresContainer.innerHTML = featuresHtml;
                    }
                    
                    // Standard Amenities
                    const amenitiesContainer = document.getElementById('standard-amenities-container');
                    if (amenitiesContainer) {
                        let amenitiesHtml = '';
                        let parsedAmenities = [];
                        try {
                            if (facility.amenities) {
                                parsedAmenities = JSON.parse(facility.amenities);
                            }
                        } catch(e) {}

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
                            "livebarn": { icon: "fa-video", text: "LiveBarn" }
                        };

                        if (parsedAmenities && parsedAmenities.length > 0) {
                            parsedAmenities.forEach(am => {
                                const meta = amenityMeta[am] || { icon: "fa-check", text: am };
                                amenitiesHtml += `<div class="flex items-center"><i class="fa-solid ${meta.icon} w-8 text-xl text-slate-400"></i> ${meta.text}</div>`;
                            });
                        } else {
                            amenitiesHtml = '<div class="col-span-2 text-slate-400 italic">No standard amenities listed.</div>';
                        }
                        amenitiesContainer.innerHTML = amenitiesHtml;
                    }


                    // Mobile Footer Price
                    const mobilePriceContainer = document.querySelector('.fixed.bottom-0 .text-lg.font-bold.text-dark');
                    if (mobilePriceContainer) {
                        mobilePriceContainer.innerHTML = `From $${hourlyRate} <span class="text-sm font-normal text-slate-500">/ hour</span>`;
                    }

                    // Re-render pricing calculation to use new hourly rate
                    render();

                } catch (error) {
                    console.error("Error fetching facility details:", error);
                    // Could redirect to a 404 or show an error banner
                }
            }


            function toggleDropdown(e) {
                dropdown.classList.toggle('hidden');
                e.stopPropagation();
            }

            trigger.addEventListener('click', toggleDropdown);
            
            // Close dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
                    dropdown.classList.add('hidden');
                }
            });

            window.joinPublicSession = async function(bookingId) {
                const btn = document.getElementById('reserve-btn');
                const mobileBtn = document.getElementById('mobile-reserve-btn');
                const originalText = btn ? btn.innerHTML : '';
                const mobileOriginalText = mobileBtn ? mobileBtn.innerHTML : '';
                
                try {
                    if (btn) {
                        btn.innerHTML = "<i class='fa-solid fa-spinner fa-spin mr-2'></i> Joining...";
                        btn.disabled = true;
                        btn.classList.add('opacity-80', 'cursor-not-allowed');
                    }
                    if (mobileBtn) {
                        mobileBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>";
                        mobileBtn.disabled = true;
                    }

                    const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                    const response = await fetch(`${API_BASE_URL}/api/public_sessions/join`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ booking_id: bookingId }),
                        credentials: 'include'
                    });
                    
                    const data = await response.json();
                    if (!response.ok) {
                        await showAlertModal('Join Error', data.error || 'Failed to join session', 'OK', true);
                        if(btn) {
                            btn.innerHTML = originalText;
                            btn.disabled = false;
                            btn.classList.remove('opacity-80', 'cursor-not-allowed');
                        }
                        if(mobileBtn) {
                            mobileBtn.innerHTML = mobileOriginalText;
                            mobileBtn.disabled = false;
                        }
                        return;
                    }
                    
                    if (data.url) {
                        window.location.href = data.url;
                    } else if (data.redirectUrl) {
                        alert("You've successfully joined the public session!");
                        window.location.href = data.redirectUrl;
                    }
                } catch(e) {
                    console.error("Join error:", e);
                    await showAlertModal('Error', 'An error occurred trying to join. Please try again.', 'OK', true);
                    if(btn) {
                        btn.innerHTML = originalText;
                        btn.disabled = false;
                        btn.classList.remove('opacity-80', 'cursor-not-allowed');
                    }
                    if(mobileBtn) {
                        mobileBtn.innerHTML = mobileOriginalText;
                        mobileBtn.disabled = false;
                    }
                }
            };

            async function initiateCheckout() {
                // Check if user is logged in
                const storedUser = localStorage.getItem('gg_user');
                if (!storedUser) {
                    // Save state and redirect to login
                    sessionStorage.setItem('pending_booking_slots', JSON.stringify(Array.from(selectedSlotIds)));
                    sessionStorage.setItem('pending_booking_date', selectedDateStr);
                    sessionStorage.setItem('auto_reserve', 'true');
                    
                    window.location.href = `index.html?login=true&redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
                    return;
                }

                try {
                    const parsedUser = JSON.parse(storedUser);
                    if (parsedUser.role === 'host') {
                        await showAlertModal('Booking Restricted', 'Hosts are not allowed to book facilities. Please log in as a Player to make a booking.', 'OK', true);
                        return;
                    }
                } catch (e) {}

                if (selectedSlotIds.size === 0) return;

                // Hijack for public session join
                const isPublicSessionCheckout = selectedSlotIds.size === 1 && window.publicSessionSlots && window.publicSessionSlots.has(Array.from(selectedSlotIds)[0]);
                if (isPublicSessionCheckout) {
                    const bookingId = window.publicSessionSlots.get(Array.from(selectedSlotIds)[0]).id;
                    window.joinPublicSession(bookingId);
                    return;
                }

                if (selectedSlotIds.size < 2) {
                    await showAlertModal('Minimum Duration', 'Please select at least two time slots (1 hour minimum).', 'OK', true);
                    return;
                }
                
                // Check for slots within 48 hours
                let hasSlotUnder48h = false;
                const now = new Date();
                const fortyEightHoursInMs = 48 * 60 * 60 * 1000;

                for (const slotKey of selectedSlotIds) {
                    const [dStr, tId] = slotKey.split('|');
                    const [h, m] = tId.split(':');
                    const slotDate = new Date(`${dStr}T00:00:00`);
                    slotDate.setHours(parseInt(h, 10), parseInt(m, 10), 0, 0);

                    const timeDiff = slotDate.getTime() - now.getTime();
                    if (timeDiff > 0 && timeDiff < fortyEightHoursInMs) {
                        hasSlotUnder48h = true;
                        break;
                    }
                }

                if (hasSlotUnder48h) {
                    if (typeof window.showConfirmModal === 'function') {
                        const confirmed = await window.showConfirmModal(
                            "Short Notice Booking", 
                            "You are booking a slot less than 48 hours away. Please note that a refund will not be possible for this transaction if you proceed due to the facility's short notice cancellation policy.", 
                            "I Understand, Proceed", 
                            "Cancel", 
                            true
                        );
                        if (!confirmed) {
                            return; // User cancelled
                        }
                    } else {
                        // Fallback if modal is not available for some reason
                        const confirmed = confirm("You are booking a slot less than 48 hours away. Please note that a refund will not be possible for this transaction if you proceed.\n\nDo you want to proceed?");
                        if (!confirmed) {
                            return;
                        }
                    }
                }
                
                const originalText = reserveBtn.innerHTML;
                reserveBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin mr-2'></i> Redirecting to Stripe...";
                reserveBtn.disabled = true;
                reserveBtn.classList.add('opacity-80', 'cursor-not-allowed');

                if (mobileReserveBtn) {
                    mobileReserveBtn.innerHTML = "<i class='fa-solid fa-spinner fa-spin'></i>";
                    mobileReserveBtn.disabled = true;
                }

                try {
                     // Group array into multi-day format
                     const multiDayPayload = {};
                     Array.from(selectedSlotIds).forEach(slotKey => {
                         const [dStr, tId] = slotKey.split('|');
                         if(!multiDayPayload[dStr]) multiDayPayload[dStr] = [];
                         multiDayPayload[dStr].push(tId);
                     });

                     const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                     const bookingResponse = await fetch(`${API_BASE_URL}/api/create-checkout-session`, {
                        method: 'POST',
                        credentials: 'include',
                        headers: {
                            'Content-Type': 'application/json'
                        },
                        body: JSON.stringify({
                            facility_id: currentFacilityId || 1,
                            multi_day_slots: multiDayPayload,
                            // Send booking_date for single-day fallback compatibility if needed anywhere
                            booking_date: selectedDateStr,
                            time_slots: []
                        })
                     });

                     if(!bookingResponse.ok) {
                         if (bookingResponse.status === 401) {
                             localStorage.removeItem('gg_user');
                             window.location.href = `index.html?login=true&redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`;
                             return;
                         }
                         let errMsg = "Failed to initialize checkout";
                         try {
                             const errData = await bookingResponse.json();
                             if(errData.error) errMsg = errData.error;
                         } catch(e) {}
                         throw new Error(errMsg);
                     }
                     
                     const data = await bookingResponse.json();
                     if (data.url) {
                         window.location.href = data.url; // Redirect to Stripe
                     } else {
                         throw new Error("No Stripe checkout URL returned");
                     }

                } catch (error) {
                    console.error("Booking Error", error);
                    await showAlertModal('Error', 'There was an error processing your booking: ' + error.message, 'OK', true);
                    reserveBtn.innerHTML = originalText;
                    reserveBtn.disabled = false;
                    reserveBtn.classList.remove('opacity-80', 'cursor-not-allowed');
                    if (mobileReserveBtn) {
                        mobileReserveBtn.innerHTML = "Reserve";
                        mobileReserveBtn.disabled = false;
                    }
                }
            }

            // Handle reserve button clicks
            reserveBtn.addEventListener('click', initiateCheckout);
            // mobileReserveBtn handles opening the booking sheet instead (bound at bottom of document)

            // Handle browser back button (bfcache) restoring the disabled button state
            window.addEventListener('pageshow', (event) => {
                if (event.persisted) {
                    if (reserveBtn) {
                        reserveBtn.innerHTML = "Reserve Now";
                        reserveBtn.disabled = false;
                        reserveBtn.classList.remove('opacity-80', 'cursor-not-allowed');
                    }
                    if (mobileReserveBtn) {
                        mobileReserveBtn.innerHTML = "Reserve";
                        mobileReserveBtn.disabled = false;
                    }
                }
            });
            function render() {
                // Determine weekend status based on selectedDateStr
                const dateObj = new Date(selectedDateStr + 'T12:00:00');
                const dayOfWeek = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                const isWeekend = dayOfWeek === 'Saturday' || dayOfWeek === 'Sunday';

                // Regenerate availableSlots based on weekend vs weekday
                let opHours = { open: facilityOperatingHours.open, close: facilityOperatingHours.close };
                if (isWeekend && facilityOperatingHours.weekend_open) {
                     opHours.open = facilityOperatingHours.weekend_open;
                     opHours.close = facilityOperatingHours.weekend_close || facilityOperatingHours.close;
                }
                availableSlots = generateDailySlots(opHours);

                // Update selected slots header date
                const headerEl = document.getElementById('selected-slots-header');
                if (headerEl) {
                    const d = new Date(selectedDateStr + 'T00:00:00'); 
                    if (!isNaN(d.getTime())) {
                        const month = d.toLocaleString('en-US', { month: 'short' });
                        headerEl.textContent = `Selected Slots (${month} ${d.getDate()})`;
                    }
                }

                const discounts = window.facilityDiscounts || [];
                const bookingDate = new Date(selectedDateStr + 'T00:00:00');
                const now = new Date();

                const validDiscounts = discounts.filter(d => {
                    if (!d.is_active) return false;
                    
                    // Fix timezone mismatch: extract just the YYYY-MM-DD part before parsing
                    if (d.start_date) {
                        const sDate = d.start_date.split('T')[0];
                        if (new Date(sDate + 'T00:00:00') > bookingDate) return false;
                    }
                    if (d.end_date) {
                        const eDate = d.end_date.split('T')[0];
                        if (new Date(eDate + 'T23:59:59') < bookingDate) return false;
                    }
                    
                    if (d.recurring_day !== null && d.recurring_day !== undefined && d.recurring_day !== '') {
                        const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        if (daysMap[parseInt(d.recurring_day, 10)] !== dayOfWeek) return false;
                    }

                    return true;
                });

                function getBestDiscountForSlot(slotId, validDiscounts) {
                    let bestD = null;
                    let maxVal = 0;
                    validDiscounts.forEach(d => {
                        if (d.is_last_minute) {
                            const [slotH, slotM] = slotId.split(':');
                            const exactSlotTime = new Date(selectedDateStr + 'T00:00:00');
                            exactSlotTime.setHours(parseInt(slotH, 10), parseInt(slotM, 10));
                            
                            const msDiff = exactSlotTime.getTime() - now.getTime();
                            if (msDiff > 86400000 || msDiff < 0) {
                                return; // Not within precisely 24 hours, or in the past
                            }
                        }

                        if (d.start_time && d.end_time) {
                            if (slotId < d.start_time || slotId >= d.end_time) return;
                        }
                        let valEquivalent = d.discount_type === 'percentage' ? d.value : (d.value / hourlyRate * 100); 
                        if (valEquivalent > maxVal) {
                            maxVal = valEquivalent;
                            bestD = d;
                        }
                    });
                    return bestD;
                }

                // Update dropdown list
                slotsList.innerHTML = '';
                
                const currentHour = now.getHours();
                const currentMinute = now.getMinutes();
                const currentTime24 = `${currentHour.toString().padStart(2, '0')}:${currentMinute.toString().padStart(2, '0')}`;
                
                const mmYear = now.getFullYear();
                const mmMonth = String(now.getMonth() + 1).padStart(2, '0');
                const mmDay = String(now.getDate()).padStart(2, '0');
                const todayStr = `${mmYear}-${mmMonth}-${mmDay}`;
                const isToday = selectedDateStr === todayStr;

                availableSlots.forEach(slot => {
                    const isPast = isToday && slot.id < currentTime24;
                    const slotKey = `${selectedDateStr}|${slot.id}`;
                    const isBooked = bookedSlotIds.has(slotKey);
                    const pubSess = window.publicSessionSlots ? window.publicSessionSlots.get(slotKey) : null;
                    const isUnavailable = isBooked || isPast;
                    
                    // Always unselect past or newly booked slots
                    if ((isPast || isBooked) && selectedSlotIds.has(slotKey)) {
                        selectedSlotIds.delete(slotKey);
                    }
                    
                    const isSelected = selectedSlotIds.has(slotKey);
                    const div = document.createElement('div');
                    
                    if (pubSess) {
                        const priceText = pubSess.participant_price > 0 ? `$${pubSess.participant_price.toFixed(2)}/pp` : `Free`;
                        div.className = `px-3 py-2.5 text-sm font-semibold rounded-lg cursor-pointer flex justify-between items-center mb-1 transition-custom border ${isSelected ? 'bg-indigo-600 text-white border-indigo-700' : 'bg-indigo-50 text-indigo-700 border-indigo-200 hover:bg-indigo-100 hover:border-indigo-300'}`;
                        div.innerHTML = `
                            <div class="flex flex-col">
                                <span class="flex items-center">${slot.time} <span class="ml-2 text-[10px] uppercase font-bold px-1.5 py-0.5 rounded-md ${isSelected ? 'bg-indigo-500 text-white border-indigo-400' : 'bg-white text-indigo-600 border-indigo-100'} border">Public Session</span></span>
                                <span class="text-xs font-medium ${isSelected ? 'text-indigo-200' : 'text-indigo-500'} mt-0.5">${pubSess.manual_notes || 'Open Session'} • ${pubSess.joined_count}/${pubSess.capacity} joined • ${priceText}</span>
                            </div>
                            ${isSelected ? '<i class="fa-solid fa-check text-sm"></i>' : ''}
                        `;
                        div.onclick = (e) => {
                            e.stopPropagation();
                            const hadOthers = Array.from(selectedSlotIds).some(s => window.publicSessionSlots && !window.publicSessionSlots.has(s) || s !== slotKey);
                            if (!isSelected && hadOthers) {
                                // Clear everything else and just select this one. Join is 1-to-1 event.
                                selectedSlotIds.clear();
                                selectedSlotIds.add(slotKey);
                            } else {
                                toggleTimeSlot(selectedDateStr, slot);
                            }
                            render();
                            renderDailyCalendar();
                            renderWeeklyCalendar();
                        };
                    } else {
                        const slotDiscount = getBestDiscountForSlot(slot.id, validDiscounts);
                        let discountBadge = '';
                        if (slotDiscount) {
                            const amountText = slotDiscount.discount_type === 'percentage' ? `${slotDiscount.value}%` : `$${slotDiscount.value}`;
                            discountBadge = `<span class="ml-2 text-[10px] font-bold text-red-600 bg-red-100 px-1.5 py-0.5 rounded-md flex items-center shadow-sm whitespace-nowrap"><i class="fa-solid fa-fire text-red-500 mr-1 text-[10px]"></i> ${amountText} OFF</span>`;
                        }

                        const hourlyPriceForSlot = getPriceForTimeSlot(slot.time, hourlyRate, pricingRules, isWeekend);
                        const formattedPrice = hourlyPriceForSlot % 1 === 0 ? hourlyPriceForSlot : hourlyPriceForSlot.toFixed(2);
                        const priceBadge = `<span class="ml-2 text-[11px] font-medium text-slate-500 bg-slate-200/60 px-1.5 py-0.5 rounded-md">$${formattedPrice}/hr</span>`;
                        
                        if (isUnavailable) {
                             div.className = `px-3 py-2.5 text-sm font-semibold rounded-lg flex justify-between items-center mb-1 text-slate-400 bg-slate-100 cursor-not-allowed opacity-50 border border-transparent`;
                             const reason = isPast ? "Passed" : "Unavailable";
                             div.innerHTML = `<span class="flex items-center">${slot.time} ${priceBadge} ${discountBadge} <span class="text-[10px] ml-2 uppercase bg-slate-200 text-slate-500 px-1.5 py-0.5 rounded-full whitespace-nowrap">${reason}</span></span>`;
                        } else {
                             div.className = `px-3 py-2.5 text-sm font-semibold rounded-lg cursor-pointer flex justify-between items-center mb-1 transition-custom ${isSelected ? 'bg-primary/10 text-primary border border-primary/20' : 'hover:bg-slate-100 text-slate-700 border border-transparent'}`;
                             div.innerHTML = `
                                <span class="flex items-center">${slot.time} ${priceBadge} ${discountBadge}</span>
                                ${isSelected ? '<i class="fa-solid fa-check text-sm"></i>' : ''}
                            `;
                            div.onclick = (e) => {
                                e.stopPropagation();
                                
                                // Prevent mixing private standard blocks with public sessions
                                const currentHasPub = Array.from(selectedSlotIds).some(s => window.publicSessionSlots && window.publicSessionSlots.has(s));
                                if (!isSelected && currentHasPub) {
                                    selectedSlotIds.clear();
                                }
                                
                                toggleTimeSlot(selectedDateStr, slot);
                                render();
                                renderDailyCalendar();
                                renderWeeklyCalendar();
                            };
                        }
                    }
                    slotsList.appendChild(div);
                });

                // Update summary text
                const count = selectedSlotIds.size;
                slotsSummary.textContent = count === 0 ? "Select Times" : `${count} Slot${count > 1 ? 's' : ''} Selected`;

                // Update chips (Group by Date)
                selectedContainer.innerHTML = '';
                if (count === 0) {
                    selectedContainer.innerHTML = '<span class="text-sm text-slate-400 italic">No slots selected</span>';
                } else {
                    const groupedSlots = {};
                    selectedSlotIds.forEach(slotKey => {
                        const [dStr, tId] = slotKey.split('|');
                        if (!groupedSlots[dStr]) groupedSlots[dStr] = [];
                        groupedSlots[dStr].push(tId);
                    });

                    Object.keys(groupedSlots).sort().forEach(dStr => {
                        const dObj = new Date(dStr + 'T00:00:00');
                        const dayLabel = dObj.toLocaleString('en-US', { month: 'short', day: 'numeric' });
                        
                        const groupDiv = document.createElement('div');
                        groupDiv.className = 'w-full mb-2 last:mb-0';
                        groupDiv.innerHTML = `<div class="text-xs font-bold text-slate-500 mb-1 pl-1 border-l-2 border-primary">${dayLabel}</div><div class="flex flex-wrap gap-2" id="chips-${dStr}"></div>`;
                        selectedContainer.appendChild(groupDiv);

                        const chipsDiv = groupDiv.querySelector(`#chips-${dStr}`);
                        const sortedTimes = groupedSlots[dStr].sort();
                        
                        sortedTimes.forEach(tId => {
                            let ampm = 'AM';
                            let [h, m] = tId.split(':');
                            h = parseInt(h);
                            if (h >= 12) { ampm = 'PM'; if (h > 12) h -= 12; }
                            if (h === 0) h = 12;
                            const tLabel = `${h}:${m} ${ampm}`;

                            const span = document.createElement('span');
                            span.className = 'px-3 py-1.5 bg-primary/10 text-primary border border-primary/20 rounded-md text-sm font-semibold flex items-center shadow-sm';
                            span.innerHTML = `${tLabel} <i class="fa-solid fa-xmark ml-2 text-xs opacity-60 hover:opacity-100 cursor-pointer"></i>`;
                            span.querySelector('i').onclick = (e) => {
                                e.stopPropagation();
                                selectedSlotIds.delete(`${dStr}|${tId}`);
                                render();
                            };
                            chipsDiv.appendChild(span);
                        });
                    });
                }

                // Calculate pricing
                const isPublicSessionCheckout = count === 1 && window.publicSessionSlots && window.publicSessionSlots.has(Array.from(selectedSlotIds)[0]);
                
                if (isPublicSessionCheckout) {
                    const pubSess = window.publicSessionSlots.get(Array.from(selectedSlotIds)[0]);
                    const price = parseFloat(pubSess.participant_price || 0);
                    currentTotal = price;
                    
                    priceCalcEl.innerHTML = `<span class="flex items-center text-indigo-700 bg-indigo-50 px-2 pl-1 py-0.5 rounded border border-indigo-100"><i class="fa-solid fa-users text-xs mr-2 ml-1 text-indigo-500"></i> Public Session Admission</span>`;
                    subtotalEl.textContent = `$${price.toFixed(2)}`;
                    taxEl.textContent = `$0.00`;
                    totalEl.textContent = `$${price.toFixed(2)}`;
                    
                    const discountDiv = document.getElementById('discount-amount');
                    if (discountDiv) discountDiv.remove();
                    subtotalEl.classList.remove('line-through', 'text-slate-400');
                    
                    const processingFeeRow = document.getElementById('processing-fee-row');
                    if (processingFeeRow) {
                        processingFeeRow.style.display = 'none';
                        processingFeeRow.classList.add('hidden');
                    }
                    
                    if (reserveBtn) reserveBtn.textContent = 'Join Session';
                    if (mobileReserveBtn) mobileReserveBtn.textContent = 'Join Session';
                } else {
                    if (reserveBtn) reserveBtn.textContent = 'Reserve Now';
                    if (mobileReserveBtn) mobileReserveBtn.textContent = 'Reserve Now';
                    
                    const hours = count / 2; // 1 slot = 0.5 hour
                    if (hours > 0) {
                        let subtotal = 0;
                        let bestDiscountValue = 0;

                    // Group slots by date first to apply discounts accurately day-by-day or globally
                    const groupedForPricing = {};
                    selectedSlotIds.forEach(slotKey => {
                        const [dStr, tId] = slotKey.split('|');
                        if(!groupedForPricing[dStr]) groupedForPricing[dStr] = [];
                        groupedForPricing[dStr].push(tId);
                    });

                    for (const [dStr, tIds] of Object.entries(groupedForPricing)) {
                        const dateObj = new Date(dStr + 'T12:00:00');
                        const dayOfWeekGroup = dateObj.toLocaleDateString('en-US', { weekday: 'long' });
                        const isWeekendGroup = dayOfWeekGroup === 'Saturday' || dayOfWeekGroup === 'Sunday';
                        
                        let groupSubtotal = 0;
                        tIds.forEach(tId => {
                            // We need formatted AM/PM time for getPriceForTimeSlot
                            let ampm = 'AM';
                            let h = parseInt(tId.split(':')[0]);
                            const m = tId.split(':')[1];
                            if(h >= 12) { ampm = 'PM'; if(h > 12) h -= 12; }
                            if(h === 0) h = 12;
                            const formattedTime = `${h}:${m} ${ampm}`;

                            groupSubtotal += getPriceForTimeSlot(formattedTime, hourlyRate, pricingRules, isWeekendGroup) / 2;
                        });
                        subtotal += groupSubtotal;

                        // Calculate discount for this group (date) exactly as the backend does
                        let bestGroupDiscount = 0;
                        discounts.forEach(d => {
                            if (!d.is_active) return;
                            const dStart = d.start_date ? new Date(d.start_date.split('T')[0] + 'T00:00:00') : null;
                            const dEnd = d.end_date ? new Date(d.end_date.split('T')[0] + 'T23:59:59') : null;
                            const pDate = new Date(dStr + 'T00:00:00');
                            
                            if (dStart && pDate < dStart) return;
                            if (dEnd && pDate > dEnd) return;
                            if (d.recurring_day !== null && d.recurring_day !== undefined && d.recurring_day !== '') {
                                const daysMap = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                                if (daysMap[parseInt(d.recurring_day, 10)] !== dayOfWeekGroup) return;
                            }

                            if (d.is_last_minute) {
                                // Simplified for frontend (accurate calc done on backend anyway)
                            }
                            
                            let applicableSlotsSubtotal = 0;
                            tIds.forEach(tId => {
                                let applies = true;
                                if (d.start_time && d.end_time) {
                                    if (tId < d.start_time || tId >= d.end_time) applies = false;
                                }
                                if (applies) {
                                    let ampm = 'AM', h = parseInt(tId.split(':')[0]), m = tId.split(':')[1];
                                    if(h >= 12) { ampm = 'PM'; if(h>12) h-=12; }
                                    if(h===0) h=12;
                                    applicableSlotsSubtotal += getPriceForTimeSlot(`${h}:${m} ${ampm}`, hourlyRate, pricingRules, isWeekendGroup) / 2;
                                }
                            });

                            if (applicableSlotsSubtotal > 0) {
                                let discountVal = 0;
                                if (d.discount_type === 'percentage') {
                                    discountVal = applicableSlotsSubtotal * (d.value / 100);
                                } else if (d.discount_type === 'fixed_amount') {
                                    discountVal = d.value;
                                }
                                if (discountVal > bestGroupDiscount) bestGroupDiscount = discountVal;
                            }
                        });
                        bestDiscountValue += bestGroupDiscount;
                    }
                    



                    const discountedSubtotal = Math.max(0, subtotal - bestDiscountValue);

                    const tax = discountedSubtotal * taxRate;
                    currentTotal = discountedSubtotal + processingFee + tax; // update global total

                    if (hours === 1) {
                        priceCalcEl.innerHTML = `$${subtotal.toFixed(0)} x 1 hour`;
                    } else {
                        priceCalcEl.innerHTML = `Multiple slots (avg $${(subtotal/hours).toFixed(0)}/hr)`;
                    }

                    // Insert Discount UI element into the list if it exists
                    const discountElId = 'discount-amount';
                    let discountDiv = document.getElementById(discountElId);
                    if (bestDiscountValue > 0) {
                        if(!discountDiv) {
                            discountDiv = document.createElement('div');
                            discountDiv.id = discountElId;
                            discountDiv.className = 'flex justify-between text-base text-green-600 font-bold mb-3';
                            // insert before processing fee
                            priceCalcEl.parentElement.parentElement.insertBefore(discountDiv, priceCalcEl.parentElement.nextSibling);
                        }
                        discountDiv.innerHTML = `<span>Discount applied</span><span>-$${bestDiscountValue.toFixed(2)}</span>`;
                        subtotalEl.classList.add('line-through', 'text-slate-400');
                    } else {
                        if(discountDiv) discountDiv.remove();
                        subtotalEl.classList.remove('line-through', 'text-slate-400');
                    }
                    subtotalEl.textContent = `$${subtotal.toFixed(2)}`;
                    
                    const processingFeeRow = document.getElementById('processing-fee-row');
                    const processingFeeAmountEl = document.getElementById('processing-fee-amount');
                    if (processingFee > 0) {
                        if (processingFeeRow) {
                            processingFeeRow.style.display = '';
                            processingFeeRow.classList.remove('hidden');
                        }
                        if (processingFeeAmountEl) processingFeeAmountEl.textContent = `$${processingFee.toFixed(2)}`;
                    } else {
                        if (processingFeeRow) {
                            processingFeeRow.style.display = 'none';
                            processingFeeRow.classList.add('hidden');
                        }
                    }
                    
                    taxEl.textContent = `$${tax.toFixed(2)}`;
                    totalEl.textContent = `$${currentTotal.toFixed(2)}`;
                } else {
                    currentTotal = 0;
                    priceCalcEl.textContent = `$${hourlyRate} x 0 hours`;
                    subtotalEl.textContent = `$0.00`;

                    const discountDiv = document.getElementById('discount-amount');
                    if (discountDiv) discountDiv.remove();
                    subtotalEl.classList.remove('line-through', 'text-slate-400');
                    
                    const processingFeeRow = document.getElementById('processing-fee-row');
                    if (processingFeeRow) {
                        if (processingFee === 0) {
                            processingFeeRow.style.display = 'none';
                            processingFeeRow.classList.add('hidden');
                        } else {
                            processingFeeRow.style.display = '';
                            processingFeeRow.classList.remove('hidden');
                            const amtEl = document.getElementById('processing-fee-amount');
                            if (amtEl) amtEl.textContent = `$${processingFee.toFixed(2)}`;
                        }
                    }
                    
                    taxEl.textContent = `$0.00`;
                    totalEl.textContent = `$0.00`;
                } // End of private session calc block
            } // End of render function

            // --- CALENDAR LOGIC ---
            const today = new Date();
            let currentDate = new Date(today.getFullYear(), today.getMonth(), 1); 
            
            const calYear = today.getFullYear();
            const calMonth = String(today.getMonth() + 1).padStart(2, '0');
            const calDay = String(today.getDate()).padStart(2, '0');
            
            let selectedDateStr = `${calYear}-${calMonth}-${calDay}`; 
            const bookingDateInput = document.getElementById('booking-date');

            // Restore pending state if any (e.g. after login redirect)
            const pendingDate = sessionStorage.getItem('pending_booking_date');
            if (pendingDate) {
                selectedDateStr = pendingDate;
                const pd = new Date(selectedDateStr + 'T00:00:00');
                if (!isNaN(pd.getTime())) {
                    currentDate = new Date(pd.getFullYear(), pd.getMonth(), 1);
                }
                sessionStorage.removeItem('pending_booking_date');
            }

            const pendingSlots = sessionStorage.getItem('pending_booking_slots');
            if (pendingSlots) {
                try {
                    const parsedSlots = JSON.parse(pendingSlots);
                    if (Array.isArray(parsedSlots)) {
                        parsedSlots.forEach(id => selectedSlotIds.add(String(id)));
                    }
                } catch(e) {}
                sessionStorage.removeItem('pending_booking_slots');
            }

            
            // Sync initial state if bookingDateInput exists
            if (bookingDateInput) {
                // Remove hardcoded HTML value and set to today
                bookingDateInput.value = selectedDateStr;
            }
            
            const calendarGrid = document.getElementById('calendar-grid');
            const monthDisplay = document.getElementById('current-period-display');
            const prevMonthBtn = document.getElementById('prev-month-btn');
            const nextMonthBtn = document.getElementById('next-month-btn');

            const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
            
            const dayNamesHTML = [
                '<span class="lang-en-only">Sun</span><span class="lang-fr-only">DIM</span>',
                '<span class="lang-en-only">Mon</span><span class="lang-fr-only">LUN</span>',
                '<span class="lang-en-only">Tue</span><span class="lang-fr-only">MAR</span>',
                '<span class="lang-en-only">Wed</span><span class="lang-fr-only">MER</span>',
                '<span class="lang-en-only">Thu</span><span class="lang-fr-only">JEU</span>',
                '<span class="lang-en-only">Fri</span><span class="lang-fr-only">VEN</span>',
                '<span class="lang-en-only">Sat</span><span class="lang-fr-only">SAM</span>'
            ];

            function toggleTimeSlot(dateStr, slotObj) {
                const slotKey = `${dateStr}|${slotObj.id}`;
                const isSelected = selectedSlotIds.has(slotKey);
                
                if (isSelected) {
                    selectedSlotIds.delete(slotKey);
                } else {
                    selectedSlotIds.add(slotKey);
                    
                    let daySlotsCount = 0;
                    selectedSlotIds.forEach(k => { if(k.startsWith(dateStr)) daySlotsCount++; });
                    
                    if (daySlotsCount === 1) {
                        let opHours = { open: facilityOperatingHours.open || "06:00", close: facilityOperatingHours.close || "23:00" };
                        let slots = generateDailySlots(opHours);
                        const currentIndex = slots.findIndex(s => s.id === slotObj.id);
                        if (currentIndex !== -1 && currentIndex + 1 < slots.length) {
                            const nextSlot = slots[currentIndex + 1];
                            if (!bookedSlotIds.has(`${dateStr}|${nextSlot.id}`)) {
                                selectedSlotIds.add(`${dateStr}|${nextSlot.id}`);
                            }
                        }
                    }
                }
            }

            function renderCalendar() {
                if (!calendarGrid || !monthDisplay) return;
                calendarGrid.innerHTML = '';
                
                monthDisplay.textContent = `${monthNames[currentDate.getMonth()]} ${currentDate.getFullYear()}`;
                
                // Add Headers
                dayNamesHTML.forEach(dayHtml => {
                    const header = document.createElement('div');
                    header.className = "text-xs font-semibold text-slate-400 uppercase py-2 notranslate";
                    header.innerHTML = dayHtml;
                    calendarGrid.appendChild(header);
                });

                const firstDay = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1).getDay();
                const daysInMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0).getDate();

                // Add empty tiles for days before the 1st
                for (let i = 0; i < firstDay; i++) {
                    const emptyTile = document.createElement('div');
                    calendarGrid.appendChild(emptyTile);
                }

                // Add day tiles
                const maxBookingDays = (typeof facility !== 'undefined' && facility.advance_booking_days) ? parseInt(facility.advance_booking_days, 10) : 180;
                const maxDate = new Date();
                maxDate.setHours(0,0,0,0);
                maxDate.setDate(maxDate.getDate() + maxBookingDays);

                const todayForCal = new Date();
                todayForCal.setHours(0,0,0,0);

                // We'll mock out some days as booked (e.g. 4th) or past.
                for (let i = 1; i <= daysInMonth; i++) {
                    const dayTile = document.createElement('div');
                    
                    const m = (currentDate.getMonth() + 1).toString().padStart(2, '0');
                    const d = i.toString().padStart(2, '0');
                    const dateStr = `${currentDate.getFullYear()}-${m}-${d}`;

                    let status = "available";

                    const tileDate = new Date(`${dateStr}T00:00:00`);
                    if (tileDate < todayForCal || tileDate > maxDate) {
                        status = "past";
                    }

                    if (i < 4 && currentDate.getMonth() === 10 && currentDate.getFullYear() === 2026) status = "past";
                    if (i === 4 && currentDate.getMonth() === 10 && currentDate.getFullYear() === 2026) status = "booked";
                    
                    if (status !== "past" && status !== "booked" && dateStr === selectedDateStr) {
                        status = "selected";
                    }

                    if (status === "past") {
                        dayTile.className = "aspect-square flex flex-col items-center justify-center rounded-xl text-slate-300 font-medium";
                        dayTile.innerHTML = `<span>${i}</span>`;
                    } else if (status === "booked") {
                        dayTile.className = "aspect-square flex flex-col items-center justify-center rounded-xl bg-red-50 text-slate-400 font-medium cursor-not-allowed border border-red-100/50 relative overflow-hidden group";
                        dayTile.innerHTML = `<span class="z-10 relative">${i}</span><div class="w-full h-1 bg-red-200 absolute bottom-0 rounded-b-xl"></div>`;
                    } else if (status === "selected") {
                        dayTile.className = "aspect-square flex flex-col items-center justify-center rounded-xl bg-primary text-white font-bold border-2 border-primary shadow-glow cursor-pointer transition-custom";
                        dayTile.innerHTML = `<span class="z-10 relative">${i}</span>`;
                        // Can still click to unselect or just keep it selected
                    } else {
                        // available
                        dayTile.className = "aspect-square flex flex-col items-center justify-center rounded-xl bg-slate-50 text-dark font-medium border border-slate-200 hover:border-primary hover:text-primary cursor-pointer transition-custom shadow-sm";
                        dayTile.innerHTML = `<span class="z-10 relative">${i}</span>`;
                        
                        dayTile.onclick = async () => {
                            selectedDateStr = dateStr;
                            if (bookingDateInput) {
                                bookingDateInput.value = dateStr;
                            }
                            // Do NOT clear selected slots to preserve multi-day selection
                            
                            // Highlight time slots as if they reloaded (visual cue)
                            const slotsSummary = document.getElementById('slots-summary');
                            if (slotsSummary) slotsSummary.textContent = "Loading slots...";
                            
                            bookedSlotIds = await fetchBookedSlots();
                            if (slotsSummary) slotsSummary.textContent = "Select Times";
                            render(); // update widget pricing
                            renderCalendar(); // redraw monthly calendar blocks
                        };
                    }

                    calendarGrid.appendChild(dayTile);
                }
            }

            let currentView = 'monthly'; // 'monthly', 'weekly', 'daily'
            
            function updatePeriodDisplay() {
                if (currentView === 'monthly') {
                    renderCalendar();
                } else if (currentView === 'weekly') {
                    renderWeeklyCalendar();
                } else if (currentView === 'daily') {
                    renderDailyCalendar();
                }
            }

            function renderWeeklyCalendar() {
                const weeklyGrid = document.getElementById('weekly-grid');
                const periodDisplay = document.getElementById('current-period-display');
                if (!weeklyGrid || !periodDisplay) return;
                weeklyGrid.innerHTML = '';
                
                const selectedD = new Date(selectedDateStr + 'T12:00:00');
                const startOfWeek = new Date(selectedD);
                startOfWeek.setDate(selectedD.getDate() - selectedD.getDay());
                
                const endOfWeek = new Date(startOfWeek);
                endOfWeek.setDate(startOfWeek.getDate() + 6);
                periodDisplay.textContent = `${monthNames[startOfWeek.getMonth()]} ${startOfWeek.getDate()} - ${monthNames[endOfWeek.getMonth()]} ${endOfWeek.getDate()}, ${startOfWeek.getFullYear()}`;

                let opHours = { open: facilityOperatingHours.open || "06:00", close: facilityOperatingHours.close || "23:00" };
                let slots = generateDailySlots(opHours);

                const timeCol = document.createElement('div');
                timeCol.className = "flex flex-col flex-shrink-0 w-16 mr-2 mt-[1px]";

                const emptyHeader = document.createElement('div');
                emptyHeader.className = "py-2 text-[11px] font-bold uppercase tracking-wider border-b border-transparent opacity-0 text-center";
                emptyHeader.innerHTML = `<div>W</div><div class="text-base sm:text-lg mt-0.5">00</div>`;
                timeCol.appendChild(emptyHeader);

                const timeSlotsWrapper = document.createElement('div');
                timeSlotsWrapper.className = "flex-1 relative pt-4";

                slots.forEach(s => {
                    const cellWrap = document.createElement('div');
                    cellWrap.className = "h-10 relative flex items-start justify-end pr-2 border-r border-slate-100/50";
                    if (s.id.endsWith(':00')) {
                        const label = document.createElement('div');
                        label.className = "text-[10px] font-semibold text-slate-400 absolute -top-2 right-1 lg:right-2 bg-white px-1 leading-none";
                        label.textContent = s.time.split(' - ')[0];
                        cellWrap.appendChild(label);
                    }
                    timeSlotsWrapper.appendChild(cellWrap);
                });
                
                timeCol.appendChild(timeSlotsWrapper);
                weeklyGrid.appendChild(timeCol);

                const daysWrapper = document.createElement('div');
                daysWrapper.className = "flex flex-1 rounded-xl overflow-hidden shadow-sm border border-slate-100";
                
                const todayForCal = new Date(); todayForCal.setHours(0,0,0,0);
                const td = new Date();
                const currentTime24 = `${td.getHours().toString().padStart(2, '0')}:${td.getMinutes().toString().padStart(2, '0')}`;
                const todayStr = `${td.getFullYear()}-${String(td.getMonth() + 1).padStart(2, '0')}-${String(td.getDate()).padStart(2, '0')}`;

                for (let i = 0; i < 7; i++) {
                    const dayDate = new Date(startOfWeek);
                    dayDate.setDate(dayDate.getDate() + i);
                    const y = dayDate.getFullYear(), m = String(dayDate.getMonth() + 1).padStart(2, '0'), d = String(dayDate.getDate()).padStart(2, '0');
                    const dateStr = `${y}-${m}-${d}`;
                    
                    const col = document.createElement('div');
                    col.className = "flex-1 flex flex-col border-r border-slate-100 last:border-r-0 bg-white";
                    
                    const header = document.createElement('div');
                    header.className = `py-2 text-center text-[11px] font-bold uppercase tracking-wider border-b border-slate-100 notranslate ${dateStr === todayStr ? 'bg-primary/10 text-primary' : 'bg-slate-50 text-slate-500'}`;
                    header.innerHTML = `<div>${dayNamesHTML[i]}</div><div class="text-base sm:text-lg mt-0.5">${d}</div>`;
                    col.appendChild(header);
                    
                    const slotsWrapper = document.createElement('div');
                    slotsWrapper.className = "flex-1 relative pt-4";

                    const isPastDay = dayDate < todayForCal;
                    
                    slots.forEach(slot => {
                        const isToday = dateStr === todayStr;
                        const isPast = isPastDay || (isToday && slot.id < currentTime24);
                        const slotKey = `${dateStr}|${slot.id}`;
                        const isBooked = bookedSlotIds.has(slotKey);
                        const isSelected = selectedSlotIds.has(slotKey);
                        
                        const pubSess = window.publicSessionSlots ? window.publicSessionSlots.get(slotKey) : null;
                        
                        const cell = document.createElement('div');
                        cell.className = "h-10 border-b border-slate-50 px-0.5 sm:px-1 py-1 group transition-custom cursor-pointer relative";
                        
                        const inner = document.createElement('div');
                        inner.className = "w-full h-full rounded sm:rounded-md flex items-center justify-center transition-custom ";
                        
                        if (isPast || isBooked) {
                            inner.className += isBooked ? "bg-red-100/60 border border-red-200/50 cursor-not-allowed text-transparent" : "bg-slate-50 cursor-not-allowed";
                            cell.onclick = (e) => e.stopPropagation();
                        } else if (pubSess) {
                            if (isSelected) {
                                inner.className += "bg-indigo-600 text-white font-bold shadow-sm shadow-indigo-600/30";
                                inner.innerHTML = `<i class="fa-solid fa-users text-[10px]"></i>`;
                            } else {
                                inner.className += "bg-indigo-50 border border-indigo-200/80 text-indigo-700/80 hover:bg-indigo-100/80 transition-colors";
                                inner.innerHTML = `<i class="fa-solid fa-users text-[10px]"></i>`;
                            }
                        } else if (isSelected) {
                            inner.className += "bg-primary text-white font-bold shadow-sm shadow-primary/30";
                            inner.innerHTML = `<i class="fa-solid fa-check text-[10px]"></i>`;
                        } else {
                            inner.className += "bg-emerald-50/50 border border-emerald-100/50 opacity-0 group-hover:opacity-100 group-hover:bg-primary/20";
                        }
                        
                        if (!isPast && !isBooked) {
                            cell.onclick = (e) => {
                                e.stopPropagation();
                                toggleTimeSlot(dateStr, slot);
                                
                                if(bookingDateInput) {
                                   selectedDateStr = dateStr;
                                   bookingDateInput.value = dateStr;
                                }
                                
                                render();
                            };
                        }
                        
                        cell.appendChild(inner);
                        slotsWrapper.appendChild(cell);
                    });
                    
                    col.appendChild(slotsWrapper);
                    daysWrapper.appendChild(col);
                }
                weeklyGrid.appendChild(daysWrapper);
            }

            function renderDailyCalendar() {
                const dailyGrid = document.getElementById('daily-grid');
                const periodDisplay = document.getElementById('current-period-display');
                if (!dailyGrid || !periodDisplay) return;
                dailyGrid.innerHTML = '';
                
                const selectedD = new Date(selectedDateStr + 'T12:00:00');
                
                // For the period display, we use a span for the day name to avoid translating the abbreviation incorrectly
                periodDisplay.innerHTML = `<span class="notranslate">${dayNamesHTML[selectedD.getDay()]}</span>, ${monthNames[selectedD.getMonth()]} ${selectedD.getDate()}, ${selectedD.getFullYear()}`;

                let opHours = { open: facilityOperatingHours.open || "06:00", close: facilityOperatingHours.close || "23:00" };
                let slots = generateDailySlots(opHours);
                
                const todayForCal = new Date(); todayForCal.setHours(0,0,0,0);
                const dayDate = new Date(selectedDateStr + 'T00:00:00');
                const isPastDay = dayDate < todayForCal;
                const td = new Date();
                const isToday = selectedDateStr === `${td.getFullYear()}-${String(td.getMonth()+1).padStart(2,'0')}-${String(td.getDate()).padStart(2,'0')}`;
                const currentTime24 = `${td.getHours().toString().padStart(2, '0')}:${td.getMinutes().toString().padStart(2, '0')}`;

                slots.forEach(slot => {
                    const isPast = isPastDay || (isToday && slot.id < currentTime24);
                    const slotKey = `${selectedDateStr}|${slot.id}`;
                    const isBooked = bookedSlotIds.has(slotKey);
                    const isSelected = selectedSlotIds.has(slotKey);
                    
                    const pubSess = window.publicSessionSlots ? window.publicSessionSlots.get(slotKey) : null;
                    
                    const row = document.createElement('div');
                    row.className = "flex items-center justify-between p-3 rounded-xl border transition-custom cursor-pointer ";
                    
                    if (isPast || isBooked) {
                         row.className += isBooked ? "bg-red-50 border-red-100/50 cursor-not-allowed opacity-70" : "bg-slate-50 border-slate-100 cursor-not-allowed opacity-50";
                         const reason = isPast ? "Passed" : "Fully Booked";
                         const badgeClass = isBooked ? "bg-red-100 text-red-600" : "bg-slate-200 text-slate-500";
                         row.innerHTML = `<span class="font-bold text-slate-500">${slot.time.split(' - ')[0]}</span> <span class="text-[10px] uppercase font-bold px-2 py-1 rounded-md ${badgeClass}">${reason}</span>`;
                         row.onclick = (e) => e.stopPropagation();
                    } else if (pubSess) {
                         if (isSelected) {
                             row.className += "bg-indigo-600 border-indigo-700 shadow-sm shadow-indigo-600/30 text-white";
                             row.innerHTML = `<span class="font-bold text-white">${slot.time.split(' - ')[0]} - Public Session</span> <div class="w-6 h-6 rounded-full bg-white text-indigo-600 flex items-center justify-center shadow-sm"><i class="fa-solid fa-users text-xs"></i></div>`;
                         } else {
                             row.className += "bg-indigo-50 border-indigo-200 hover:border-indigo-400 hover:shadow-sm";
                             row.innerHTML = `<span class="font-bold text-indigo-700">${slot.time.split(' - ')[0]} - ${pubSess.manual_notes || 'Public Session'}</span> <span class="text-xs font-bold text-indigo-600 bg-white px-2 rounded-full border border-indigo-100 shadow-sm">${pubSess.joined_count}/${pubSess.capacity} joined</span>`;
                         }
                    } else if (isSelected) {
                         row.className += "bg-primary/10 border-primary/30 shadow-sm shadow-primary/10";
                         row.innerHTML = `<span class="font-bold text-primary">${slot.time.split(' - ')[0]}</span> <div class="w-6 h-6 rounded-full bg-primary text-white flex items-center justify-center shadow-sm"><i class="fa-solid fa-check text-xs"></i></div>`;
                    } else {
                         row.className += "bg-white border-slate-200 hover:border-primary hover:shadow-sm";
                         row.innerHTML = `<span class="font-bold text-dark">${slot.time.split(' - ')[0]}</span> <div class="w-6 h-6 rounded-full border border-slate-300 group-hover:border-primary flex items-center justify-center text-transparent hover:bg-slate-50"><i class="fa-solid fa-plus text-xs"></i></div>`;
                    }

                    if (!isPast && !isBooked) {
                        row.onclick = (e) => {
                            e.stopPropagation();
                            toggleTimeSlot(selectedDateStr, slot);
                            render();
                            renderDailyCalendar();
                        };
                    }
                    
                    dailyGrid.appendChild(row);
                });
            }

            const viewMonthlyBtn = document.getElementById('view-monthly-btn');
            const viewWeeklyBtn = document.getElementById('view-weekly-btn');
            const viewDailyBtn = document.getElementById('view-daily-btn');
            const monthlyContainer = document.getElementById('monthly-view-container');
            const weeklyContainer = document.getElementById('weekly-view-container');
            const dailyContainer = document.getElementById('daily-view-container');

            function switchView(view) {
                currentView = view;
                if(viewMonthlyBtn) viewMonthlyBtn.className = view === 'monthly' ? "px-4 py-2 rounded-lg bg-white shadow-sm text-primary transition-custom ring-1 ring-slate-200" : "px-4 py-2 rounded-lg hover:text-dark transition-custom text-slate-500 bg-transparent";
                if(viewWeeklyBtn) viewWeeklyBtn.className = view === 'weekly' ? "px-4 py-2 rounded-lg bg-white shadow-sm text-primary transition-custom ring-1 ring-slate-200" : "px-4 py-2 rounded-lg hover:text-dark transition-custom text-slate-500 bg-transparent";
                if(viewDailyBtn) viewDailyBtn.className = view === 'daily' ? "px-4 py-2 rounded-lg bg-white shadow-sm text-primary transition-custom ring-1 ring-slate-200" : "px-4 py-2 rounded-lg hover:text-dark transition-custom text-slate-500 bg-transparent";
                
                if(monthlyContainer) monthlyContainer.classList.toggle('hidden', view !== 'monthly');
                if(weeklyContainer) weeklyContainer.classList.toggle('hidden', view !== 'weekly');
                if(dailyContainer) dailyContainer.classList.toggle('hidden', view !== 'daily');
                
                updatePeriodDisplay();
            }

            if(viewMonthlyBtn) viewMonthlyBtn.addEventListener('click', () => switchView('monthly'));
            if(viewWeeklyBtn) viewWeeklyBtn.addEventListener('click', () => switchView('weekly'));
            if(viewDailyBtn) viewDailyBtn.addEventListener('click', () => switchView('daily'));

            const prevPeriodBtn = document.getElementById('prev-period-btn');
            const nextPeriodBtn = document.getElementById('next-period-btn');

            if (prevPeriodBtn) {
                prevPeriodBtn.onclick = () => {
                    if (currentView === 'monthly') {
                        currentDate.setMonth(currentDate.getMonth() - 1);
                    } else if (currentView === 'weekly') {
                        const d = new Date(selectedDateStr + 'T12:00:00');
                        d.setDate(d.getDate() - 7);
                        selectedDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        if(bookingDateInput) bookingDateInput.value = selectedDateStr;
                    } else if (currentView === 'daily') {
                        const d = new Date(selectedDateStr + 'T12:00:00');
                        d.setDate(d.getDate() - 1);
                        selectedDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        if(bookingDateInput) bookingDateInput.value = selectedDateStr;
                    }
                    updatePeriodDisplay();
                };
            }
            if (nextPeriodBtn) {
                nextPeriodBtn.onclick = () => {
                    if (currentView === 'monthly') {
                        currentDate.setMonth(currentDate.getMonth() + 1);
                    } else if (currentView === 'weekly') {
                        const d = new Date(selectedDateStr + 'T12:00:00');
                        d.setDate(d.getDate() + 7);
                        selectedDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        if(bookingDateInput) bookingDateInput.value = selectedDateStr;
                    } else if (currentView === 'daily') {
                        const d = new Date(selectedDateStr + 'T12:00:00');
                        d.setDate(d.getDate() + 1);
                        selectedDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
                        if(bookingDateInput) bookingDateInput.value = selectedDateStr;
                    }
                    updatePeriodDisplay();
                };
            }
            
            if (bookingDateInput) {
                bookingDateInput.addEventListener('change', async (e) => {
                    selectedDateStr = e.target.value;
                    const newDate = new Date(selectedDateStr + 'T00:00:00');
                    if (!isNaN(newDate.getTime())) {
                        currentDate = new Date(newDate.getFullYear(), newDate.getMonth(), 1);
                    }
                    renderCalendar();

                    const slotsSummary = document.getElementById('slots-summary');
                    if (slotsSummary) slotsSummary.textContent = "Loading slots...";
                    
                    bookedSlotIds = await fetchBookedSlots();
                    if (slotsSummary) slotsSummary.textContent = "Select Times";
                    render();
                    updatePeriodDisplay();
                });
            }

            // Sync initial calendar render
            updatePeriodDisplay();

            // Initial render call for booking widget
            if (currentFacilityId) {

                fetchBookedSlots().then(booked => {
                    bookedSlotIds = booked;
                    render();
                    updatePeriodDisplay(); // ensure calendar shows booked
                    
                    if (sessionStorage.getItem('auto_reserve')) {
                        sessionStorage.removeItem('auto_reserve');
                        setTimeout(initiateCheckout, 300); // slight delay to let UI settle
                    }
                });
            } else {
                render();
            }
        });
