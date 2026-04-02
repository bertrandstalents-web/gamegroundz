const formatDate = (dateString) => {
    const options = { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' };
    return new Date(dateString + 'T00:00:00').toLocaleDateString('en-US', options);
};

const formatTimeSlots = (slots) => {
    if (!slots || slots.length === 0) return '';
    const sorted = [...slots].sort();
    const startTime = sorted[0];
    let endTime = sorted[sorted.length - 1];
    
    // add 30 mins to end time
    let [hours, mins] = endTime.split(':').map(Number);
    mins += 30;
    if (mins >= 60) {
        hours += 1;
        mins -= 60;
    }
    endTime = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}`;
    
    return `${startTime} - ${endTime} (${slots.length * 30} mins)`;
};

const mockBooking = {
    booking_id: 123,
    booking_date: '2026-03-30',
    time_slots: '["10:30", "11:00"]',
    total_price: 172.46,
    facility_name: 'Centre Sportif Damien',
    facility_location: '123 Fake St',
    host_id: 5,
    player_name: 'Tommy',
    player_email: 'test@gamegroundz.com',
    host_name: 'Host',
    host_email: 'host@gamegroundz.com',
};

try {
    const { player_email, player_name, facility_name, facility_location, booking_date, time_slots, total_price, booking_id } = mockBooking;
        
    console.log("Formatting Date...");
    const dateStr = formatDate(booking_date);
    
    console.log("Formatting Time Slots...");
    const parsedSlots = JSON.parse(time_slots);
    const timeStr = formatTimeSlots(parsedSlots);
    
    console.log("Date:", dateStr);
    console.log("Time:", timeStr);
    
    console.log("Success! No data formatting errors.");
} catch (e) {
    console.error("Error caught:", e);
}
