const nodemailer = require('nodemailer');
const logger = require('./logger');

let transporter;

async function initTransporter() {
    if (transporter) return transporter;

    // Check if SMTP credentials are provided in .env
    if (process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS) {
        transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST,
            port: process.env.SMTP_PORT || 587,
            secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
            auth: {
                user: process.env.SMTP_USER,
                pass: process.env.SMTP_PASS
            }
        });
        logger.info('Email service initialized with provided SMTP credentials.');
    } else {
        // Fallback: Create a test account using Ethereal Email for testing
        logger.warn('No SMTP credentials found in .env. Falling back to Ethereal Email for testing purposes.');
        try {
            const testAccount = await nodemailer.createTestAccount();
            transporter = nodemailer.createTransport({
                host: "smtp.ethereal.email",
                port: 587,
                secure: false,
                auth: {
                    user: testAccount.user,
                    pass: testAccount.pass
                }
            });
            logger.info('Test email service initialized via Ethereal Email.');
        } catch (err) {
            logger.error(`Failed to initialize Ethereal test account: ${err.message}`);
            throw err;
        }
    }
    return transporter;
}

/**
 * Send an email
 * @param {string} to - Recipient email
 * @param {string} subject - Email subject
 * @param {string} text - Plain text body
 * @param {string} html - HTML body
 */
async function sendEmail(to, subject, text, html) {
    try {
        const mailer = await initTransporter();
        const fromEmail = process.env.SMTP_FROM || '"Synergic Pay Admin" <no-reply@synergicpay.com>';

        const info = await mailer.sendMail({
            from: fromEmail,
            to,
            subject,
            text,
            html
        });

        logger.info(`Email sent to ${to} (Message ID: ${info.messageId})`);

        // If using Ethereal, print the URL where the user can view the fake email
        if (info.messageId && !process.env.SMTP_HOST) {
            const previewUrl = nodemailer.getTestMessageUrl(info);
            logger.info(`Preview the sent email here: ${previewUrl}`);
            return { success: true, previewUrl };
        }

        return { success: true };
    } catch (err) {
        logger.error(`Error sending email to ${to}: ${err.message}`);
        return { success: false, error: err.message };
    }
}

module.exports = {
    sendEmail
};
