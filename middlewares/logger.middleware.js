// middlewares/logger.middleware.js
const fs = require("fs");
const path = require("path");

exports.levantLogger = (req, res, next) => {
    try {
        const timestamp = new Date().toISOString();
        const logEntry = `
========================================
TIME: ${timestamp}
METHOD: ${req.method}
URL: ${req.originalUrl}
HEADERS: ${JSON.stringify(req.headers, null, 2)}
BODY/QUERY: ${JSON.stringify(req.method === 'GET' ? req.query : req.body, null, 2)}
========================================\n`;

        // We use ".." to go up one folder so the txt file saves in your main project root
        const logPath = path.join(__dirname, "..", "levant_logs.txt");
        
        fs.appendFileSync(logPath, logEntry);
    } catch (err) {
        console.error("Failed to write to text file", err);
    }
    next();
};  