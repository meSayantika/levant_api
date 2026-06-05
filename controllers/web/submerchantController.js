/**
 * =============================================
 * SYNERGIC PAY - Sub Merchant Controller
 * =============================================
 */

const { F_Select, F_Insert } = require("../../models/oracleModel");
const logger = require("../../utils/logger");

/**
 * Helper to generate CUST_CD (Assuming it's generated via MAX(CUST_CD) + 1 for now)
 */
async function generateCustCd() {
    // TODO: Update table name if TD_SUB_MERCHANT is incorrect
    const result = await F_Select(0, `SELECT NVL(MAX(CUST_CD), 0) + 1 AS NEXT_ID FROM SUB_MERCHANTS`);
    return result[0].NEXT_ID;
}

/**
 * POST /admin/submerchant/create
 * Handles form submission for sub-merchant onboarding.
 */
async function processCreateSubMerchant(req, res) {
    try {
        const payload = req.body;
        console.log(payload);
        

        // Fetch bank details based on bank_id = 4
        const bankResult = await F_Select(0, `SELECT merchant_code, mer_bank_name, bank_branch, acc_num, ifsc FROM md_bank WHERE bank_id = 4`);
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
            bank_name: bankDetails.MER_BANK_NAME || bankDetails.mer_bank_name || null,
            bank_branch: bankDetails.BANK_BRANCH || bankDetails.bank_branch || null,
            account_number: bankDetails.ACC_NUM || bankDetails.acc_num || null,
            account_ifsc: bankDetails.IFSC || bankDetails.ifsc || null,
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

        // 2. Pre-save to Oracle Database
        const custCd = await generateCustCd();
        const initialSubMerchantCode = '0';
        
        // Use merchant_code from md_bank
        const merchantCode = bankDetails.MERCHANT_CODE || '01';

        const insertQuery = `
            INSERT INTO SUB_MERCHANTS (
                CUST_CD, MERCHANT_CODE, SUB_MERCHANT_CODE, LEGAL_NAME, NAME_ON_BANK, EMAIL, PHONE, 
                CUST_STATUS, BUSINESS_NAME, CUST_STATE, NATURE_OF_BUSINESS, BUSINESS_ADDRESS, 
                CATEGORY_CODE, PAN_NUMBER, BUSINESS_TYPE_CODE, SUB_ADDRESS, SUB_CITY, SUB_PIN_CODE, 
                ENTITY_TYPE, GSTIN, CREATED_AT, UPDATED_AT, CREATED_BY, MODIFIED_BY, PRIMARY_VPA,
                RAW_REQ_PAYLOAD, BANK_NAME, BANK_BRANCH, BANK_ACCOUNT_NUMBER, BANK_ACCOUNT_IFSC,
                GPS_LAT, GPS_LONG
            ) VALUES (
                :custCd, :merchantCode, :subMerchantCode, :legalName, :nameOnBank, :email, :phone,
                'A', :businessName, :state, :natureOfBusiness, :businessAddress,
                :categoryCode, :panNumber, :businessTypeCode, :address, :city, :pincode,
                :entityType, :gstin, SYSTIMESTAMP, SYSTIMESTAMP, :createdBy, :modifiedBy, :primaryVpa,
                :rawReqPayload, :bankName, :bankBranch, :bankAccountNumber, :bankAccountIfsc,
                :gpsLat, :gpsLong
            )
        `;

        const bindParams = {
            custCd: custCd,
            merchantCode: merchantCode,
            subMerchantCode: initialSubMerchantCode,
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
            modifiedBy: req.user ? req.user.username : 'ADMIN',
            primaryVpa: apiPayload.primary_vpa,
            rawReqPayload: rawReqPayload,
            bankName: bankDetails.MER_BANK_NAME || bankDetails.mer_bank_name || null,
            bankBranch: bankDetails.BANK_BRANCH || bankDetails.bank_branch || null,
            bankAccountNumber: bankDetails.ACC_NUM || bankDetails.acc_num || null,
            bankAccountIfsc: bankDetails.IFSC || bankDetails.ifsc || null,
            gpsLat: parseFloat(apiPayload.lati),
            gpsLong: parseFloat(apiPayload.longi)
        };

        // Note: Clob is handled implicitly by node-oracledb for strings if size is within limits.
        await F_Insert(0, insertQuery, bindParams);
        logger.info(`[SubMerchant Controller] Data pre-saved for CUST_CD: ${custCd}`);

        // 3. Send request payload to Levant API
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

        // 4. Update the Oracle record with the response
        // let finalSubMerchantCode = initialSubMerchantCode;
        // if (jsonResponse.success && jsonResponse.response?.data?.merchant?.id) {
        //     finalSubMerchantCode = jsonResponse.response.data.merchant.id.toString();
        // }

        // const updateQuery = `
        //     UPDATE SUB_MERCHANTS
        //     SET 
        //         SUB_MERCHANT_CODE = :subMerchantCode,
        //         RAW_RESPONSE = :rawResponse,
        //         UPDATED_AT = SYSTIMESTAMP
        //     WHERE CUST_CD = :custCd
        // `;

        // await F_Insert(0, updateQuery, {
        //     subMerchantCode: finalSubMerchantCode,
        //     rawResponse: rawResponseStr,
        //     custCd: custCd
        // });

        // logger.info(`[SubMerchant Controller] Response updated for CUST_CD: ${custCd}`);

        if (jsonResponse.success) {
            // Can redirect or render success based on standard app pattern
            return res.json({ success: true, message: "Sub-merchant onboarded successfully", data: jsonResponse });
        } else {
            // Data was inserted into DB successfully, but external API failed.
            // Return success: true so the frontend clears the form, but pass the API error message.
            return res.json({ success: true, message: "Data saved locally, but external API failed: " + (jsonResponse.message || "Unknown error"), data: jsonResponse });
        }

    } catch (err) {
        logger.error(`[SubMerchant Controller] Create Sub-Merchant Error: ${err.message}`);
        return res.status(500).json({ success: false, message: "An error occurred during onboarding." });
    }
}

module.exports = {
    processCreateSubMerchant
};
