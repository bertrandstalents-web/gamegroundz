async function test(query) {
    const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query)}&addressdetails=1&limit=5&countrycodes=us,ca`, {
        headers: {
            'User-Agent': 'GameGroundz Test Script (test@gamegroundz.com)'
        }
    });
    const text = await res.text();
    try {
        const data = JSON.parse(text);
        console.log(`\n--- Results for: ${query} ---`);
        data.forEach((item, i) => {
            console.log(`\nResult ${i + 1}:`);
            console.log(`  Name: ${item.name}`);
            console.log(`  Class: ${item.class}, Type: ${item.type}, AddrType: ${item.addresstype}`);
            console.log(`  Address:`, item.address);
            console.log(`  Display_name: ${item.display_name}`);
        });
    } catch (e) {
        console.error("Failed to parse JSON for", query, ": ", text);
    }
}

async function run() {
    await test('quebec');
    await test('blainville');
}
run();
