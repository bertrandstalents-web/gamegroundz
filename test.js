    <script>
        tailwind.config = {
            theme: {
                extend: {
                    colors: {
                        primary: '#10b981', // Emerald
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
    </script>
<script>
        // Navbar blur and sticky behavior
        window.addEventListener('scroll', () => {
            const nav = document.getElementById('navbar');
            if (window.scrollY > 20) {
                nav.classList.add('shadow-md');
                nav.classList.replace('border-slate-200', 'border-slate-200/50');
            } else {
                nav.classList.remove('shadow-md');
                nav.classList.replace('border-slate-200/50', 'border-slate-200');
            }
        });

        // Mobile menu toggle
        document.getElementById('mobile-menu-btn').addEventListener('click', () => {
            const menu = document.getElementById('mobile-menu');
            menu.classList.toggle('hidden');
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
        const puckLogout = document.getElementById('puck-logout');
        if (puckLogout) puckLogout.addEventListener('click', handleLogout);

        // Autocomplete for Location Search via Google Places API
        const searchInput = document.getElementById('locationSearch');

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
                        const options = {
                            componentRestrictions: { country: ["us", "ca"] },
                            fields: ["formatted_address"]
                        };
                        const autocomplete = new google.maps.places.Autocomplete(searchInput, options);
                        autocomplete.addListener('place_changed', function() {
                            const place = autocomplete.getPlace();
                            if (place.formatted_address) {
                                searchInput.value = place.formatted_address;
                            }
                        });
                        
                        // Prevent the Enter key from submitting a form if they press enter on a result
                        searchInput.addEventListener('keydown', (e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                            }
                        });

                        // Also attach to signup modal municipality input
                        const authMunicipalitySearch = document.getElementById('auth-municipality-search');
                        if (authMunicipalitySearch) {
                            const authAutocomplete = new google.maps.places.Autocomplete(authMunicipalitySearch, { types: ['(regions)'], fields: ['formatted_address'] });
                            authAutocomplete.addListener('place_changed', function() {
                                const place = authAutocomplete.getPlace();
                                if (place.formatted_address) {
                                    authMunicipalitySearch.value = place.formatted_address;
                                    // Trigger input event to show upload box
                                    authMunicipalitySearch.dispatchEvent(new Event('input'));
                                }
                            });
                            authMunicipalitySearch.addEventListener('keydown', (e) => {
                                if (e.key === 'Enter') e.preventDefault();
                            });
                        }
                        
                        // Also attach to host public municipality field
                        const authHostCity = document.getElementById('auth-host-city');
                        if (authHostCity) {
                            const hostAutocomplete = new google.maps.places.Autocomplete(authHostCity, { types: ['(regions)'], fields: ['formatted_address'] });
                            hostAutocomplete.addListener('place_changed', function() {
                                const place = hostAutocomplete.getPlace();
                                if (place.formatted_address) {
                                    authHostCity.value = place.formatted_address;
                                }
                            });
                            authHostCity.addEventListener('keydown', (e) => {
                                if (e.key === 'Enter') e.preventDefault();
                            });
                        }
                    };
                    document.head.appendChild(script);
                }
            } catch (err) {
                console.error("Failed to load Google Maps API", err);
            }
        }
        initGoogleMaps();

        function getDistance(lat1, lon1, lat2, lon2) {
            if(!lat1 || !lon1 || !lat2 || !lon2) return Infinity;
            const R = 6371; // Radius of the earth in km
            const dLat = (lat2 - lat1) * Math.PI / 180;
            const dLon = (lon2 - lon1) * Math.PI / 180;
            const a = 
                Math.sin(dLat/2) * Math.sin(dLat/2) +
                Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
                Math.sin(dLon/2) * Math.sin(dLon/2); 
            const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)); 
            return R * c; 
        }

        const getUserLocationSilently = async () => {
            try {
                if (navigator.permissions && window.isSecureContext) {
                    const perm = await navigator.permissions.query({name: 'geolocation'});
                    if (perm.state === 'granted') {
                        return new Promise((resolve) => {
                            navigator.geolocation.getCurrentPosition(
                                (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
                                () => resolve(null),
                                { timeout: 3000, maximumAge: 600000 }
                            );
                        });
                    }
                }
                const res = await fetch('https://ipapi.co/json/');
                const data = await res.json();
                if (data && data.latitude && data.longitude) {
                    return { lat: data.latitude, lng: data.longitude };
                }
                return null;
            } catch (e) {
                return null;
            }
        };

        // Fetch Featured Facilities
        async function fetchFeaturedFacilities(retryCount = 0) {
            const grid = document.getElementById('featured-facilities-grid');
            if (!grid) return;

            // Only show spinner on first load
            if (retryCount === 0) {
                grid.innerHTML = '<div class="col-span-full flex justify-center py-12"><i class="fa-solid fa-spinner fa-spin text-primary text-3xl"></i></div>';
            }

            try {
                const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                // Fetch all to sort dynamically based on user location
                const response = await fetch(`${API_BASE_URL}/api/facilities`, { 
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Accept': 'application/json',
                        'Content-Type': 'application/json',
                        'X-Requested-With': 'XMLHttpRequest'
                    },
                    body: JSON.stringify({})
                });
                if (!response.ok) throw new Error(`Server returned ${response.status}: ${response.statusText}`);
                
                const text = await response.text();
                if (!text) throw new Error("Server returned an empty response.");
                
                let facilities;
                try {
                    facilities = JSON.parse(text);
                } catch(e) {
                    console.error("Payload that failed to parse:", text.substring(0, 500));
                    throw new Error("Invalid format received from server.");
                }
                grid.innerHTML = ''; // clear loading state
                
                // Fetch user location without aggressive prompting
                const loc = await getUserLocationSilently();
                const userLat = loc ? loc.lat : null;
                const userLng = loc ? loc.lng : null;

                // Compute distances
                facilities.forEach(f => {
                    f.distance = getDistance(userLat, userLng, f.lat, f.lng);
                });

                // Sort facilities based on business rules
                facilities.sort((a, b) => {
                    if (userLat && userLng) {
                        // Priority 1: Distance grouped into 10km radius buckets
                        const bucketA = Math.floor(a.distance / 10);
                        const bucketB = Math.floor(b.distance / 10);
                        if (bucketA !== bucketB) {
                            return bucketA - bucketB;
                        }
                    }

                    // Priority 2: Has a discount
                    const aDiscount = a.active_promotions ? 1 : 0;
                    const bDiscount = b.active_promotions ? 1 : 0;
                    if (aDiscount !== bDiscount) {
                        return bDiscount - aDiscount; 
                    }

                    // Priority 3: Base price (cheapest first)
                    return a.base_price - b.base_price;
                });
                
                // Get exactly 3 or fewer dynamically ordered listings
                const featured = facilities.slice(0, 3);
                
                featured.forEach(facility => {
                    const isInstantBook = facility.is_instant_book === 1;
                    
                    let topBadges = '<div class="absolute top-4 right-4 flex gap-2 z-20">';
                    if (facility.active_promotions) {
                        topBadges += `<div class="bg-red-500/90 backdrop-blur px-3 py-1 rounded-full text-sm font-bold text-white shadow-sm flex items-center"><i class="fa-solid fa-tag mr-1"></i> Promo</div>`;
                    }
                    if (isInstantBook) {
                        topBadges += `<div class="bg-primary/90 backdrop-blur px-3 py-1 rounded-full text-sm font-bold text-white shadow-sm">Instant Book</div>`;
                    }
                    topBadges += '</div>';

                    const typeDisplay = facility.type.charAt(0).toUpperCase() + facility.type.slice(1);
                    const envDisplay = facility.environment.charAt(0).toUpperCase() + facility.environment.slice(1);

                    function getPrimaryImageUrl(urlStr) {
                        try {
                            const parsed = JSON.parse(urlStr);
                            if (Array.isArray(parsed) && parsed.length > 0) return parsed[0];
                        } catch (e) {
                            // not json, return string directly
                        }
                        return urlStr || 'https://images.unsplash.com/photo-1518605368461-1ee0ab24b829?ixlib=rb-4.0.3&auto=format&fit=crop&w=1400&q=80';
                    }

                    const card = `
                        <!-- Facility Card -->
                        <div class="bg-white rounded-3xl overflow-hidden shadow-soft border border-slate-100 group cursor-pointer" onclick="window.location.href='facility.html?id=${facility.id}'">
                            <div class="relative h-64 hover-zoom-img-container">
                                <img src="${getPrimaryImageUrl(facility.image_url)}" alt="${facility.name}" class="w-full h-full object-cover bg-slate-100">
                                <div class="absolute top-4 left-4 bg-white/90 backdrop-blur px-3 py-1 rounded-full text-sm font-bold text-slate-800 shadow-sm z-20">
                                    <i class="fa-solid fa-star text-yellow-400 mr-1"></i> ${facility.rating} (${facility.reviews_count})
                                </div>
                                ${topBadges}
                                <button class="absolute bottom-4 right-4 w-10 h-10 bg-white rounded-full flex items-center justify-center shadow-md text-slate-400 hover:text-red-500 hover:scale-110 transition-custom z-10">
                                    <i class="fa-regular fa-heart"></i>
                                </button>
                            </div>
                            <div class="p-6">
                                <div class="flex justify-between items-start mb-2">
                                    <h3 class="text-xl font-bold text-dark group-hover:text-primary transition-custom notranslate">${facility.name}</h3>
                                    <span class="font-bold text-lg text-dark">From $${facility.base_price}<span class="text-sm font-normal text-slate-500">/hr</span></span>
                                </div>
                                <p class="text-slate-500 mb-4 flex items-center text-sm">
                                    <i class="fa-solid fa-location-dot mr-2 text-slate-400"></i> ${facility.location}
                                </p>
                                <div class="flex flex-wrap gap-2 mb-6">
                                    <span class="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold">${typeDisplay}</span>
                                    <span class="px-2.5 py-1 bg-slate-100 text-slate-600 rounded-lg text-xs font-semibold">${envDisplay}</span>
                                </div>
                                <div class="flex items-center justify-between border-t border-slate-100 pt-4">
                                    <div class="flex gap-2">
                                        ${facility.display_slots_today && facility.display_slots_today.length > 0 ? facility.display_slots_today.map(slot => `
                                            <div class="px-2 py-1 bg-slate-50 border border-slate-200 rounded text-xs font-bold ${slot.discount ? 'text-red-600 bg-red-50 border-red-200' : 'text-slate-600'}">
                                                ${slot.time}${slot.discount ? '<i class="fa-solid fa-tag text-[10px] ml-1"></i>' : ''}
                                            </div>
                                        `).join('') : `
                                            <div class="text-xs font-medium text-slate-400">Fully booked for today</div>
                                        `}
                                    </div>
                                    ${facility.display_slots_today && facility.display_slots_today.length > 0 ? `
                                        <span class="text-sm font-semibold ${isInstantBook ? 'text-primary' : 'text-slate-500'}">Available Today</span>
                                    ` : ''}
                                </div>
                            </div>
                        </div>
                    `;
                    grid.innerHTML += card;
                });

            } catch (error) {
                console.error(`Failed to load featured facilities (Attempt ${retryCount + 1}):`, error);
                
                const MAX_RETRIES = 3;
                if (retryCount < MAX_RETRIES) {
                    const delay = (retryCount + 1) * 2000; // 2s, 4s, 6s
                    console.log(`Retrying in ${delay/1000}s...`);
                    // Create subtle loading pulse while retrying silently
                    if (retryCount === 0) {
                        grid.innerHTML = '<div class="col-span-full flex flex-col items-center justify-center py-12 text-slate-400"><i class="fa-solid fa-cloud-arrow-down animate-bounce text-xl mb-3"></i><p class="text-sm font-medium">Waking up server...</p></div>';
                    }
                    setTimeout(() => fetchFeaturedFacilities(retryCount + 1), delay);
                    return;
                }

                 grid.innerHTML = `
                    <div class="col-span-full bg-slate-50 border border-slate-100 text-slate-500 p-8 rounded-2xl text-center">
                        <i class="fa-solid fa-calendar-xmark text-4xl mb-3 text-slate-300"></i>
                        <h3 class="text-xl font-bold text-dark mb-2">Temporarily Unavailable</h3>
                        <p>We're having trouble connecting to the database right now (server timeout or network policy).</p>
                        <button onclick="fetchFeaturedFacilities(0)" class="mt-4 px-6 py-2 bg-white border border-slate-200 rounded-lg font-semibold hover:bg-slate-50 transition-custom shadow-sm text-sm">Try Again</button>
                    </div>
                `;
            }
        }

        // Initialize features
        fetchFeaturedFacilities();

        // Homepage Search Submission Logic
        const homeSearchBtn = document.getElementById('homeSearchBtn');
        if (homeSearchBtn) {
            homeSearchBtn.addEventListener('click', () => {
                const searchInputVal = document.getElementById('locationSearch').value;
                const typeSelect = document.querySelector('select').value;
                const dateVal = document.getElementById('homeDateSearch').value;
                
                const params = new URLSearchParams();
                if (searchInputVal) params.append('location', searchInputVal);
                if (typeSelect) params.append('type', typeSelect);
                if (dateVal) params.append('date', dateVal);
                
                window.location.href = `search.html?${params.toString()}`;
            });
        }

        const homeLocateBtn = document.getElementById('home-locate-me-btn');
        if (homeLocateBtn) {
            homeLocateBtn.addEventListener('click', (e) => {
                e.preventDefault();
                const icon = homeLocateBtn.querySelector('i');
                const searchInput = document.getElementById('locationSearch');
                
                if ("geolocation" in navigator && window.isSecureContext) {
                    icon.className = 'fa-solid fa-spinner fa-spin';
                    navigator.geolocation.getCurrentPosition(
                        async (position) => {
                            try {
                                const lat = position.coords.latitude;
                                const lng = position.coords.longitude;
                                const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=10`);
                                const data = await res.json();
                                if (data && data.address) {
                                    const city = data.address.city || data.address.town || data.address.village || data.address.county || "Current Location";
                                    searchInput.value = city;
                                    homeSearchBtn.click();
                                } else {
                                    searchInput.value = 'Current Location';
                                    homeSearchBtn.click();
                                }
                            } catch (err) {
                                searchInput.value = 'Current Location';
                                homeSearchBtn.click();
                            } finally {
                                icon.className = 'fa-solid fa-location-crosshairs';
                            }
                        },
                        (error) => {
                            alert("Location access denied or unavailable. Please enter your location manually.");
                            icon.className = 'fa-solid fa-location-crosshairs';
                        }
                    );
                } else {
                    alert("Exact GPS location is blocked by your browser on this connection. Please enter your location manually.");
                }
            });
        }

        // Auth Modal Logic
        const authModal = document.getElementById('auth-modal');
        const loginBtn = document.getElementById('login-btn');
        const mobileLoginBtn = document.getElementById('mobile-login-btn');
        const closeAuthBtn = document.getElementById('close-auth-btn');
        const authBackdrop = document.getElementById('auth-backdrop');
        const authToggleBtn = document.getElementById('auth-toggle-btn');
        const authTitle = document.getElementById('auth-title');
        const authToggleText = document.getElementById('auth-toggle-text');
        const nameFieldContainer = document.getElementById('name-field-container');
        const reqs = document.getElementById('password-requirements');
        const confContainer = document.getElementById('confirm-password-container');
        
        const firstNameInput = document.getElementById('auth-first-name');
        const lastNameInput = document.getElementById('auth-last-name');
        const phoneInput = document.getElementById('auth-phone-number');
        const confInput = document.getElementById('auth-confirm-password');
        
        const forgotPasswordContainer = document.getElementById('forgot-password-container');
        
        let isLoginMode = true;

        function toggleAuthMode(e) {
            e.preventDefault();
            isLoginMode = !isLoginMode;
            if (isLoginMode) {
                authTitle.textContent = "Log in or sign up";
                authToggleText.textContent = "Don't have an account?";
                authToggleBtn.textContent = "Sign up";
                nameFieldContainer.classList.add('hidden');
                reqs.classList.add('hidden');
                confContainer.classList.add('hidden');
                document.getElementById('auth-residency-container').classList.add('hidden');
                if(forgotPasswordContainer) forgotPasswordContainer.classList.remove('hidden');
                firstNameInput.required = false;
                lastNameInput.required = false;
                phoneInput.required = false;
                confInput.required = false;
            } else {
                authTitle.textContent = "Sign up";
                authToggleText.textContent = "Already have an account?";
                authToggleBtn.textContent = "Log in";
                nameFieldContainer.classList.remove('hidden');
                reqs.classList.remove('hidden');
                confContainer.classList.remove('hidden');
                const selectedRole = document.querySelector('input[name="auth-role"]:checked');
                if (selectedRole && selectedRole.value === 'player') {
                    document.getElementById('auth-residency-container').classList.remove('hidden');
                    document.getElementById('auth-surfaces-container').classList.remove('hidden');
                } else {
                    document.getElementById('auth-residency-container').classList.add('hidden');
                    document.getElementById('auth-surfaces-container').classList.add('hidden');
                }
                if(forgotPasswordContainer) forgotPasswordContainer.classList.add('hidden');
                firstNameInput.required = true;
                lastNameInput.required = true;
                phoneInput.required = true;
                confInput.required = true;
            }
        }

        function openAuthModal(e) {
            e.preventDefault();
            authModal.classList.remove('hidden');
            authModal.classList.add('flex');
            document.body.style.overflow = 'hidden';
            
            // Close mobile menu if open
            const mobileMenu = document.getElementById('mobile-menu');
            if (mobileMenu) mobileMenu.classList.add('hidden');
        }

        function closeAuthModal() {
            authModal.classList.add('hidden');
            authModal.classList.remove('flex');
            document.body.style.overflow = '';
        }

        if (loginBtn) loginBtn.addEventListener('click', openAuthModal);
        if (mobileLoginBtn) mobileLoginBtn.addEventListener('click', openAuthModal);
        if (closeAuthBtn) closeAuthBtn.addEventListener('click', closeAuthModal);
        if (authBackdrop) authBackdrop.addEventListener('click', closeAuthModal);
        if (authToggleBtn) authToggleBtn.addEventListener('click', toggleAuthMode);

        const roleRadios = document.querySelectorAll('input[name="auth-role"]');
        const companyContainer = document.getElementById('company-name-container');
        const companyInput = document.getElementById('auth-company-name');
        
        roleRadios.forEach(radio => {
            radio.addEventListener('change', (e) => {
                if (e.target.value === 'host') {
                    companyContainer.classList.remove('hidden');
                    // Reset required fields validation
                    const hostType = document.getElementById('auth-host-type');
                    if (hostType && hostType.value === 'private') {
                        companyInput.required = true;
                        document.getElementById('auth-host-city').required = false;
                    } else if (hostType && hostType.value === 'public') {
                        companyInput.required = false;
                        document.getElementById('auth-host-city').required = true;
                    }
                    document.getElementById('auth-residency-container').classList.add('hidden');
                    document.getElementById('auth-surfaces-container').classList.add('hidden');
                } else {
                    companyContainer.classList.add('hidden');
                    companyInput.required = false;
                    document.getElementById('auth-residency-container').classList.remove('hidden');
                    document.getElementById('auth-surfaces-container').classList.remove('hidden');
                }
            });
        });

        const authHostType = document.getElementById('auth-host-type');
        if (authHostType) {
            authHostType.addEventListener('change', (e) => {
                if (e.target.value === 'public') {
                    document.getElementById('private-fields').classList.add('hidden');
                    document.getElementById('public-fields').classList.remove('hidden');
                    companyInput.required = false;
                    document.getElementById('auth-host-city').required = true;
                } else {
                    document.getElementById('private-fields').classList.remove('hidden');
                    document.getElementById('public-fields').classList.add('hidden');
                    companyInput.required = true;
                    document.getElementById('auth-host-city').required = false;
                }
            });
        }

        const passwordInput = document.getElementById('auth-password');
        const togglePasswordBtn = document.getElementById('toggle-password-btn');
        const togglePasswordIcon = document.getElementById('toggle-password-icon');

        if (togglePasswordBtn) {
            togglePasswordBtn.addEventListener('click', function() {
                // Toggle the type attribute
                const type = passwordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                passwordInput.setAttribute('type', type);
                
                // Toggle the eye icon
                if (type === 'password') {
                    togglePasswordIcon.classList.remove('fa-eye-slash');
                    togglePasswordIcon.classList.add('fa-eye');
                } else {
                    togglePasswordIcon.classList.remove('fa-eye');
                    togglePasswordIcon.classList.add('fa-eye-slash');
                }
            });
        }

        const confirmPasswordInput = document.getElementById('auth-confirm-password');
        const toggleConfirmPasswordBtn = document.getElementById('toggle-confirm-password-btn');
        const toggleConfirmPasswordIcon = document.getElementById('toggle-confirm-password-icon');

        function previewProfilePic(event) {
            const input = event.target;
            const preview = document.getElementById('profile-pic-preview');
            const icon = document.getElementById('profile-pic-icon');
            
            if (input.files && input.files[0]) {
                const reader = new FileReader();
                reader.onload = function(e) {
                    preview.src = e.target.result;
                    preview.classList.remove('hidden');
                    icon.classList.add('hidden');
                }
                reader.readAsDataURL(input.files[0]);
            } else {
                preview.src = "";
                preview.classList.add('hidden');
                icon.classList.remove('hidden');
            }
        }

        function previewResidencyDoc(event) {
            const input = event.target;
            const nameDisplay = document.getElementById('auth-residency-doc-name');
            const btn = document.getElementById('auth-residency-doc-btn');
            
            if (input.files && input.files[0]) {
                nameDisplay.textContent = input.files[0].name;
                btn.classList.add('bg-green-100', 'text-green-700', 'border', 'border-green-300');
                btn.classList.remove('bg-primary/10', 'text-primary');
                btn.innerHTML = '<i class="fa-solid fa-check mr-2"></i> Selected';
            } else {
                nameDisplay.textContent = '';
                btn.classList.remove('bg-green-100', 'text-green-700', 'border', 'border-green-300');
                btn.classList.add('bg-primary/10', 'text-primary');
                btn.innerHTML = '<i class="fa-solid fa-file-arrow-up mr-2"></i> Upload Document';
            }
        }
        
        const authMunicipalitySearch = document.getElementById('auth-municipality-search');
        const authResidencyDocUpload = document.getElementById('auth-residency-doc-upload');

        function updateResidencyDocVisibility(idValue) {
            if (idValue) {
                authResidencyDocUpload.classList.remove('hidden');
            } else {
                authResidencyDocUpload.classList.add('hidden');
            }
        }

        // We initialize Google Maps Autocomplete for this input in initMap() or globally if loaded.
        // The residency file upload reveals whenever there is text in the municipality field.
        if (authMunicipalitySearch) {
            authMunicipalitySearch.addEventListener('input', (e) => {
                updateResidencyDocVisibility(e.target.value.trim());
            });
            // Initial check
            updateResidencyDocVisibility(authMunicipalitySearch.value.trim());
        }

        // Interested Surfaces select logic
        const surfaceBoxes = document.querySelectorAll('.surface-box');
        const interestedSurfacesInput = document.getElementById('auth-interested-surfaces');
        
        surfaceBoxes.forEach(box => {
            box.addEventListener('click', () => {
                box.classList.toggle('ring-2');
                box.classList.toggle('ring-primary');
                box.classList.toggle('bg-primary/5');
                
                const iconContainer = box.querySelector('div.bg-white');
                if (iconContainer) {
                    iconContainer.classList.toggle('text-primary');
                }
                
                let selected = [];
                try { selected = JSON.parse(interestedSurfacesInput.value); } catch(e){}
                
                const surfaceType = box.getAttribute('data-surface');
                if (box.classList.contains('ring-primary')) {
                    if (!selected.includes(surfaceType)) selected.push(surfaceType);
                } else {
                    selected = selected.filter(s => s !== surfaceType);
                }
                
                interestedSurfacesInput.value = JSON.stringify(selected);
            });
        });

        if (toggleConfirmPasswordBtn) {
            toggleConfirmPasswordBtn.addEventListener('click', function() {
                const type = confirmPasswordInput.getAttribute('type') === 'password' ? 'text' : 'password';
                confirmPasswordInput.setAttribute('type', type);
                
                if (type === 'password') {
                    toggleConfirmPasswordIcon.classList.remove('fa-eye-slash');
                    toggleConfirmPasswordIcon.classList.add('fa-eye');
                } else {
                    toggleConfirmPasswordIcon.classList.remove('fa-eye');
                    toggleConfirmPasswordIcon.classList.add('fa-eye-slash');
                }
            });
        }

        const authForm = document.getElementById('auth-form');
        const authError = document.getElementById('auth-error');
        const authSubmitBtn = document.getElementById('auth-submit-btn');

        async function handleAuth(e) {
            e.preventDefault();
            const email = document.getElementById('auth-email').value;
            const password = document.getElementById('auth-password').value;
            
            const first_name = document.getElementById('auth-first-name') ? document.getElementById('auth-first-name').value : '';
            const last_name = document.getElementById('auth-last-name') ? document.getElementById('auth-last-name').value : '';
            const phone_number = document.getElementById('auth-phone-number') ? document.getElementById('auth-phone-number').value : '';
            const confirm_password = document.getElementById('auth-confirm-password') ? document.getElementById('auth-confirm-password').value : '';

            authError.classList.add('hidden');

            let role_choice = 'player';
            let company_name = '';
            let profile_picture = null;
            let municipality_id = null;
            let residency_document_url = null;

            if (!isLoginMode) {
                const selectedRole = document.querySelector('input[name="auth-role"]:checked');
                if (selectedRole) role_choice = selectedRole.value;
                company_name = document.getElementById('auth-company-name') ? document.getElementById('auth-company-name').value : '';

                if (role_choice === 'host') {
                    const hostType = document.getElementById('auth-host-type');
                    if (hostType && hostType.value === 'public') {
                        const cityVal = document.getElementById('auth-host-city') ? document.getElementById('auth-host-city').value : '';
                        const adminChecked = document.getElementById('auth-host-admin-check') ? document.getElementById('auth-host-admin-check').checked : false;
                        
                        if (!cityVal.trim() || !adminChecked) {
                            authError.textContent = "Please select a municipality and confirm you are the main administrator.";
                            authError.classList.remove('hidden');
                            return;
                        }
                        company_name = cityVal.trim();
                    } else {
                        company_name = document.getElementById('auth-company-name') ? document.getElementById('auth-company-name').value : '';
                        if (!company_name.trim()) {
                            authError.textContent = "Company / Private Arena name is required for facility owners.";
                            authError.classList.remove('hidden');
                            return;
                        }
                    }
                }

                if (password !== confirm_password) {
                    authError.textContent = "Passwords do not match.";
                    authError.classList.remove('hidden');
                    return;
                }
                const passwordRegex = /^(?=.*[A-Z])(?=.*\d).{8,}$/;
                if (!passwordRegex.test(password)) {
                    authError.textContent = "Password must be at least 8 characters long, and contain at least 1 number and 1 uppercase letter.";
                    authError.classList.remove('hidden');
                    return;
                }

                const profilePicInput = document.getElementById('auth-profile-pic');
                if (profilePicInput && profilePicInput.files.length > 0) {
                    try {
                        profile_picture = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(profilePicInput.files[0]);
                        });
                    } catch (e) {
                         authError.textContent = "Error reading profile picture.";
                         authError.classList.remove('hidden');
                         return;
                    }
                }
                
                if (role_choice === 'player' && authMunicipalitySearch && authMunicipalitySearch.value.trim() !== '') {
                    const docInput = document.getElementById('auth-residency-doc');
                    if (!docInput || docInput.files.length === 0) {
                        authError.textContent = "Please upload a proof of residency document.";
                        authError.classList.remove('hidden');
                        return;
                    }
                    try {
                        residency_document_url = await new Promise((resolve, reject) => {
                            const reader = new FileReader();
                            reader.onload = () => resolve(reader.result);
                            reader.onerror = reject;
                            reader.readAsDataURL(docInput.files[0]);
                        });
                    } catch (e) {
                         authError.textContent = "Error reading residency document.";
                         authError.classList.remove('hidden');
                         return;
                    }
                }
            }

            const originalText = authSubmitBtn.textContent;
            authSubmitBtn.textContent = 'Processing...';
            authSubmitBtn.disabled = true;

            try {
                const endpoint = isLoginMode ? '/api/auth/login' : '/api/users/signup';
                let interestedSurfaces = [];
                const surfacesInput = document.getElementById('auth-interested-surfaces');
                if (surfacesInput) {
                    try { interestedSurfaces = JSON.parse(surfacesInput.value); } catch(e){}
                }

                const body = isLoginMode ? { email, password } : { first_name, last_name, phone_number, email, password, role_choice, company_name, profile_picture, residency_city: authMunicipalitySearch ? authMunicipalitySearch.value.trim() : null, residency_document_url, interestedSurfaces };

                const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                
                const res = await fetch(`${API_BASE_URL}${endpoint}`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body),
                    credentials: 'include' // Changed from same-origin to establish secure session across ports
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.error || 'Authentication failed');
                }

                // Success - Since we might be on file://, we also save user in localStorage
                (function(){ const _u = {...data.user}; delete _u.profile_picture; localStorage.setItem('gg_user', JSON.stringify(_u)); })();
                
                const urlParams = new URLSearchParams(window.location.search);
                const redirectUrl = urlParams.get('redirect');
                if (redirectUrl) {
                    window.location.href = redirectUrl;
                    return;
                }
                
                closeAuthModal();
                updateUserUI(data.user);
                
            } catch (err) {
                authError.textContent = err.message;
                authError.classList.remove('hidden');
            } finally {
                authSubmitBtn.textContent = originalText;
                authSubmitBtn.disabled = false;
            }
        }



        async function checkAuthState() {
            // First check local storage for quick render
            const storedUser = localStorage.getItem('gg_user');
            if (storedUser) {
                try {
                    updateUserUI(JSON.parse(storedUser));
                } catch(e){}
            }
            
            // Then optionally verify with backend if we wanted to
            try {
                const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                const res = await fetch(`${API_BASE_URL}/api/auth/me`, { credentials: 'include' });
                if (res.ok) {
                    const data = await res.json();
                    updateUserUI(data.user);
                    (function(){ const _u = {...data.user}; delete _u.profile_picture; localStorage.setItem('gg_user', JSON.stringify(_u)); })();
                } else if (res.status === 401) {
                    localStorage.removeItem('gg_user');
                    localStorage.removeItem('user');
                    updateUserUI(null);
                }
            } catch (e) {
                // Ignore
            }
        }

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
                            badge.className = 'host-notification-badge absolute -top-2 -right-2 bg-red-500 text-white text-[10px] font-bold w-5 h-5 flex items-center justify-center rounded-full border-2 border-white shadow-sm';
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

        function updateUserUI(user) {
            const listBtn = document.getElementById('list-facility-btn');
            const mobileListBtn = document.getElementById('mobile-list-facility-btn');

            if (user) {
                if (loginBtn) {
                    loginBtn.innerHTML = `Hi, ${user.name} <span class="text-xs text-slate-400 ml-1 cursor-pointer hover:text-red-500" id="logout-btn">(Log out)</span>`;
                    loginBtn.removeEventListener('click', openAuthModal);
                    const logoutBtn = document.getElementById('logout-btn');
                    if (logoutBtn) logoutBtn.addEventListener('click', handleLogout);
                }
                if (mobileLoginBtn) {
                    mobileLoginBtn.textContent = `Hi, ${user.name}`;
                    mobileLoginBtn.removeEventListener('click', openAuthModal);
                }
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
                if (mobileListBtn) {
                    if (user.role === 'admin') {
                        mobileListBtn.textContent = "Admin Dashboard";
                        mobileListBtn.href = "admin-dashboard.html";
                    } else if (user.role === 'host') {
                        mobileListBtn.textContent = "Host Dashboard";
                        mobileListBtn.href = "owner-dashboard.html";
                        mobileListBtn.classList.add('relative');
                        checkHostNotifications(mobileListBtn);
                    } else {
                        mobileListBtn.textContent = "My Bookings";
                        mobileListBtn.href = "player-dashboard.html";
                    }
                }
                
                const mobileProfileBtn = document.getElementById('mobile-bottom-profile-btn');
                if (mobileProfileBtn) {
                    const profileHref = user.role === 'admin' ? 'admin-dashboard.html' : (user.role === 'host' ? 'owner-dashboard.html' : 'player-dashboard.html');
                    mobileProfileBtn.onclick = null;
                    mobileProfileBtn.href = profileHref;
                    mobileProfileBtn.innerHTML = `
                        <i class="fa-solid fa-user-check text-xl mb-1 pb-0.5 text-primary"></i>
                        <span class="text-[10px] font-medium text-primary">Profile</span>
                    `;
                }
                
                // Update puck UI for logged in user
                const puckIcon = document.getElementById('puck-icon');
                const puckInitials = document.getElementById('puck-initials');
                const puckImg = document.getElementById('puck-img');
                const puckLoggedOut = document.getElementById('puck-logged-out');
                const puckLoggedIn = document.getElementById('puck-logged-in');
                const puckName = document.getElementById('puck-name');
                const puckEmail = document.getElementById('puck-email');
                const puckDashboard = document.getElementById('puck-dashboard');
                
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

            } else {
                if (loginBtn) {
                    loginBtn.textContent = "Log in";
                    loginBtn.addEventListener('click', openAuthModal);
                }
                if (mobileLoginBtn) {
                    mobileLoginBtn.textContent = "Log in";
                    mobileLoginBtn.addEventListener('click', openAuthModal);
                }
                if (listBtn) listBtn.textContent = "List Your Facility";
                if (mobileListBtn) mobileListBtn.textContent = "List Your Facility";
                
                const mobileProfileBtn = document.getElementById('mobile-bottom-profile-btn');
                if (mobileProfileBtn) {
                    mobileProfileBtn.onclick = function(e){ e.preventDefault(); window.location.href='index.html?login=true'; };
                    mobileProfileBtn.href = "#";
                    mobileProfileBtn.innerHTML = `
                        <i class="fa-regular fa-user text-xl mb-1 pb-0.5"></i>
                        <span class="text-[10px] font-medium">Log in</span>
                    `;
                }

                // Update puck UI for logged out user
                const puckIcon = document.getElementById('puck-icon');
                const puckInitials = document.getElementById('puck-initials');
                const puckImg = document.getElementById('puck-img');
                const puckLoggedOut = document.getElementById('puck-logged-out');
                const puckLoggedIn = document.getElementById('puck-logged-in');

                if (puckIcon) puckIcon.classList.remove('hidden');
                if (puckInitials) puckInitials.classList.add('hidden');
                if (puckImg) puckImg.classList.add('hidden');
                if (puckLoggedOut) puckLoggedOut.classList.remove('hidden');
                if (puckLoggedIn) puckLoggedIn.classList.add('hidden');
            }
        }

        async function handleLogout(e) {
            if (e) e.preventDefault();
            try {
                const API_BASE_URL = (window.location.protocol === 'file:') ? 'http://localhost:3000' : '';
                await fetch(`${API_BASE_URL}/api/auth/logout`, { method: 'POST', credentials: 'include' });
            } catch(e) {}
            localStorage.removeItem('gg_user');
            updateUserUI(null);
            window.location.reload();
        }

        checkAuthState();

        const globalUrlParams = new URLSearchParams(window.location.search);
        if (globalUrlParams.get('login') === 'true') {
            if (globalUrlParams.get('signup') === 'true') {
                toggleAuthMode({ preventDefault: () => {} });
            }
            openAuthModal({ preventDefault: () => {} });
        }

    </script>
    <script>
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
                        if (puckProfile) puckProfile.href = 'player-dashboard.html';
                    }
                } catch(e) {}
            }
        });
    </script>
    <script>
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
                            puckProfile.href = 'player-dashboard.html';
                            puckProfile.removeAttribute('onclick');
                        }
                    }
                } catch(e) {}
            }
        });
    </script>
