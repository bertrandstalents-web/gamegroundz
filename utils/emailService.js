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
            tls: { ciphers: 'SSLv3' }
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

async function sendReviewRequest(bookingDetails) {
    if (!transporter) return;

    try {
        const { player_email, player_name, facility_name, facility_id, id } = bookingDetails;
        
        const bodyContent = `
            <h2>How was your experience?</h2>
            <p>Hi ${player_name},</p>
            <p>We hope you had a great time at <strong>${facility_name}</strong>!</p>
            <p>Your feedback helps our community find the best places to play, and helps hosts improve their facilities.</p>
            
            <center>
                <a href="${process.env.APP_URL || 'https://gamegroundz.com'}/facility.html?id=${facility_id}&review_booking=${id}" class="btn">Leave a Review</a>
            </center>
        `;

        const html = getBaseEmailTemplate('Leave a Review', 'How was your recent booking at GameGroundz?', bodyContent);

        let info = await transporter.sendMail({
            from: '"GameGroundz Experience" <support@gamegroundz.com>', // Sender address
            to: player_email, // list of receivers
            subject: `How was your time at ${facility_name}?`, // Subject line
            html: html, // html body
        });

        console.log("Review request email sent: %s", info.messageId);
        if (info.messageId.includes('ethereal')) {
            console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error("Error sending review request email:", error);
    }
}

async function sendPasswordResetEmail(email, token) {
    if (!transporter) return;

    try {
        const resetLink = `${process.env.APP_URL || 'http://localhost:3000'}/reset-password.html?token=${token}`;
        
        const bodyContent = `
            <h2>Reset Your Password</h2>
            <p>We received a request to reset your GameGroundz password.</p>
            <p>Click the button below to choose a new password. This link is valid for 1 hour.</p>
            
            <center>
                <a href="${resetLink}" class="btn">Reset Password</a>
            </center>
            
            <p style="margin-top: 24px; font-size: 14px; color: #6b7280;">If you didn't request this, you can safely ignore this email.</p>
        `;

        const html = getBaseEmailTemplate('Reset Your Password', 'Reset your GameGroundz password.', bodyContent);

        let info = await transporter.sendMail({
            from: '"GameGroundz Security" <support@gamegroundz.com>', // Sender address
            to: email, // list of receivers
            subject: `Reset Your Password`, // Subject line
            html: html, // html body
        });

        console.log("Password reset email sent: %s", info.messageId);
        if (info.messageId.includes('ethereal')) {
            console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
        }
    } catch (error) {
        console.error("Error sending password reset email:", error);
    }
}

async function sendWelcomeEmail(email, name, role) {
    if (!transporter) return;

    try {
        const isHost = role === 'host';
        const dashboardLink = `${process.env.APP_URL || 'http://localhost:3000'}/${isHost ? 'owner-dashboard.html' : 'search.html'}`;
        const actionText = isHost ? 'Go to Host Dashboard' : 'Find Facilities';

        const bodyContent = `
            <h2>Welcome to GameGroundz!</h2>
            <p>Hi ${name},</p>
            <p>We're thrilled to have you on board. GameGroundz is the easiest way to manage and book sports surfaces.</p>
            
            <center>
                <a href="${dashboardLink}" class="btn">${actionText}</a>
            </center>
        `;

        const html = getBaseEmailTemplate('Welcome to GameGroundz', 'Thanks for signing up!', bodyContent);

        let info = await transporter.sendMail({
            from: '"GameGroundz Team" <welcome@gamegroundz.com>',
            to: email,
            subject: `Welcome to GameGroundz, ${name}!`,
            html: html,
        });

        console.log("Welcome email sent: %s", info.messageId);
        if (info.messageId.includes('ethereal')) console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    } catch (error) {
        console.error("Error sending welcome email:", error);
    }
}

async function sendPasswordChangedConfirmation(email) {
    if (!transporter) return;

    try {
        const bodyContent = `
            <h2>Password Changed Successfully</h2>
            <p>Your GameGroundz password has been updated.</p>
            <p>If you did not make this change, please contact support immediately.</p>
        `;

        const html = getBaseEmailTemplate('Password Changed', 'Your password was updated.', bodyContent);

        let info = await transporter.sendMail({
            from: '"GameGroundz Security" <support@gamegroundz.com>',
            to: email,
            subject: 'Security Alert: Password Changed',
            html: html,
        });

        console.log("Password changed email sent: %s", info.messageId);
        if (info.messageId.includes('ethereal')) console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    } catch (error) {
        console.error("Error sending password changed email:", error);
    }
}

async function sendCancellationEmail(bookingDetails, cancelledBy) {
    if (!transporter) return;

    try {
        const { player_email, player_name, host_email, host_name, facility_name, booking_date, time_slots, booking_id } = bookingDetails;
        
        const dateStr = formatDate(booking_date);
        const timeStr = formatTimeSlots(JSON.parse(time_slots));
        const canceller = cancelledBy === 'host' ? host_name : player_name;

        const bodyContent = `
            <h2>Booking Cancelled</h2>
            <p>The following booking at <strong>${facility_name}</strong> has been cancelled by ${canceller}.</p>
            
            <div class="booking-details">
                <div class="detail-row">
                    <span class="label">Booking ID</span>
                    <span class="value">#${booking_id}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Date</span>
                    <span class="value">${dateStr}</span>
                </div>
                <div class="detail-row">
                    <span class="label">Time</span>
                    <span class="value">${timeStr}</span>
                </div>
            </div>
            
            <p style="margin-top: 24px;">Refunds (if applicable) have been initiated automatically.</p>
        `;

        const html = getBaseEmailTemplate('Booking Cancelled', 'A GameGroundz booking was cancelled.', bodyContent);

        // Send to Player
        let infoP = await transporter.sendMail({
            from: '"GameGroundz Notifications" <support@gamegroundz.com>',
            to: player_email,
            subject: `Cancelled: Booking at ${facility_name}`,
            html: html,
        });
        
        // Send to Host
        if (host_email) {
            await transporter.sendMail({
                from: '"GameGroundz Notifications" <support@gamegroundz.com>',
                to: host_email,
                subject: `Canceled by ${canceller}: ${facility_name}`,
                html: html,
            });
        }

        console.log("Cancellation email sent: %s", infoP.messageId);
        if (infoP.messageId.includes('ethereal')) console.log("Preview URL: %s", nodemailer.getTestMessageUrl(infoP));
    } catch (error) {
        console.error("Error sending cancellation email:", error);
    }
}

async function sendCoHostInvitationEmail(toEmail, facilityName, inviterName) {
    if (!transporter) return;

    try {
        const dashboardLink = `${process.env.APP_URL || 'http://localhost:3000'}/owner-dashboard.html`;

        const bodyContent = `
            <h2>You've been invited as a Co-Host!</h2>
            <p>Hi there,</p>
            <p><strong>${inviterName}</strong> has invited you to help manage the dashboard for <strong>${facilityName}</strong> on GameGroundz.</p>
            <p>If you already have an account with this email, simply log in to access the facility dashboard.</p>
            <p>If you don't have an account yet, please sign up and you'll automatically gain access as a co-host!</p>
            
            <center>
                <a href="${dashboardLink}" class="btn">Go to Dashboard</a>
            </center>
        `;

        const html = getBaseEmailTemplate('Co-Host Invitation', 'You have been invited to manage a facility on GameGroundz.', bodyContent);

        let info = await transporter.sendMail({
            from: '"GameGroundz Notifications" <support@gamegroundz.com>',
            to: toEmail,
            subject: `Invitation: Co-Host for ${facilityName}`,
            html: html,
        });

        console.log("Co-host invitation email sent: %s", info.messageId);
        if (info.messageId.includes('ethereal')) console.log("Preview URL: %s", nodemailer.getTestMessageUrl(info));
    } catch (error) {
        console.error("Error sending co-host invitation email:", error);
    }
}

module.exports = {
    sendPlayerConfirmation,
    sendHostConfirmation,
    sendReviewRequest,
    sendPasswordResetEmail,
    sendWelcomeEmail,
    sendPasswordChangedConfirmation,
    sendCancellationEmail,
    sendCoHostInvitationEmail
};
