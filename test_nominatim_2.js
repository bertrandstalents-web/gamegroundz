async function test(query) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=10&countrycodes=us,ca`, {
        headers: {
            'User-Agent': 'GameGroundz Test Script (test@gamegroundz.com)'
        }
    });
    const text = await res.text();
    try {
        const data = JSON.parse(text);
        
        console.log(`\n--- Results for: ${query} ---`);
        const seen = new Set();
        let addedCount = 0;

        data.forEach((item, i) => {
            let mainName = item.name || (item.address ? (item.address.city || item.address.town || item.address.village || item.address.municipality) : '') || item.display_name.split(',')[0];
            mainName = mainName.replace(/\s*\(région administrative\)/i, '').trim();

            let parts = [mainName];
            if (item.address) {
                let state = item.address.state || '';
                const stateMap = {
                    'Québec':'QC', 'Quebec':'QC', 'Ontario':'ON', 'British Columbia':'BC', 'Colombie-Britannique':'BC', 
                    'Alberta':'AB', 'Manitoba':'MB', 'Saskatchewan':'SK', 'Nova Scotia':'NS', 'Nouvelle-Écosse':'NS', 
                    'New Brunswick':'NB', 'Nouveau-Brunswick':'NB', 'Newfoundland and Labrador':'NL', 'Terre-Neuve-et-Labrador':'NL', 
                    'Prince Edward Island':'PE', 'Île-du-Prince-Édouard':'PE', 'New York':'NY', 'California':'CA'
                };
                let mappedState = stateMap[state] || state;

                // Add state if it's not a state itself and it's not the same as mainName
                if (item.addresstype !== 'state' && item.addresstype !== 'country' && mappedState && mappedState !== mainName) {
                    parts.push(mappedState);
                }
                
                let country = item.address.country || '';
                if (country.toLowerCase() === 'canada') country = 'Canada';
                if (country.toLowerCase() === 'united states' || country.toLowerCase() === 'united states of america') country = 'USA';
                
                if (item.addresstype !== 'country' && country && !parts.includes(country)) {
                     // Optionally include country. Let's include it to be consistent with existing app behavior unless asked otherwise. 
                     // Users might search for US locations. Airbnb drops country when it's implied, but we can keep it.
                     parts.push(country);
                }
            }
            let displayName = parts.join(', ');

            if (!seen.has(displayName) && addedCount < 5) {
                seen.add(displayName);
                addedCount++;
                console.log(`[ALLOWED] ${displayName}`);
            } else if (seen.has(displayName)) {
               // console.log(`[DEDUPLICATED] ${displayName}`);
            }
        });
    } catch (e) {
        console.error("Failed to parse", e);
    }
}

async function run() {
    await test('quebec');
    await test('blainville');
    await test('montreal');
}
run();
