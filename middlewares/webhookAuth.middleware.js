// middlewares/webhookAuth.middleware.js

const LEVANT_ALLOWED_IPS = [
    '14.192.17.108',     // Your testing IP
    '127.0.0.1', 
    '192.168.1.33',        // Postman / IIS Named Pipe fallback
    '::1',               // Postman local IPv6
    '::ffff:127.0.0.1' ,  // Mapped IPv4
    '103.102.234.178' // Add actual Levant IPs here when going live...
];

exports.verifyLevantIP = (req, res, next) => {
    try {
        // Look everywhere for the IP
        let clientIp = req.headers['x-forwarded-for'] || req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress;

        // IIS/IISNODE FIX: If running locally via IIS named pipes, the IP will be completely missing.
        // We will default it to localhost so your Postman tests can proceed.
        if (!clientIp) {
            console.warn("Could not determine IP (Likely IIS Named Pipe). Defaulting to 127.0.0.1");
            clientIp = '127.0.0.1'; 
        }

        // Clean up IPv6 mapped IPv4 addresses
        const cleanIp = clientIp.includes('::ffff:') ? clientIp.split('::ffff:')[1] : clientIp;

        // Check if the clean IP is in our allowed list
        console.log(cleanIp,'cleanIp');
        
        if (LEVANT_ALLOWED_IPS.includes(cleanIp)
        ) {

            next(); 
        } else {
            console.warn(`Blocked unauthorized webhook attempt from IP: ${cleanIp}`);
            return res.status(403).json({ success: false, message: "Forbidden: Unauthorized IP address" });
        }
    } catch (error) {
        console.error("IP Verification Middleware Error:", error);
        return res.status(500).json({ success: false, message: "Internal Server Error during auth" });
    }
};