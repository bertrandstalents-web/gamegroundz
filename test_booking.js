const booking_date = "2023-09-01";
const repeat_until = "2024-05-05";
const repeat_option = "weekly";
const repeat_days = [1, 2, 3, 4]; // Mon, Tue, Wed, Thu

const startDate = new Date(booking_date + 'T00:00:00');
const endDate = new Date(repeat_until + 'T23:59:59');
let currentDate = new Date(startDate);

const validDays = Array.isArray(repeat_days) && repeat_days.length > 0 ? repeat_days : [startDate.getDay()];

let datesToBook = [];
while (currentDate <= endDate) {
    if (repeat_option === 'daily') {
        datesToBook.push(currentDate.toISOString().split('T')[0]);
    } else if (repeat_option === 'weekly') {
        if (validDays.includes(currentDate.getDay())) {
            datesToBook.push(currentDate.toISOString().split('T')[0]);
        }
    }
    currentDate.setDate(currentDate.getDate() + 1);
}

console.log("Total dates:", datesToBook.length);
console.log("First 5:", datesToBook.slice(0, 5));
console.log("Last 5:", Math.max(0, datesToBook.length - 5) > 0 ? datesToBook.slice(-5) : []);
