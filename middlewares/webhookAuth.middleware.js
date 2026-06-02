// middlewares/webhookAuth.middleware.js

const LEVANT_ALLOWED_IPS = [
    '14.192.17.108',     // Your testing IP
    '127.0.0.1',         // Postman local IPv4
    '::1',               // Postman local IPv6
    '::ffff:127.0.0.1'   // Mapped IPv4
    // Add actual Levant IPs here when going live...
];

exports.verifyLevantIP = (req, res, next) => {
    try {
        // Express built-in req.ip is the safest, fallback to headers or socket
        let clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress;

        // CRITICAL FIX: If the IP is undefined, block it safely instead of crashing
        if (!clientIp) {
            console.warn("Blocked webhook: Could not determine client IP address.");
            return res.status(403).json({ success: false, message: "Forbidden: Unknown IP" });
        }

        // Clean up IPv6 mapped IPv4 addresses (e.g., ::ffff:127.0.0.1)
        // Since we know clientIp is definitely a string now, .includes() will not crash!
        const cleanIp = clientIp.includes('::ffff:') ? clientIp.split('::ffff:')[1] : clientIp;

        // Check if the clean IP is in our allowed list
        if (LEVANT_ALLOWED_IPS.includes(cleanIp)) {
            next(); // IP is trusted, proceed to the webhook controller
        } else {
            console.warn(`Blocked unauthorized webhook attempt from IP: ${cleanIp}`);
            return res.status(403).json({ success: false, message: "Forbidden: Unauthorized IP address" });
        }
    } catch (error) {
        console.error("IP Verification Middleware Error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error during auth" });
    }
};