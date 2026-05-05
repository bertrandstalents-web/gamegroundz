const fs = require('fs');

function processFile(filename) {
    let content = fs.readFileSync(filename, 'utf8');
    
    // Custom replacements for specific files
    if (filename === 'owner-dashboard.html') {
        content = content.replace(/alert\("Stripe error: " \+ error\.message\);/g, 'showAlertModal("Stripe Error", error.message, "OK", true);');
        content = content.replace(/alert\('Still loading script, please wait a second\.'\);/g, 'showAlertModal("Notice", "Still loading script, please wait a second.");');
        content = content.replace(/alert\("Error: Facility ID is missing or invalid\. Please refresh the page\."\);/g, 'showAlertModal("Error", "Facility ID is missing or invalid. Please refresh the page.", "OK", true);');
        content = content.replace(/alert\("Error: Surface ID is missing or invalid\. Please select a valid surface or 'All Surfaces' and try again\."\);/g, 'showAlertModal("Error", "Surface ID is missing or invalid. Please select a valid surface or \'All Surfaces\' and try again.", "OK", true);');
        content = content.replace(/else alert\('Co-host invited successfully!'\);/g, 'else showAlertModal("Success", "Co-host invited successfully!");');
        content = content.replace(/else alert\(errData\.error \|\| 'Failed to add co-host'\);/g, 'else showAlertModal("Error", errData.error || "Failed to add co-host", "OK", true);');
        content = content.replace(/else alert\('Communication error'\);/g, 'else showAlertModal("Error", "Communication error", "OK", true);');
        content = content.replace(/else alert\('Failed to remove co-host'\);/g, 'else showAlertModal("Error", "Failed to remove co-host", "OK", true);');
        content = content.replace(/else alert\('Booking archived successfully'\);/g, 'else showAlertModal("Success", "Booking archived successfully");');
        content = content.replace(/else alert\(errData\.error \|\| 'Failed to archive booking'\);/g, 'else showAlertModal("Error", errData.error || "Failed to archive booking", "OK", true);');
        content = content.replace(/alert\("There was an error saving your acceptance\. Please try again\."\);/g, 'showAlertModal("Error", "There was an error saving your acceptance. Please try again.", "OK", true);');
        content = content.replace(/alert\(`Resident successfully \$\{action\}d\.`\);/g, 'showAlertModal("Success", `Resident successfully ${action}d.`);');
        content = content.replace(/alert\("Error scheduling residency update: " \+ err\.message\);/g, 'showAlertModal("Error", "Error scheduling residency update: " + err.message, "OK", true);');
        content = content.replace(/alert\('Error updating locker room\.'\);/g, 'showAlertModal("Error", "Error updating locker room.", "OK", true);');
        content = content.replace(/alert\("Please select a facility first before adding a surface\."\);/g, 'showAlertModal("Action Required", "Please select a facility first before adding a surface.", "Understood", true);');
        content = content.replace(/alert\("Error in openSurfaceModal: " \+ e\.message \+ "\\n" \+ e\.stack\);/g, 'showAlertModal("Error", "Error in openSurfaceModal: " + e.message, "OK", true);');
        content = content.replace(/alert\("Error saving surface: " \+ err\.message\);/g, 'showAlertModal("Error", "Error saving surface: " + err.message, "OK", true);');
    } else if (filename === 'player-dashboard.html') {
        content = content.replace(/alert\('Residency removed successfully\.'\);/g, 'showAlertModal("Success", "Residency removed successfully.");');
        content = content.replace(/alert\('Error: ' \+ err\.message\);/g, 'showAlertModal("Error", err.message, "OK", true);');
    } else if (filename === 'surface.html' || filename === 'facility.html') {
        content = content.replace(/alert\("You've successfully joined the public session!"\);/g, 'showAlertModal("Success", "You\'ve successfully joined the public session!");');
    }
    
    fs.writeFileSync(filename, content, 'utf8');
}

processFile('owner-dashboard.html');
processFile('player-dashboard.html');
processFile('surface.html');
processFile('facility.html');

console.log("Done");
