const PDFDocument = require('pdfkit');
const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');
const crypto = require('crypto');

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012';
const IV_LENGTH = 16;

function decryptId(text) {
    if (!text) return text;
    try {
        let textParts = text.split('-');
        let iv = Buffer.from(textParts.shift(), 'hex');
        let encryptedText = Buffer.from(textParts.join('-'), 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch (e) {
        return null;
    }
}

async function generateGstAgreement(req, res) {
    try {
        const { encrypted_submerch_id, business_name, pan_no, address } = req.body;
        
        if (!encrypted_submerch_id) {
            return res.json({ success: false, message: "Submerchant ID is required" });
        }

        const submerch_id = decryptId(encrypted_submerch_id) || encrypted_submerch_id;

        // Ensure the directory exists
        const dir = path.join(process.cwd(), 'public', 'uploads', 'kyc', submerch_id);
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }

        // Output file path
        const filename = 'gst_agreement_' + Date.now() + '.pdf';
        const filePath = path.join(dir, filename);
        const publicUrl = '/uploads/kyc/' + submerch_id + '/' + filename;

        // Create a document
        const doc = new PDFDocument({ margin: 50 });
        const stream = fs.createWriteStream(filePath);
        
        doc.pipe(stream);

        // Header
        doc.fontSize(16).font('Helvetica-Bold').text('DECLARATION OF GST NON-ENROLMENT', { align: 'center', underline: true });
        doc.moveDown(1);

        // Sub
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Sub: Declaration regarding non-requirement of registration under the Central/State/UT/Integrated Goods and Services Tax Act, 2017');
        doc.moveDown(1);

        // Content
        doc.font('Helvetica');
        const bName = business_name || '_________________________';
        const eType = req.body.entity_type || '_________________________';
        const pNum = pan_no || '_________________________';
        const authName = req.body.auth_signatory || '_________________________';
        const todayDate = new Date().toISOString().split('T')[0];
        
        doc.text(`Dear Sir/Madam,`);
        doc.moveDown(0.5);
        doc.text(`I/We ${bName} (${eType}), do hereby declare that I/we am/are not registered under the Goods and Services Tax Act, 2017 as (Please select and fill below for the relevant reason)`, { align: 'justify' });
        doc.moveDown(0.5);

        // Checkboxes with actual checkmarks
        const drawCheckboxItem = (text) => {
            const currentY = doc.y;
            // Draw checkbox
            doc.rect(50, currentY, 10, 10).stroke();
            // Draw tick inside
            doc.moveTo(52, currentY + 5).lineTo(54, currentY + 8).lineTo(58, currentY + 2).stroke();
            
            // Text next to checkbox
            doc.text(text, 65, currentY);
            doc.moveDown(0.5);
            doc.x = 50; // reset x
        };

        drawCheckboxItem('I/We deal in/supply the category of goods or services which are exempted under the Goods and Service Tax Act, 2017.');
        drawCheckboxItem('I/We have the annual aggregate turnover below the taxable limit as specified under the Goods and Services Tax Act, 2017.');
        drawCheckboxItem('I/We are yet to register ourselves under the Goods and Services Tax Act, 2017.');
        
        doc.moveDown(1);

        doc.text(`I/We hereby also confirm that if anytime during any financial year I/we decide or require or become liable to register under the GST, I/we undertake to provide all the requisite documents and information. I/We declare that no taxes are provided in the Invoice, unless the tax registration details are updated and provided on the Invoice.`, { align: 'justify' });
        doc.moveDown(0.5);
        
        doc.text(`I/We acknowledge that the information furnished above is true to the best of my/our knowledge and belief. In case of any of the information is found to be incorrect at later stage, Levant Private Limited reserves the right to cancel and withheld any of my/our settlement and/or un-processed bills.`, { align: 'justify' });
        doc.moveDown(0.5);

        doc.text(`I/We hereby also confirm that Levant Private Limited shall not be liable for any loss accrued to me/us, due to any registration default with the GST and I/We shall solely be liable for cancellation of my/our registration.`, { align: 'justify' });
        doc.moveDown(2);

        // Signatures area
        doc.text(`Signature of Authorised Signatory: `);
        doc.moveDown(0.5);
        doc.text(`Name of the Authorised Signatory: `);
        doc.moveDown(1.5);
        doc.text(`PAN Number of the Authorised Signatory: `);
        doc.moveDown(1.5);
        doc.text(`Name of Business Entity: `);
        doc.moveDown(1);
        doc.text(`PAN Number of the Business Entity: `);
        doc.moveDown(1);
        doc.text(`Date: ${todayDate}`);
        doc.moveDown(1.5);
        
        doc.text(`Stamp/Seal of the business entity`);

        // Finalize PDF file
        doc.end();

        stream.on('finish', () => {
            res.json({ 
                success: true, 
                message: "GST Agreement PDF generated successfully", 
                file_path: publicUrl,
                file_name: filename
            });
        });
        
        stream.on('error', (err) => {
            logger.error("Error writing PDF: " + err.message);
            res.json({ success: false, message: "Error generating PDF" });
        });

    } catch (error) {
        logger.error("Error generating GST agreement: " + error.message);
        res.json({ success: false, message: "Failed to generate agreement" });
    }
}

module.exports = {
    generateGstAgreement
};
