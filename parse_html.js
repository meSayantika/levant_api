const fs = require('fs');
const html = fs.readFileSync('levant_error.html', 'utf8');
// remove script and style tags
let text = html.replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '');
text = text.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '');
text = text.replace(/<[^>]+>/g, ' ');
text = text.replace(/\s+/g, ' ').trim();
console.log(text.substring(0, 1000));
