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
        // Navbar blur and sticky behavior
        window.addEventListener('scroll', () => {
            const nav = document.getElementById('navbar');
            if (window.scrollY > 10) {
                nav.classList.add('shadow-md');
            } else {
                nav.classList.remove('shadow-md');
            }
        });

        // Profile Puck Logic
        const puckBtn = document.getElementById('profile-puck-btn');
        const puckDropdown = document.getElementById('puck-dropdown');
        if (puckBtn && puckDropdown) {
            puckBtn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                puckDropdown.classList.toggle('hidden');
            });
            document.addEventListener('click', (e) => {
                if (!puckDropdown.contains(e.target) && e.target !== puckBtn && !puckBtn.contains(e.target)) {
                    puckDropdown.classList.add('hidden');
                }
            });
        }

        // Autocomplete for Location Search via Google Places API
        const searchInput = document.getElementById('navLocationSearch');

        async function initGoogleMaps() {
            try {
                const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                const response = await fetch(`${API_BASE_URL}/api/config/maps`);
                if (!response.ok) return;
                
                const data = await response.json();
                if (data.apiKey) {
                    const script = document.createElement('script');
                    script.src = `https://maps.googleapis.com/maps/api/js?key=${data.apiKey}&libraries=places`;
                    script.async = true;
                    script.defer = true;
                    script.onload = () => {
                        if (!searchInput) return;
                        const options = {
                            componentRestrictions: { country: ["us", "ca"] },
                            fields: ["formatted_address", "geometry"]
                        };
                        const autocomplete = new google.maps.places.Autocomplete(searchInput, options);
                        autocomplete.addListener('place_changed', function() {
                            const place = autocomplete.getPlace();
                            if (place.formatted_address) {
                                searchInput.value = place.formatted_address;
                            }
                            // Map pan integration
                            if (place.geometry && place.geometry.location && typeof map !== 'undefined') {
                                map.setView([place.geometry.location.lat(), place.geometry.location.lng()], 12);
                            }
                        });
                        
                        searchInput.addEventListener('keydown', function(e) {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                if (typeof panMapToLocation === 'function') {
                                    panMapToLocation(this.value);
                                }
                            }
                        });
                    };
                    document.head.appendChild(script);
                }
            } catch (err) {
                console.error("Failed to load Google Maps API", err);
            }
        }
        initGoogleMaps();
        
        async function ipLocationFallback() {
            try {
                const resultsCountEl = document.getElementById('results-count');
                if (resultsCountEl) resultsCountEl.innerHTML = `Using approximate location <i class="fa-solid fa-spinner fa-spin ml-1 text-primary"></i>`;
                
                const response = await fetch('https://get.geojs.io/v1/ip/geo.json');
                const data = await response.json();
                if (data.latitude && data.longitude) {
                    const userLat = parseFloat(data.latitude);
                    const userLng = parseFloat(data.longitude);
                    if (map) {
                        map.setView([userLat, userLng], 10);
                    }
                    const typeCheckboxes = document.querySelectorAll('.type-filter:checked');
                    const selectedTypes = [];
                    let isAll = false;
                    typeCheckboxes.forEach(cb => {
                        if (cb.value === 'all') isAll = true;
                        else selectedTypes.push(cb.value);
                    });
                    
                    fetchFacilities({ types: isAll ? [] : selectedTypes }, true);
                    return;
                }
            } catch (err) {
                console.warn("IP geolocation failed:", err);
            }
            
            // Final fallback: fetch facilities using default map center
            const typeCheckboxes = document.querySelectorAll('.type-filter:checked');
            const selectedTypes = [];
            let isAll = false;
            typeCheckboxes.forEach(cb => {
                if (cb.value === 'all') isAll = true;
                else selectedTypes.push(cb.value);
            });
            fetchFacilities({ types: isAll ? [] : selectedTypes }, false);
        }

        const locateMeBtn = document.getElementById('locate-me-btn');
        if (locateMeBtn) {
            locateMeBtn.addEventListener('click', (e) => {
                e.preventDefault();
                if ("geolocation" in navigator && window.isSecureContext) {
                    navigator.geolocation.getCurrentPosition(
                        (position) => {
                            if (map) map.setView([position.coords.latitude, position.coords.longitude], 10);
                            const navSearch = document.getElementById('navLocationSearch');
                            if (navSearch) navSearch.value = 'Current Location';
                            document.getElementById('apply-filters-btn').click();
                        },
                        (error) => {
                            if (window.showAlertModal) {
                                showAlertModal("Location Error", "Location access denied or unavailable. Falling back to approximate location.", "OK", true);
                            } else {
                                alert("Location access denied or unavailable. Falling back to approximate location.");
                            }
                            ipLocationFallback();
                        }
                    );
                } else {
                    if (window.showAlertModal) {
                        showAlertModal("Location Error", "Exact GPS location is blocked by your browser on this connection. Ensure you are using HTTPS. Falling back to approximate location.", "OK", true);
                    } else {
                        alert("Exact GPS location is blocked by your browser on this connection. Ensure you are using HTTPS. Falling back to approximate location.");
                    }
                    ipLocationFallback();
                }
            });
        }

        
        async function panMapToLocation(locationName) {
            if (!map || !locationName) return false;

            // Fallback: Fetch from Nominatim
            try {
                const response = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(locationName)}&limit=1&countrycodes=us,ca`);
                if (response.ok) {
                    const data = await response.json();
                    if (data.length > 0) {
                        map.setView([data[0].lat, data[0].lon], 10);
                        return true;
                    }
                }
            } catch (err) {
                console.error("Failed to geocode location fallback:", err);
            }
            return false;
        }

        // Price Range Slider Logic
        const priceRange = document.getElementById('price-range');
        const priceDisplay = document.getElementById('price-display');
        
        if(priceRange && priceDisplay) {
            priceRange.addEventListener('input', (e) => {
                const value = e.target.value;
                if (value == 300) {
                    priceDisplay.textContent = 'Any price';
                } else {
                    priceDisplay.textContent = `Up to $${value}`;
                }
            });
        }

        // Environment Buttons Toggle Logic
        const envButtons = document.querySelectorAll('.env-btn');
        let selectedEnv = '';
        envButtons.forEach(btn => {
            btn.addEventListener('click', (e) => {
                // Reset all
                envButtons.forEach(b => {
                    b.className = 'env-btn flex-1 py-1.5 text-sm font-medium text-slate-500 hover:text-dark transition-custom';
                    b.removeAttribute('data-active');
                });
                // Set active
                e.target.className = 'env-btn flex-1 py-1.5 text-sm font-medium bg-white text-dark rounded-lg shadow-sm transition-custom';
                e.target.setAttribute('data-active', 'true');

                if (e.target.innerText === 'Any') selectedEnv = '';
                else selectedEnv = e.target.innerText.toLowerCase();
            });
        });

        // Backend Integration
        const facilitiesGrid = document.getElementById('facilitiesGrid');
        const resultsCountEl = document.getElementById('results-count');
        const applyBtn = document.getElementById('apply-filters-btn');
        const pagination = document.getElementById('pagination');

        function getPrimaryImageUrl(urlStr) {
            try {
                const parsed = JSON.parse(urlStr);
                if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
            } catch (e) {
                // not json, return string directly
            }
            return urlStr || 'https://images.unsplash.com/photo-1518605368461-1ee0ab24b829?ixlib=rb-4.0.3&auto=format&fit=crop&w=1400&q=80';
        }

        // Function to build standard surface card HTML
        function createFacilityCard(facility) {
            const isInstantBook = facility.is_instant_book === 1;
            const bookStatusHtml = isInstantBook 
                ? '<span class="text-primary font-bold"><i class="fa-solid fa-bolt mr-1"></i> Instant Book</span>'
                : '<span class="text-slate-500 font-medium whitespace-nowrap">Request to Book</span>';

            const typeDisplay = facility.type.charAt(0).toUpperCase() + facility.type.slice(1);
            const envDisplay = facility.environment.charAt(0).toUpperCase() + facility.environment.slice(1);

            let topBadges = '';
            if (facility.active_promotions) {
                topBadges += `<div class="bg-red-500/90 backdrop-blur px-2 py-1 rounded-md text-xs font-bold text-white shadow-sm flex items-center"><i class="fa-solid fa-tag mr-1"></i> Promo</div>`;
            }
            if (isInstantBook) {
                topBadges += `<div class="bg-primary/90 backdrop-blur px-2 py-1 rounded-md text-xs font-bold text-white shadow-sm">Instant Book</div>`;
            }

            let model = 'exclusive';
            let priceDisplay = `From $${facility.base_price}`;
            let unitDisplay = facility.pricing_unit === 'half_day' ? '/ half-day' : (facility.pricing_unit === 'full_day' ? '/ day' : '/hr');

            try {
                let pr = typeof facility.pricing_rules === 'string' ? JSON.parse(facility.pricing_rules) : facility.pricing_rules;
                if (!Array.isArray(pr) && pr && pr.booking_model) {
                    model = pr.booking_model;
                    if (model === 'shared_zone') {
                        priceDisplay = `From $${pr.zone_price || facility.base_price}`;
                        unitDisplay = '/lane';
                    }
                }
            } catch(e) {}
            
            let priceHtml = '';
            if (model === 'drop_in_only') {
                priceHtml = `<span class="font-bold text-sm text-slate-500 whitespace-nowrap"><span class="lang-en-only">Public Only</span><span class="lang-fr-only notranslate">Public Seul</span></span>`;
            } else {
                priceHtml = `<span class="font-bold text-dark whitespace-nowrap">${priceDisplay}<span class="text-xs font-normal text-slate-500">${unitDisplay}</span></span>`;
            }

            return `
                <div class="bg-white rounded-2xl overflow-hidden shadow-sm border border-slate-200 hover:shadow-md transition-custom group cursor-pointer" onclick="window.location.href='surface.html?id=${facility.id}'">
                    <div class="relative h-48 hover-zoom-img-container">
                        <img src="${getPrimaryImageUrl(facility.primary_image || facility.image_url)}" alt="${facility.name}" class="w-full h-full object-cover bg-slate-100">
                        <div class="absolute top-3 left-3 right-3 flex flex-wrap gap-2 z-20 max-w-[calc(100%-1.5rem)]">
                            <div class="bg-white/90 backdrop-blur px-2 py-1 rounded-md text-xs font-bold text-slate-800 border border-slate-200">
                                <i class="fa-solid fa-star text-yellow-400 mr-1"></i> ${facility.rating || 'New'} ${facility.reviews_count ? \`(\${facility.reviews_count})\` : ''}
                            </div>
                            ${topBadges}
                        </div>
                        <button class="absolute bottom-3 right-3 w-8 h-8 bg-white/80 hover:bg-white backdrop-blur rounded-full flex items-center justify-center text-slate-500 hover:text-red-500 transition-custom z-10 shadow-sm">
                            <i class="fa-regular fa-heart text-sm"></i>
                        </button>
                    </div>
                    <div class="p-5">
                        <div class="flex justify-between items-start mb-1">
                            <h3 class="text-lg font-bold text-dark group-hover:text-primary transition-custom truncate pr-4">${facility.name}</h3>
                            ${priceHtml}
                        </div>
                        <p class="text-slate-500 text-xs mb-3 flex items-center">
                            <i class="fa-solid fa-location-dot mr-1"></i> ${typeof formatShortLocation === 'function' ? formatShortLocation(facility.effective_location || facility.location) : (facility.effective_location || facility.location || 'Location unavailable')}
                        </p>
                        <div class="flex gap-1.5 mb-4 overflow-hidden">
                            <span class="px-2 py-0.5 bg-slate-100 text-slate-600 rounded text-[11px] font-semibold whitespace-nowrap">${typeDisplay}</span>
                            <span class="px-2 py-0.5 bg-slate-100 text-slate-600 border border-transparent rounded text-[11px] font-semibold whitespace-nowrap">${envDisplay}</span>
                        </div>
                        <div class="flex flex-wrap items-center justify-between border-t border-slate-100 pt-3 gap-y-2 text-xs">
                            ${bookStatusHtml}
                            <span class="text-slate-500 font-medium">Available Today</span>
                        </div>
                    </div>
                </div>
            `;
        }

        let map;
        let markers = [];
        let currentPage = 1;
        const limitPerPage = 50; // Increased to fetch all relevant facilities for the map
        let allFetchedFacilities = []; // Store fetched facilities globally

        function initMap() {
            // Default center around Montreal
            map = L.map('map').setView([45.5017, -73.5673], 10);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; OpenStreetMap contributors &copy; CARTO'
            }).addTo(map);

            // Listen for map move/zoom events
            map.on('moveend', () => {
                updateListingsFromMapBounds();
            });
        }

        function updateMapMarkers(facilities, preventFitBounds = false) {
            if (!map) return;
            
            // Clear existing
            markers.forEach(m => map.removeLayer(m));
            markers = [];

            if (facilities.length === 0) return;

            const bounds = L.latLngBounds();
            
            // Group facilities by exact coordinate (rounded to 5 decimals to catch ~1m differences)
            const groupedFacilities = {};

            facilities.forEach((f, i) => {
                let actualLat, actualLng;
                
                if (f.effective_lat && f.effective_lng) {
                    actualLat = f.effective_lat;
                    actualLng = f.effective_lng;
                } else if (f.lat && f.lng) {
                    actualLat = f.lat;
                    actualLng = f.lng;
                } else {
                    // Fallback visually if missing coordinates
                    actualLat = 45.5017 + (Math.random() - 0.5) * 0.2;
                    actualLng = -73.5673 + (Math.random() - 0.5) * 0.2;
                    f.effective_lat = actualLat;
                    f.effective_lng = actualLng;
                }
                
                const key = `${actualLat.toFixed(5)}_${actualLng.toFixed(5)}`;
                if (!groupedFacilities[key]) {
                    groupedFacilities[key] = { lat: actualLat, lng: actualLng, items: [] };
                }
                groupedFacilities[key].items.push(f);
            });

            // Render each grouped marker
            Object.values(groupedFacilities).forEach(group => {
                const marker = L.marker([group.lat, group.lng]).addTo(map);
                
                let popupContent = `<div class="max-h-[300px] overflow-y-auto space-y-4 pr-2 custom-scrollbar">`;
                
                // Add a header if multiple facilities are under the exact same roof
                if (group.items.length > 1) {
                    popupContent += `<div class="text-xs font-bold text-slate-500 uppercase tracking-wide border-b border-slate-200 pb-1 mb-2">${group.items.length} Facilities Here</div>`;
                }
                
                group.items.forEach(f => {
                    popupContent += `
                        <div class="w-48 cursor-pointer ${group.items.length > 1 ? 'border-b border-slate-100 pb-3 last:border-0 last:pb-0' : ''}" onclick="window.location.href='surface.html?id=${f.id}'">
                            <img src="${getPrimaryImageUrl(f.primary_image || f.image_url)}" class="w-full h-24 object-cover rounded-lg mb-2">
                            <div class="font-bold text-sm truncate hover:text-primary transition-custom">${f.name}</div>
                            <div class="font-bold text-primary">From $${f.base_price}<span class="text-xs text-slate-500 font-normal">${f.pricing_unit === 'half_day' ? '/ half-day' : (f.pricing_unit === 'full_day' ? '/ day' : '/hr')}</span></div>
                        </div>
                    `;
                });
                
                popupContent += `</div>`;
                marker.bindPopup(popupContent);
                markers.push(marker);
                bounds.extend([group.lat, group.lng]);
            });

            // Set a slightly tighter padding and lower maxZoom for better context display
            if (!preventFitBounds) {
                map.fitBounds(bounds, { padding: [50, 50], maxZoom: 12, animate: false });
            }
        }

        function updateListingsFromMapBounds() {
            if (!map || allFetchedFacilities.length === 0) return;

            const mapViewEl = document.getElementById('map-view');
            const isMapVisible = window.getComputedStyle(mapViewEl).display !== 'none';

            let visibleFacilities = allFetchedFacilities;

            if (isMapVisible) {
                const bounds = map.getBounds();
                
                // Filter facilities that fall within the current map view
                visibleFacilities = allFetchedFacilities.filter(f => {
                    const lat = f.effective_lat || f.lat;
                    const lng = f.effective_lng || f.lng;
                    if (lat && lng) {
                        return bounds.contains(L.latLng(lat, lng));
                    }
                    return false;
                });
            } else {
                // Map is hidden (e.g., mobile), filter by distance from map center (50km radius)
                const center = map.getCenter();
                visibleFacilities = allFetchedFacilities.filter(f => {
                    const lat = f.effective_lat || f.lat;
                    const lng = f.effective_lng || f.lng;
                    if (lat && lng) {
                        // distanceTo returns distance in meters
                        return center.distanceTo(L.latLng(lat, lng)) < 50000; 
                    }
                    return false;
                });
            }

            facilitiesGrid.innerHTML = '';
            
            if (visibleFacilities.length === 0) {
                 const msgSuffix = isMapVisible ? ' in this map area' : '';
                 facilitiesGrid.innerHTML = `<div class="col-span-full text-center py-12 text-slate-500 text-lg">No facilities match your criteria${msgSuffix}.</div>`;
                 resultsCountEl.innerHTML = `Showing <span class="font-bold text-dark">0</span> available facilities`;
            } else {
                visibleFacilities.forEach(facility => {
                    facilitiesGrid.innerHTML += createFacilityCard(facility);
                });
                const msgSuffix = isMapVisible ? ' in this area' : '';
                resultsCountEl.innerHTML = `Showing <span class="font-bold text-dark">${visibleFacilities.length}</span> facilities${msgSuffix}`;
            }
            
            // Hide pagination since we are scrolling the map now
            pagination.classList.add('hidden');
        }

        // Handle window resize to invalidate map size if it becomes visible
        window.addEventListener('resize', () => {
            const mapViewEl = document.getElementById('map-view');
            if (map && mapViewEl && window.getComputedStyle(mapViewEl).display !== 'none') {
                map.invalidateSize();
                updateListingsFromMapBounds();
            } else if (mapViewEl && window.getComputedStyle(mapViewEl).display === 'none') {
                updateListingsFromMapBounds();
            }
        });

        async function fetchFacilities(filters = {}, preventFitBounds = false) {
            try {
                facilitiesGrid.style.opacity = '0.5';
                
                const params = new URLSearchParams();
                if (filters.maxPrice && filters.maxPrice < 300) params.append('maxPrice', filters.maxPrice);
                if (filters.environment) params.append('environment', filters.environment);
                if (filters.types && filters.types.length > 0) params.append('types', filters.types.join(','));
                if (filters.search) params.append('search', filters.search);
                
                const dateVal = filters.date !== undefined ? filters.date : (document.getElementById('sidebarDateSearch') ? document.getElementById('sidebarDateSearch').value : '');
                const timeVal = filters.time !== undefined ? filters.time : (document.getElementById('sidebarTimeSearch') ? document.getElementById('sidebarTimeSearch').value : '');
                
                if (dateVal) params.append('date', dateVal);
                if (timeVal) params.append('time', timeVal);
                
                params.append('limit', limitPerPage);
                params.append('offset', (currentPage - 1) * limitPerPage);
                
                const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                const response = await fetch(`${API_BASE_URL}/api/public/surfaces?` + params.toString());
                
                if (!response.ok) throw new Error(`Server returned ${response.status}`);
                const data = await response.json();
                allFetchedFacilities = data; // Store globally
                
                facilitiesGrid.innerHTML = '';
                if (data.length === 0) {
                    facilitiesGrid.innerHTML = '<div class="col-span-full text-center py-12 text-slate-500 text-lg">No facilities match your criteria. Try adjusting your filters.</div>';
                    resultsCountEl.innerHTML = `Showing <span class="font-bold text-dark">0</span> available facilities`;
                    pagination.classList.add('hidden');
                    updateMapMarkers([]);
                } else {
                    updateMapMarkers(data, preventFitBounds);
                    // Instead of raw render, we trigger the map bounds render immediately
                    // The map bounds might take a fraction of a second to settle after fitBounds
                    setTimeout(updateListingsFromMapBounds, 50);
                }
                facilitiesGrid.style.opacity = '1';
                
            } catch (error) {
                console.error("Error fetching facilities:", error);
                facilitiesGrid.innerHTML = `<div class="col-span-full bg-red-50 text-red-600 p-4 rounded-xl border border-red-100 text-center">${error.message}</div>`;
                facilitiesGrid.style.opacity = '1';
            }
        }

        // Apply Filters API Call
        if(applyBtn && resultsCountEl) {
            applyBtn.addEventListener('click', async () => {
                currentPage = 1; // reset string on filter
                const originalText = applyBtn.innerHTML;
                applyBtn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-2"></i> Filtering...';
                applyBtn.disabled = true;

                const maxPrice = priceRange ? parseInt(priceRange.value) : 300;
                
                // Get checked types
                const typeCheckboxes = document.querySelectorAll('.type-filter:checked');
                const selectedTypes = [];
                let isAll = false;
                typeCheckboxes.forEach(cb => {
                    if(cb.value === 'all') isAll = true;
                    else selectedTypes.push(cb.value);
                });

                const navSearch = document.getElementById('navLocationSearch');
                const rawSearchQuery = navSearch ? navSearch.value.trim() : '';
                
                let isLocation = false;
                if (rawSearchQuery) {
                    isLocation = await panMapToLocation(rawSearchQuery);
                }
                const searchQuery = isLocation ? '' : rawSearchQuery;

                const dateVal = document.getElementById('sidebarDateSearch') ? document.getElementById('sidebarDateSearch').value : '';
                const timeVal = document.getElementById('sidebarTimeSearch') ? document.getElementById('sidebarTimeSearch').value : '';

                fetchFacilities({ 
                    maxPrice: maxPrice,
                    environment: selectedEnv,
                    types: isAll ? [] : selectedTypes,
                    search: searchQuery,
                    date: dateVal,
                    time: timeVal
                }, true).finally(() => {
                    applyBtn.innerHTML = originalText;
                    applyBtn.disabled = false;
                });
            });
        }

        // Type filter "All" logic
        const filterAll = document.getElementById('filter-all');
        const typeFilters = document.querySelectorAll('.type-filter');
        typeFilters.forEach(cb => {
            if (cb.value !== 'all') {
                cb.addEventListener('change', () => {
                    if (cb.checked) filterAll.checked = false;
                });
            } else {
                cb.addEventListener('change', () => {
                    if (cb.checked) {
                        typeFilters.forEach(other => {
                            if (other.value !== 'all') other.checked = false;
                        });
                    }
                });
            }
        });

        // Pagination buttons
        document.getElementById('prev-page')?.addEventListener('click', () => {
            if (currentPage > 1) {
                currentPage--;
                applyBtn.click();
            }
        });
        document.getElementById('next-page')?.addEventListener('click', () => {
            currentPage++;
            applyBtn.click();
        });

        // Load initially
        document.addEventListener('DOMContentLoaded', async () => {
            initMap();
            
            // Check for explicit URL parameters first
            const urlParams = new URLSearchParams(window.location.search);
            const explicitLocation = urlParams.get('location');
            const explicitType = urlParams.get('type');
            const explicitDate = urlParams.get('date');
            const explicitTime = urlParams.get('time');
            
            if (explicitDate) {
                const dateInput = document.getElementById('sidebarDateSearch');
                if (dateInput) dateInput.value = explicitDate;
            }
            if (explicitTime) {
                const timeInput = document.getElementById('sidebarTimeSearch');
                if (timeInput) timeInput.value = explicitTime;
            }
            
            // Handle pre-selected sport type
            if (explicitType) {
                const typeCheckbox = document.querySelector(`.type-filter[value="${explicitType}"]`);
                if (typeCheckbox) {
                    // Uncheck 'all' and check the specific type
                    document.getElementById('filter-all').checked = false;
                    typeCheckbox.checked = true;
                }
            }

            if (explicitLocation) {
                // User explicitly searched for a location, bypass geolocation
                const navSearch = document.getElementById('navLocationSearch');
                if (navSearch) navSearch.value = explicitLocation;
                
                // Pan map and fetch results
                const isLocation = await panMapToLocation(explicitLocation);
                
                // Construct initial filters based on URL
                const typeCheckboxes = document.querySelectorAll('.type-filter:checked');
                const selectedTypes = [];
                let isAll = false;
                typeCheckboxes.forEach(cb => {
                    if (cb.value === 'all') isAll = true;
                    else selectedTypes.push(cb.value);
                });
                
                fetchFacilities({ types: isAll ? [] : selectedTypes, search: isLocation ? '' : explicitLocation }, isLocation);
                
            } else if ("geolocation" in navigator && window.isSecureContext) {
                // No explicit location, try geolocation to center the map on the user
                const resultsCountEl = document.getElementById('results-count');
                if (resultsCountEl) resultsCountEl.innerHTML = `Locating you <i class="fa-solid fa-spinner fa-spin ml-1 text-primary"></i>`;
                
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        const userLat = position.coords.latitude;
                        const userLng = position.coords.longitude;
                        if (map) {
                            map.setView([userLat, userLng], 10);
                        }
                        // Fetch facilities after we have panned the map to their area
                        // Pass true to prevent fit bounds from breaking the user's location setting
                        
                        // Construct initial filters for geolocation fetch
                        const typeCheckboxes = document.querySelectorAll('.type-filter:checked');
                        const selectedTypes = [];
                        let isAll = false;
                        typeCheckboxes.forEach(cb => {
                            if (cb.value === 'all') isAll = true;
                            else selectedTypes.push(cb.value);
                        });
                        
                        fetchFacilities({ types: isAll ? [] : selectedTypes }, true);
                    },
                    (error) => {
                        console.warn("Geolocation error/denied:", error);
                        // Fallback: fetch facilities using approximate IP location
                        ipLocationFallback();
                    }, 
                    { timeout: 5000 } // Give up after 5 seconds
                );
            } else {
                ipLocationFallback();
            }
        });
        async function checkHostNotifications(btnElement) {
            try {
                const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                const res = await fetch(`${API_BASE_URL}/api/host/notifications/unread-count`, { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    if (data.unread_count > 0) {
                        let badge = btnElement.querySelector('.host-notification-badge');
                        if (!badge) {
                            badge = document.createElement('span');
                            badge.className = 'host-notification-badge absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full border-white shadow-sm';
                            btnElement.appendChild(badge);
                        }
                        badge.textContent = data.unread_count;
                    } else {
                        const badge = btnElement.querySelector('.host-notification-badge');
                        if (badge) badge.remove();
                    }
                }
            } catch (e) { }
        }

        document.addEventListener('DOMContentLoaded', async () => {
            function updateNavUI(user) {
                const loginBtn = document.getElementById('login-btn');
                const listBtn = document.getElementById('list-facility-btn');
                if (loginBtn) {
                    loginBtn.innerHTML = `Hi, ${user.name} <span class="text-xs text-slate-400 ml-1 cursor-pointer hover:text-red-500" id="logout-btn">(Log out)</span>`;
                    loginBtn.href = "#";
                    
                    if (listBtn) {
                        if (user.role === 'admin') {
                            listBtn.textContent = "Admin Dashboard";
                            listBtn.href = "admin-dashboard.html";
                        } else if (user.role === 'host') {
                            listBtn.textContent = "Host Dashboard";
                            listBtn.href = "owner-dashboard.html";
                            listBtn.classList.add('relative');
                            checkHostNotifications(listBtn);
                        } else {
                            listBtn.textContent = "My Bookings";
                            listBtn.href = "player-dashboard.html";
                        }
                    }

                    document.getElementById('logout-btn').addEventListener('click', async (e) => {
                        e.preventDefault();
                        const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                        await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
                        localStorage.removeItem('gg_user');
                        window.location.reload();
                    });
                }
                
                const mobileProfileBtn = document.getElementById('mobile-bottom-profile-btn');
                if (mobileProfileBtn && user) {
                    const profileHref = user.role === 'admin' ? 'admin-dashboard.html' : (user.role === 'host' ? 'owner-dashboard.html' : 'player-dashboard.html');
                    mobileProfileBtn.onclick = null;
                    mobileProfileBtn.href = profileHref;
                    mobileProfileBtn.innerHTML = `
                        <i class="fa-solid fa-user-check text-xl mb-1 pb-0.5 text-primary"></i>
                        <span class="text-[10px] font-medium text-primary">Profile</span>
                    `;
                }

                // Update puck UI
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
                            const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
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
                const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    updateNavUI(data.user);
                    (function(){ const _u = {...data.user}; delete _u.profile_picture; localStorage.setItem('gg_user', JSON.stringify(_u)); })();
                }
            } catch (e) { }
        });

        // Mobile Filter & Map Logic
        document.addEventListener('DOMContentLoaded', () => {
            const filtersSidebar = document.getElementById('filters-sidebar');
            const filterOverlay = document.getElementById('mobile-filter-overlay');
            const openFiltersBtn = document.getElementById('open-filters-btn');
            const closeFiltersHandle = document.getElementById('close-filters-handle');
            const closeFiltersText = document.getElementById('mobile-filter-close-text');
            
            function openFilters() {
                filterOverlay.classList.remove('hidden');
                // small delay to allow display block to take effect before transition
                setTimeout(() => {
                    filterOverlay.classList.remove('opacity-0');
                    filtersSidebar.classList.remove('translate-y-full');
                }, 10);
                document.body.style.overflow = 'hidden';
            }

            function closeFilters() {
                filterOverlay.classList.add('opacity-0');
                filtersSidebar.classList.add('translate-y-full');
                
                setTimeout(() => {
                    filterOverlay.classList.add('hidden');
                    document.body.style.overflow = '';
                }, 300);
            }

            if(openFiltersBtn) openFiltersBtn.addEventListener('click', openFilters);
            if(closeFiltersHandle) closeFiltersHandle.addEventListener('click', closeFilters);
            if(closeFiltersText) closeFiltersText.addEventListener('click', closeFilters);
            if(filterOverlay) filterOverlay.addEventListener('click', closeFilters);

            // We also want the Apply Filters button on mobile to close the modal
            const applyFiltersMobileBtn = document.getElementById('apply-filters-btn');
            if(applyFiltersMobileBtn) {
                applyFiltersMobileBtn.addEventListener('click', () => {
                    if(window.innerWidth < 1024) closeFilters(); // lg breakpoint
                });
            }

            // Mobile Map Toggle
            const mobileMapToggle = document.getElementById('mobile-map-toggle');
            const resultsView = document.getElementById('results-view');
            const mapView = document.getElementById('map-view');
            const mobileCloseMapBtn = document.getElementById('mobile-close-map-btn');

            const desktopMapClasses = ['lg:block', 'w-[450px]', 'h-[calc(100vh-120px)]', 'sticky', 'top-28', 'rounded-2xl', 'z-10'];
            const mobileMapClasses = ['fixed', 'inset-0', 'z-[80]', 'w-full', 'h-[100dvh]', 'rounded-none'];

            if(mobileMapToggle) {
                mobileMapToggle.addEventListener('click', () => {
                    resultsView.classList.add('hidden');
                    mapView.classList.remove('hidden', ...desktopMapClasses);
                    mapView.classList.add(...mobileMapClasses);
                    
                    // Trigger Leaflet resize calculation
                    if (typeof map !== 'undefined' && map !== null) {
                        setTimeout(() => { map.invalidateSize(); }, 100);
                    }
                });
            }

            if(mobileCloseMapBtn) {
                mobileCloseMapBtn.addEventListener('click', () => {
                    mapView.classList.remove(...mobileMapClasses);
                    mapView.classList.add('hidden', ...desktopMapClasses);
                    resultsView.classList.remove('hidden');
                });
            }
        });

        document.addEventListener('DOMContentLoaded', () => {
            const userStr = localStorage.getItem('gg_user') || localStorage.getItem('user');
            if (userStr) {
                try {
                    const u = JSON.parse(userStr);
                    const puckDashboard = document.getElementById('puck-dashboard');
                    const puckProfile = document.getElementById('puck-profile');
                    if (u.role === 'host') {
                        if (puckDashboard) puckDashboard.href = 'owner-dashboard.html';
                        if (puckProfile) {
                            puckProfile.href = 'owner-dashboard.html#profile';
                            puckProfile.removeAttribute('onclick');
                        }
                    } else if (u.role === 'admin') {
                        if (puckDashboard) puckDashboard.href = 'admin-dashboard.html';
                        if (puckProfile) {
                            puckProfile.href = 'admin-dashboard.html';
                            puckProfile.removeAttribute('onclick');
                        }
                    } else {
                        if (puckDashboard) puckDashboard.href = 'player-dashboard.html';
                        if (puckProfile) puckProfile.href = 'player-dashboard.html#profile';
                    }
                } catch(e) {}
            }
        });
        document.addEventListener('DOMContentLoaded', () => {
            const userStr = localStorage.getItem('gg_user') || localStorage.getItem('user');
            if (userStr) {
                try {
                    const u = JSON.parse(userStr);
                    const puckDashboard = document.getElementById('puck-dashboard');
                    const puckProfile = document.getElementById('puck-profile');
                    if (u.role === 'host') {
                        if (puckDashboard) puckDashboard.href = 'owner-dashboard.html';
                        if (puckProfile) {
                            puckProfile.href = 'owner-dashboard.html#profile';
                            puckProfile.removeAttribute('onclick');
                        }
                    } else if (u.role === 'admin') {
                        if (puckDashboard) puckDashboard.href = 'admin-dashboard.html';
                        if (puckProfile) {
                            puckProfile.href = 'admin-dashboard.html';
                            puckProfile.removeAttribute('onclick');
                        }
                    } else {
                        if (puckDashboard) puckDashboard.href = 'player-dashboard.html';
                        if (puckProfile) {
                            puckProfile.href = 'player-dashboard.html#profile';
                            puckProfile.removeAttribute('onclick');
                        }
                    }
                } catch(e) {}
            }
        });
