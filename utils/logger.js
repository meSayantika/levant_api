const winston = require('winston');
const path = require('path');

// Configure custom log format
const logFormat = winston.format.combine(
    winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
    winston.format.printf(({ timestamp, level, message }) => {
        return `[${timestamp}] ${level.toUpperCase()}: ${message}`;
    })
);

// Create Winston Logger instance
const logger = winston.createLogger({
    level: 'info',
    format: logFormat,
    transports: [
        // Console output
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                logFormat
            )
        }),
        // Auth log file
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/auth.log'),
            level: 'info'
        }),
        // Error log file
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/error.log'),
            level: 'error'
        })
    ]
});

module.exports = logger;
