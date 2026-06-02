// middlewares/webhookAuth.middleware.js

const LEVANT_ALLOWED_IPS = [
    '127.0.0.1',        // Leave this for Postman IPv4
    '::1',              // Leave this for Postman IPv6 
    '::ffff:127.0.0.1', // Leave this for mapped local IPv4
    
    // ---> ADD LEVANT'S IPs HERE <---
    '103.112.54.12',    // Example Levant IP 1
    '103.112.54.13'     // Example Levant IP 2
];

exports.verifyLevantIP = (req, res, next) => {
    try {
        let clientIp = req.ip || req.headers['x-forwarded-for'] || req.socket?.remoteAddress;

        if (!clientIp) {
            console.warn("Blocked webhook: Could not determine client IP address.");
            return res.status(403).json({ success: false, message: "Forbidden: Unknown IP" });
        }

        const cleanIp = clientIp.includes('::ffff:') ? clientIp.split('::ffff:')[1] : clientIp;

        if (LEVANT_ALLOWED_IPS.includes(cleanIp)) {
            next(); 
        } else {
            console.warn(`Blocked unauthorized webhook attempt from IP: ${cleanIp}`);
            return res.status(403).json({ success: false, message: "Forbidden: Unauthorized IP address" });
        }
    } catch (error) {
        console.error("IP Verification Middleware Error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error" });
    }
};