/**
 * =============================================
 * SYNERGIC PAY - Sub Merchant Controller
 * =============================================
 */

const { F_Select, F_Insert } = require("../../models/oracleModel");
const logger = require("../../utils/logger");
const crypto = require("crypto");

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || '12345678901234567890123456789012'; // Must be 256 bits (32 characters)
const IV_LENGTH = 16;

function encryptId(text) {
    let iv = crypto.randomBytes(IV_LENGTH);
    let cipher = crypto.createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
    let encrypted = cipher.update(String(text));
    encrypted = Buffer.concat([encrypted, cipher.final()]);
    // Use URL safe encoding by replacing + and / if base64, but we use hex here which is already safe
    return iv.toString('hex') + '-' + encrypted.toString('hex');
}

function decryptId(text) {
    try {
        let textParts = text.split('-');
        let iv = Buffer.from(textParts.shift(), 'hex');
        let encryptedText = Buffer.from(textParts.join('-'), 'hex');
        let decipher = crypto.createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY), iv);
        let decrypted = decipher.update(encryptedText);
        decrypted = Buffer.concat([decrypted, decipher.final()]);
        return decrypted.toString();
    } catch(e) {
        return null;
    }
}

/**
 * Helper to generate CUST_CD (Assuming it's generated via MAX(CUST_CD) + 1 for now)
 */
async function generateCustCd() {
    const result = await F_Select(0, `SELECT NVL(MAX(CUST_CD), 0) + 1 AS NEXT_ID FROM SUB_MERCHANTS`);
    return result[0].NEXT_ID;
}

/**
 * GET /admin/merchants
 * Renders the list of sub-merchants
 */
async function renderSubMerchantList(req, res) {
    try {
        const query = `
            SELECT 
                CUST_CD, SUB_MERCHANT_CODE, LEGAL_NAME, EMAIL, PHONE, BUSINESS_ADDRESS, 
                CUST_STATUS, TO_CHAR(CREATED_AT, 'DD-Mon-YYYY') as CREATED_DATE 
            FROM SUB_MERCHANTS 
            ORDER BY CREATED_AT DESC
        `;
        const merchants = await F_Select(0, query);

        // Pre-encrypt the CUST_CD for the view links
        const processedMerchants = (merchants || []).map(m => {
            m.ENCRYPTED_CUST_CD = encryptId(m.CUST_CD);
            return m;
        });

        res.render("pages/submerchant/submerchant_list", {
            title: "Sub Merchants | Synergic Pay",
            user: req.user,
            currentRoute: "/admin/merchants",
            merchants: processedMerchants
        });
    } catch (error) {
        logger.error(`[SubMerchant Controller] Error fetching list: ${error.message}`);
        res.render("pages/submerchant/submerchant_list", {
            title: "Sub Merchants | Synergic Pay",
            user: req.user,
            currentRoute: "/admin/merchants",
            merchants: []
        });
    }
}

/**
 * GET /admin/merchants/create
 * Renders the form to onboard a new sub-merchant
 */
async function renderCreateSubMerchant(req, res) {
    res.render("pages/submerchant/submerchant", {
        title: "Sub Merchant Onboarding | Synergic Pay",
        user: req.user,
        currentRoute: "/admin/merchants", // Keep same route to keep sidebar active
        googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
    });
}

/**
 * POST /admin/submerchant/create
 * Handles form submission for sub-merchant onboarding.
 */
async function processCreateSubMerchant(req, res) {
    try {
        const payload = req.body;
        console.log(payload);

        // Check uniqueness of Email and Phone
        const checkQuery = `SELECT COUNT(*) AS CNT FROM SUB_MERCHANTS WHERE EMAIL = :email OR PHONE = :phone`;
        const checkResult = await F_Select(0, checkQuery, { email: payload.email, phone: payload.phone });
        
        if (checkResult && checkResult.length > 0 && checkResult[0].CNT > 0) {
            return res.json({ success: false, message: "Email ID or Mobile Number is already registered." });
        }

        const bank_id = '4';

        // Fetch bank details based on bank_id = 4
        const bankResult = await F_Select(0, `SELECT merchant_code, mer_bank_name, bank_branch, acc_num, ifsc FROM md_bank WHERE bank_id = ${bank_id}`);
        if (!bankResult || bankResult.length === 0) {
            return res.json({ success: false, message: "Bank details not found for bank_id 4." });
        }
        const bankDetails = bankResult[0];
        console.log("Fetched Bank Details from md_bank:", bankDetails);

        // 1. Prepare data for Levant API payload
        // Mapping UI fields to Levant API requirements
        const apiPayload = {
            name: payload.name,
            name_on_bank: payload.name_on_bank,
            email: payload.email,
            phone: payload.phone,
            business_name: payload.business_name,
            state: payload.state,
            nature_of_business: payload.nature_of_business,
            business_address: payload.business_address,
            bank_name: bankDetails.MER_BANK_NAME || bankDetails.mer_bank_name,
            bank_branch: bankDetails.BANK_BRANCH || bankDetails.bank_branch,
            account_number: bankDetails.ACC_NUM || bankDetails.acc_num,
            account_ifsc: bankDetails.IFSC || bankDetails.ifsc,
            category_code: payload.category_code,
            pan_number: payload.pan_no, // Field is pan_no in UI
            business_type_code: payload.business_type_code,
            address: payload.address,
            city: payload.city,
            pincode: payload.pincode,
            entity_type: payload.entity_type,
            gstin: payload.gstin || '',
            primary_vpa: payload.primary_vpa,
            lati: payload.lati ? payload.lati.toString() : '0.0000',
            longi: payload.longi ? payload.longi.toString() : '0.0000'
        };

        const rawReqPayload = JSON.stringify(apiPayload);

        console.log("==========================================");
        console.log("PAYLOAD SENT TO LEVANT API:");
        console.log(rawReqPayload);
        console.log("==========================================");

        // 2. Insert into local database FIRST
        const custCd = await generateCustCd();
        const merchantCode = bankDetails.MERCHANT_CODE || '01';

        const insertQuery = `
            INSERT INTO SUB_MERCHANTS (
                CUST_CD, MERCHANT_CODE, SUB_MERCHANT_CODE, LEGAL_NAME, NAME_ON_BANK, EMAIL, PHONE, 
                CUST_STATUS, BUSINESS_NAME, CUST_STATE, NATURE_OF_BUSINESS, BUSINESS_ADDRESS, 
                CATEGORY_CODE, PAN_NUMBER, BUSINESS_TYPE_CODE, SUB_ADDRESS, SUB_CITY, SUB_PIN_CODE, 
                ENTITY_TYPE, GSTIN, CREATED_AT, UPDATED_AT, CREATED_BY, MODIFIED_BY, PRIMARY_VPA,
                RAW_REQ_PAYLOAD, RAW_RESPONSE, BANK_NAME, BANK_BRANCH, BANK_ACCOUNT_NUMBER, BANK_ACCOUNT_IFSC,
                GPS_LAT, GPS_LONG
            ) VALUES (
                :custCd, :merchantCode, :subMerchantCode, :legalName, :nameOnBank, :email, :phone,
                'A', :businessName, :state, :natureOfBusiness, :businessAddress,
                :categoryCode, :panNumber, :businessTypeCode, :address, :city, :pincode,
                :entityType, :gstin, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy, NULL, :primaryVpa,
                :rawReqPayload, :rawResponse, :bankName, :bankBranch, :bankAccountNumber, :bankAccountIfsc,
                :gpsLat, :gpsLong
            )
        `;

        const bindParams = {
            custCd: custCd,
            merchantCode: merchantCode,
            subMerchantCode: '0',
            legalName: apiPayload.name,
            nameOnBank: apiPayload.name_on_bank,
            email: apiPayload.email,
            phone: apiPayload.phone,
            businessName: apiPayload.business_name,
            state: apiPayload.state,
            natureOfBusiness: apiPayload.nature_of_business,
            businessAddress: apiPayload.business_address,
            categoryCode: apiPayload.category_code,
            panNumber: apiPayload.pan_number,
            businessTypeCode: apiPayload.business_type_code,
            address: apiPayload.address,
            city: apiPayload.city,
            pincode: apiPayload.pincode,
            entityType: apiPayload.entity_type,
            gstin: apiPayload.gstin,
            createdBy: req.user ? req.user.username : 'ADMIN',
            primaryVpa: apiPayload.primary_vpa,
            rawReqPayload: rawReqPayload,
            rawResponse: null,
            bankName: bankDetails.MER_BANK_NAME || bankDetails.mer_bank_name || null,
            bankBranch: bankDetails.BANK_BRANCH || bankDetails.bank_branch || null,
            bankAccountNumber: bankDetails.ACC_NUM || bankDetails.acc_num || null,
            bankAccountIfsc: bankDetails.IFSC || bankDetails.ifsc || null,
            gpsLat: parseFloat(apiPayload.lati),
            gpsLong: parseFloat(apiPayload.longi)
        };

        await F_Insert(0, insertQuery, bindParams);
        logger.info(`[SubMerchant Controller] Data initially saved for CUST_CD: ${custCd}`);

        // 3. Call Levant API
        const levantApiUrl = process.env.ONBOARD_SUBMERCHANT_API;

        const apiResponse = await fetch(levantApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-API-Key': process.env.LEVANT_API_KEY,
                'X-Merchant-Key': process.env.LEVANT_MERCHANT_KEY,
                'X-Environment': process.env.LEVANT_ENV
            },
            body: rawReqPayload
        });

        const jsonResponse = await apiResponse.json();
        const rawResponseStr = JSON.stringify(jsonResponse);

        let finalSubMerchantCode = '0';
        if (jsonResponse.response?.data?.merchant?.id) {
            finalSubMerchantCode = jsonResponse.response.data.merchant.id.toString();
        }

        // 4. Update the DB with the response
        const updateQuery = `
            UPDATE SUB_MERCHANTS 
            SET RAW_RESPONSE = :rawResponse, 
                SUB_MERCHANT_CODE = :subMerchantCode,
                UPDATED_AT = SYSTIMESTAMP
            WHERE CUST_CD = :custCd
        `;

        const updateParams = {
            rawResponse: rawResponseStr,
            subMerchantCode: finalSubMerchantCode,
            custCd: custCd
        };

        await F_Insert(0, updateQuery, updateParams);
        logger.info(`[SubMerchant Controller] Data successfully updated with response for CUST_CD: ${custCd}`);

        // If Levant API fails, we still return an error, but it's already logged in DB
        if (!jsonResponse.success) {
            logger.warn(`[SubMerchant Controller] Levant API rejected payload: ${jsonResponse.message}`);
            return res.json({ 
                success: false, 
                message: "External API Failed: " + (jsonResponse.message || "Unknown error") 
            });
        }

        // 5. Return success to frontend
        return res.json({ 
            success: true, 
            message: "Sub-merchant onboarded successfully", 
            data: jsonResponse 
        });

    } catch (err) {
        logger.error(`[SubMerchant Controller] Create Sub-Merchant Error: ${err.message}`);
        return res.status(500).json({ success: false, message: "An error occurred during onboarding." });
    }
}

/**
 * GET /admin/merchants/view/:custCd
 * Renders the form to view an existing sub-merchant in read-only mode
 */
async function renderViewSubMerchant(req, res) {
    try {
        const encryptedCustCd = req.params.custCd;
        const custCd = decryptId(encryptedCustCd);

        if (!custCd) {
            return res.status(400).send("Invalid or corrupted sub-merchant ID");
        }

        const query = `
            SELECT * FROM SUB_MERCHANTS WHERE CUST_CD = :custCd
        `;
        const result = await F_Select(0, query, { custCd });

        if (!result || result.length === 0) {
            return res.status(404).send("Sub-merchant not found");
        }

        res.render("pages/submerchant/submerchant_view", {
            title: "View Sub Merchant | Synergic Pay",
            user: req.user,
            currentRoute: "/admin/merchants",
            merchant: result[0],
            googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY
        });
    } catch (error) {
        logger.error(`[SubMerchant Controller] Error fetching details for view: ${error.message}`);
        res.status(500).send("An error occurred while fetching sub-merchant details.");
    }
}

module.exports = {
    renderSubMerchantList,
    renderCreateSubMerchant,
    processCreateSubMerchant,
    renderViewSubMerchant
};
