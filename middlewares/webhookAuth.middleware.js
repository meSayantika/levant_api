// middlewares/webhookAuth.middleware.js

// TODO: Replace with the actual production IP addresses provided by Levant Support
const LEVANT_ALLOWED_IPS = [
    '127.0.0.1', // Localhost for your local testing
    // '103.xxx.xxx.xxx', // Add Levant's IPs here when going live
];

exports.verifyLevantIP = (req, res, next) => {
    // Extract the client IP, accounting for load balancers or proxies
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    
    // Clean up IPv6 mapped IPv4 addresses (e.g., ::ffff:127.0.0.1)
    const cleanIp = clientIp.includes('::ffff:') ? clientIp.split('::ffff:')[1] : clientIp;

    if (LEVANT_ALLOWED_IPS.includes(cleanIp)) {
        next(); // IP is trusted, proceed to the webhook controller
    } else {
        console.warn(`Blocked unauthorized webhook attempt from IP: ${cleanIp}`);
        return res.status(403).json({ success: false, message: "Forbidden: Unauthorized IP address" });
    }
};