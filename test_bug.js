const data = [{"place_id":337501287,"licence":"Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright","osm_type":"way","osm_id":143429378,"lat":"45.6638295","lon":"-73.8306332","class":"highway","type":"residential","place_rank":26,"importance":0.053386382085908256,"addresstype":"road","name":"Rue de Talcy","display_name":"Rue de Talcy, Blainville, Thérèse-De Blainville, Laurentides, Québec, J7B 1P4, Canada","address":{"road":"Rue de Talcy","town":"Blainville","county":"Thérèse-De Blainville","state_district":"Laurentides","state":"Québec","ISO3166-2-lvl4":"CA-QC","postcode":"J7B 1P4","country":"Canada","country_code":"ca"},"boundingbox":["45.6629952","45.6641557","-73.8322460","-73.8292310"]},{"place_id":337471803,"licence":"Data © OpenStreetMap contributors, ODbL 1.0. http://osm.org/copyright","osm_type":"way","osm_id":1086780689,"lat":"45.6639596","lon":"-73.8331751","class":"highway","type":"residential","place_rank":26,"importance":0.053386382085908256,"addresstype":"road","name":"Rue de Talcy","display_name":"Rue de Talcy, Blainville, Thérèse-De Blainville, Laurentides, Québec, J7C 5T2, Canada","address":{"road":"Rue de Talcy","town":"Blainville","county":"Thérèse-De Blainville","state_district":"Laurentides","state":"Québec","ISO3166-2-lvl4":"CA-QC","postcode":"J7C 5T2","country":"Canada","country_code":"ca"},"boundingbox":["45.6632294","45.6647980","-73.8343802","-73.8322460"]}];

const val = "40 rue de Talcy, Blainville, Qc";

try {
    const seen = new Set();
    let addedCount = 0;
    
    data.forEach(item => {
        if (addedCount >= 5) return;
        
        let parts = [];
        
        if (item.address) {
            let street = '';
            if (item.address.house_number) street += item.address.house_number + ' ';
            if (item.address.road) street += item.address.road;
            street = street.trim();
            
            let name = item.name ? item.name.replace(/\s*\(région administrative\)/i, '').trim() : '';
            if (name && 
                name !== street && 
                name !== item.address.road && 
                name !== item.address.city && 
                name !== item.address.town && 
                name !== item.address.village && 
                name !== item.address.state &&
                name !== item.address.country) {
                parts.push(name);
            }
            
            if (street) {
                parts.push(street);
            } else if (!parts.includes(name) && name) {
                parts.push(name);
            }
            
            let city = item.address.city || item.address.town || item.address.village || item.address.municipality || '';
            if (city && !parts.includes(city)) parts.push(city);
            
            let state = item.address.state || '';
            const stateMap = {'Québec':'QC', 'Quebec':'QC', 'Ontario':'ON', 'British Columbia':'BC', 'Colombie-Britannique':'BC', 'Alberta':'AB', 'Manitoba':'MB', 'Saskatchewan':'SK', 'Nova Scotia':'NS', 'Nouvelle-Écosse':'NS', 'New Brunswick':'NB', 'Nouveau-Brunswick':'NB', 'Newfoundland and Labrador':'NL', 'Terre-Neuve-et-Labrador':'NL', 'Prince Edward Island':'PE', 'Île-du-Prince-Édouard':'PE', 'New York':'NY', 'California':'CA'};
            let mappedState = stateMap[state] || state;
            
            let postcode = item.address.postcode || '';
            let stateZip = [];
            if (mappedState) stateZip.push(mappedState);
            if (postcode) stateZip.push(postcode);
            if (stateZip.length > 0) parts.push(stateZip.join(' '));
            
            let country = item.address.country || '';
            if (country.toLowerCase() === 'canada') country = 'Canada';
            if (country.toLowerCase() === 'united states' || country.toLowerCase() === 'united states of america') country = 'USA';
            if (country && !parts.includes(country)) parts.push(country);
        } else {
            parts.push(item.display_name);
        }
        
        let displayName = parts.join(', ');
        
        // Preserve house number if user typed it but Nominatim omitted it
        const userInputNumMatch = val.match(/^(\d+\S*)\s+/);
        if (userInputNumMatch) {
            const userNum = userInputNumMatch[1];
            if (!/^\d/.test(displayName)) {
                displayName = `${userNum} ${displayName}`;
            }
        }
        
        // Preserve postal code if user typed it
        const userPostcodeMatch = val.match(/[a-zA-Z]\d[a-zA-Z]\s?\d[a-zA-Z]\d/);
        const userZipMatch = val.match(/\b\d{5}(?:-\d{4})?\b/);
        if (userPostcodeMatch) {
            const pc = userPostcodeMatch[0].toUpperCase();
            if (/[a-zA-Z]\d[a-zA-Z]\s?\d[a-zA-Z]\d/.test(displayName)) {
                displayName = displayName.replace(/[a-zA-Z]\d[a-zA-Z]\s?\d[a-zA-Z]\d/g, pc);
            }
        } else if (userZipMatch) {
            const zip = userZipMatch[0];
            if (/\b\d{5}(?:-\d{4})?\b/.test(displayName)) {
                displayName = displayName.replace(/\b\d{5}(?:-\d{4})?\b/g, zip);
            }
        }
        
        // Deduplicate by ignoring postal code differences
        let dedupKey = displayName.replace(/[a-zA-Z]\d[a-zA-Z]\s?\d[a-zA-Z]\d/g, '').replace(/\b\d{5}(?:-\d{4})?\b/g, '').trim();
        
        if (seen.has(dedupKey)) return;
        seen.add(dedupKey);
        addedCount++;
        console.log("ADDED:", displayName);
    });
    console.log("addedCount:", addedCount);
} catch (error) {
    console.error("Geocoding error:", error);
}
