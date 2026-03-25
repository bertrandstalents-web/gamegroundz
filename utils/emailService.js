const nodemailer = require('nodemailer');

// Configure the transporter
let transporter;

async function setupTransporter() {
    // If SMTP_HOST is provided in env, use it (production/real emails)
    if (process.env.SMTP_HOST) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_PORT == 465, // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS,
            },
        });
        console.log('Email service configured with custom SMTP.');
    } else {
        // Fallback to ethereal for testing/dev if no SMTP configured
        let testAccount = await nodemailer.createTestAccount();
        transporter = nodemailer.createTransport({
            host: "smtp.ethereal.email",
            port: 587,
            secure: false, // true for 465, false for other ports
            auth: {
                user: testAccount.user, // generated ethereal user
                pass: testAccount.pass, // generated ethereal password
            },
        });
        console.log('Email service configured with Ethereal test account.');
    }
}

setupTransporter().catch(console.error);

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

const getBaseEmailTemplate = (title, preheader, bodyContent) => `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${title}</title>
    <style>
        body { margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; background-color: #f3f4f6; color: #111827; }
        .container { max-width: 600px; margin: 40px auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05); }
        .header { background-color: #2563eb; padding: 32px 24px; text-align: center; color: #ffffff; }
        .header h1 { margin: 0; font-size: 24px; font-weight: 700; }
        .content { padding: 32px 24px; }
        .footer { background-color: #f9fafb; padding: 24px; text-align: center; font-size: 14px; color: #6b7280; border-top: 1px solid #e5e7eb; }
        .btn { display: inline-block; padding: 12px 24px; background-color: #2563eb; color: #ffffff !important; text-decoration: none; border-radius: 8px; font-weight: 600; margin-top: 24px; }
        .booking-details { background-color: #f9fafb; border-radius: 12px; padding: 24px; margin-top: 24px; border: 1px solid #e5e7eb; }
        .detail-row { display: flex; justify-content: space-between; margin-bottom: 12px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
        .detail-row:last-child { margin-bottom: 0; padding-bottom: 0; border-bottom: none; }
        .label { color: #6b7280; font-weight: 500; }
        .value { color: #111827; font-weight: 600; text-align: right;}
        h2 { margin-top: 0; font-size: 20px; color: #111827; }
        p { margin: 0 0 16px 0; line-height: 1.6; }
    </style>
</head>
<body>
    <span style="display:none;font-size:1px;color:#333333;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</span>
    <div class="container">
        <div class="header">
            <h1>GameGroundz</h1>
        </div>
        <div class="content">
            ${bodyContent}
        </div>
        <div class="footer">
            <p>&copy; ${new Date().getFullYear()} GameGroundz. All rights reserved.</p>
            <p>Need help? Contact us at support@gamegroundz.com</p>
        </div>
    </div>
</body>
</html>
`;

async function sendPlayerConfirmation(bookingDetails) {
    if (!transporter) return;

    try {
        const { player_email, player_name, facility_name, facility_location, booking_date, time_slots, total_price, booking_id } = bookingDetails;
        
        const dateStr = formatDate(booking_date);
        const timeStr = formatTimeSlots(JSON.parse(time_slots));
        const priceStr = total_price ? `$${parseFloat(total_price).toFixed(2)} CAD` : 'Pre-paid / Included';

        const bodyContent = `
            <h2>Booking Confirmed!</h2>
            <p>Hi ${player_name},</p>
            <p>Great news! Your booking at <strong>${facility_name}</strong> is confirmed. You're all set to play.</p>
            
            <div class="booking-details">
                <div class="detail-row">
                    <span class="label">Booking ID</span>
                    <span class="value">#${booking_id}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Facility</span>
                    <span class="value">${facility_name}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Location</span>
                    <span class="value">${facility_location || 'Address provided by host'}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Date</span>
                    <span class="value">${dateStr}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Time</span>
                    <span class="value">${timeStr}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Total Paid</span>
                    <span class="value">${priceStr}</span>
                </div>
            </div>
            
            <center>
                <a href="${process.env.APP_URL || 'https://gamegroundz.com'}/player-dashboard.html" class="btn">View My Bookings</a>
            </center>
        `;

        const html = getBaseEmailTemplate('Booking Confirmation', 'Your booking at GameGroundz is confirmed.', bodyContent);

        let info = await transporter.sendMail({
            from: '"GameGroundz Support" <support@gamegroundz.com>', // Sender address
            to: player_email, // list of receivers
            subject: `Booking Confirmed: ${facility_name}`, // Subject line
            html: html, // html body
        });

        console.log("Player email sent: %s", info.messageId);
        if (info.messageId.includes('ethereal')) {
            console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error("Error sending player confirmation email:", error);
    }
}

async function sendHostConfirmation(bookingDetails) {
    if (!transporter) return;

    try {
        const { host_email, host_name, player_name, facility_name, booking_date, time_slots, total_price, booking_id } = bookingDetails;
        
        const dateStr = formatDate(booking_date);
        const timeStr = formatTimeSlots(JSON.parse(time_slots));
        const priceStr = total_price ? `$${parseFloat(total_price).toFixed(2)} CAD` : 'Check dashboard for details';

        const bodyContent = `
            <h2>New Booking Received!</h2>
            <p>Hi ${host_name},</p>
            <p>You have a new confirmed booking for <strong>${facility_name}</strong> from ${player_name}.</p>
            
            <div class="booking-details">
                <div class="detail-row">
                    <span class="label">Booking ID</span>
                    <span class="value">#${booking_id}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Player</span>
                    <span class="value">${player_name}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Date</span>
                    <span class="value">${dateStr}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Time</span>
                    <span class="value">${timeStr}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Payout Total</span>
                    <span class="value">${priceStr}</span>
                </div>
            </div>
            
            <center>
                <a href="${process.env.APP_URL || 'https://gamegroundz.com'}/owner-dashboard.html" class="btn">View Host Dashboard</a>
            </center>
        `;

        const html = getBaseEmailTemplate('New Booking Received', 'You have a new booking at GameGroundz.', bodyContent);

        let info = await transporter.sendMail({
            from: '"GameGroundz Notifications" <support@gamegroundz.com>', // Sender address
            to: host_email, // list of receivers
            subject: `New Booking: ${facility_name} - ${dateStr}`, // Subject line
            html: html, // html body
        });

        console.log("Host email sent: %s", info.messageId);
        if (info.messageId.includes('ethereal')) {
            console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error("Error sending host confirmation email:", error);
    }
}

module.exports = {
    sendPlayerConfirmation,
    sendHostConfirmation
};
