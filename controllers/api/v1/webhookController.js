// Inside controllers/api/v1/webhookController.js
const { F_Insert } = require("../../../models/oracleModel");

const DB_ID = 0;

exports.kycReceiver = async (req, res) => {
    try {
        const payload = req.body;
        
        if (!payload || !payload.data) {
            return res.status(400).json({ success: false, message: "Invalid payload format" });
        }
        
        // Immediately acknowledge receipt
        res.status(200).json({ success: true, message: "KYC Webhook received" });

        const data = payload.data;
        console.log(`Processing KYC for Merchant ID: ${data.id}`);

        // Build the full INSERT SQL statement
        const insertQuery = `
            INSERT INTO td_kyc_approval (
                SUBMERCHANT_ID, VIRTUAL_ACC_ID, VIRTUAL_ACC_NO, BALANCE, IS_ACTIVE, 
                BANK_NAME, STATUS, IFSC, IS_CONNECTED_BANKING, INSTA_PRIMARY_VPA, 
                KYC_STATUS, BANK_STATUS, KYC_PROFILE_STATUS, KYC_EXPIRTY_DT, 
                STORE_NAME, CREATED_BY, CREATED_AT, KYC, UPI, IMPS, NEFT, RTGS
            ) VALUES (
                :sub_id, :v_acc_id, :v_acc_no, :balance, :is_active, 
                :bank_name, :status, :ifsc, :is_conn_bnk, :insta_vpa, 
                :kyc_status, :bank_status, :kyc_prof_status, TO_DATE(:kyc_exp_dt, 'YYYY-MM-DD HH24:MI:SS'), 
                :store_name, :created_by, SYSDATE, :kyc_data, :upi, :imps, :neft, :rtgs
            )
        `;

        // Map payload data and use JSON.stringify for the arrays
        const kycValues = {
            sub_id: data.id,
            v_acc_id: data.virtual_account?.id || null,
            v_acc_no: data.virtual_account?.account_number || null,
            balance: data.virtual_account?.balance || 0,
            is_active: data.virtual_account?.is_active ? 'TRUE' : 'FALSE',
            bank_name: data.virtual_account?.bank_name || null,
            status: data.virtual_account?.status || null,
            ifsc: data.virtual_account?.ifsc || null,
            is_conn_bnk: data.virtual_account?.is_connected_banking ? 'TRUE' : 'FALSE',
            insta_vpa: data.insta_primary_vpa || null,
            kyc_status: data.kyc_status ? 'TRUE' : 'FALSE',
            bank_status: data.bank_status ? 'TRUE' : 'FALSE',
            kyc_prof_status: data.kyc_profile_status || null,
            kyc_exp_dt: data.kyc_expiry_date || null, 
            store_name: data.name || null,
            created_by: 'LEVANT_WEBHOOK',
            
            // Convert entire arrays into stringified JSON. 
            // If the array doesn't exist in the payload, it inserts NULL.
            kyc_data: data.kyc ? JSON.stringify(data.kyc) : null,
            upi: data.commission_charges?.UPI ? JSON.stringify(data.commission_charges.UPI) : null,
            imps: data.commission_charges?.IMPS ? JSON.stringify(data.commission_charges.IMPS) : null,
            neft: data.commission_charges?.NEFT ? JSON.stringify(data.commission_charges.NEFT) : null,
            rtgs: data.commission_charges?.RTGS ? JSON.stringify(data.commission_charges.RTGS) : null
        };

        // Insert into td_kyc_approval — F_Insert(dbId, query, params)
        const insertLog = await F_Insert(DB_ID, insertQuery, kycValues);
        
        console.log(`Successfully inserted into td_kyc_approval. Rows affected: ${insertLog.rowsAffected}`);

    } catch (error) {
        console.error("KYC Webhook Error:", error);
    }
};


// --- 2. TRANSACTION WEBHOOK HANDLER ---
exports.transactionReceiver = async (req, res) => {
    try {
        const payload = req.body;
        
        if (!payload || !payload.data) {
            return res.status(400).json({ success: false, message: "Invalid payload format" });
        }
        
        // Immediately acknowledge receipt to Levant
        res.status(200).json({ success: true, message: "Transaction Webhook received" });

        const data = payload.data;
        console.log(`Processing Transaction Credit. UTR: ${data.unique_transaction_reference}, Amount: ${data.amount}`);

        // Helper 1: Format Levant's ISO timestamps to Oracle TO_DATE format ("YYYY-MM-DD HH24:MI:SS")
        const formatLevantDate = (isoString) => {
            if (!isoString) return null;
            return isoString.substring(0, 19).replace('T', ' ');
        };

        // Helper 2: Safely trim strings to prevent Oracle "value too large" crashes
        const safeString = (str, maxLength) => {
            if (!str) return null;
            return String(str).substring(0, maxLength);
        };

        // Build the full INSERT SQL statement
        const insertQuery = `
            INSERT INTO td_transaction_credit (
                TRANS_ID, TRANS_CREATED_AT, REMITTER_FULL_NAME, REMITTER_UPI_HANDLE, 
                REMITTER_ACC_NO, REMITTER_ACC_IFSC, REMITTER_PHONE_NO, UNIQUE_TRANSACTION_REFF, 
                PAYMENT_MODE, AMOUNT, SERVICE_CHARGE, GST_AMOUNT, SERVICE_CHARGE_WITH_GST, 
                NARRATION, STATUS, TRANSACTION_DT, SETTLEMENT_DT, 
                VIRTUAL_ACC_ID, VIRTUAL_ACC_LABEL, VIRTUAL_ACC_NUMBER, VIRTUAL_IFSC_NO, 
                VIRTUAL_UPI_HANDLE, UPI_PARAMS_TR, UPI_PARAMS_TID, IS_CC_ON_UPI, 
                AUTHORIZATION, CREATED_BY, CREATED_AT
            ) VALUES (
                :t_id, TO_DATE(:t_created, 'YYYY-MM-DD HH24:MI:SS'), :r_name, :r_upi, 
                :r_acc, :r_ifsc, :r_phone, :utr, :mode, :amt, :schg, :gst, :schg_gst, 
                :narration, :status, TO_DATE(:t_dt, 'YYYY-MM-DD HH24:MI:SS'), TO_DATE(:s_dt, 'YYYY-MM-DD HH24:MI:SS'), 
                :v_acc_id, :v_acc_lbl, :v_acc_no, :v_ifsc, :v_upi, :upi_tr, :upi_tid, :is_cc, 
                :auth, :c_by, SYSDATE
            )
        `;

        // Map payload to table definition, enforcing byte limits
        const transValues = {
            t_id: safeString(data.id),
            t_created: formatLevantDate(data.created_at),
            r_name: safeString(data.remitter_full_name),
            r_upi: safeString(data.remitter_upi_handle),
            r_acc: safeString(data.remitter_account_number),
            r_ifsc: safeString(data.remitter_account_ifsc),
            r_phone: safeString(data.remitter_phone_number),
            utr: data.unique_transaction_reference ? Number(data.unique_transaction_reference) : null,
            mode: safeString(data.payment_mode),
            amt: data.amount || 0,
            schg: data.service_charge || 0,
            gst: data.gst_amount || 0,
            schg_gst: data.service_charge_with_gst || 0,
            narration: safeString(data.narration),
            status: safeString(data.status),
            t_dt: formatLevantDate(data.transaction_date),
            s_dt: formatLevantDate(data.settlement_date),
            
            // Virtual Account Details
            v_acc_id: safeString(data.virtual_account?.id),
            v_acc_lbl: safeString(data.virtual_account?.label),
            v_acc_no: safeString(data.virtual_account?.virtual_account_number),
            v_ifsc: safeString(data.virtual_account?.virtual_ifsc_number),
            v_upi: safeString(data.virtual_account?.virtual_upi_handle),
            
            // Metadata (UPI Params)
            upi_tr: safeString(data.metadata?.upi_params_tr),
            upi_tid: safeString(data.metadata?.upi_params_tid),
            
            // Other details
            is_cc: safeString(data.is_cc_on_upi),
            auth: safeString(data.Authorization),
            c_by: 'LEVANT_WEBHOOK'
        };

        // Execute DB Insert — F_Insert(dbId, query, params)
        const insertResult = await F_Insert(DB_ID, insertQuery, transValues);

        console.log(`Successfully inserted into td_transaction_credit. Rows affected: ${insertResult.rowsAffected}`);

    } catch (error) { 
        console.error("Transaction Webhook Error:", error); 
    }
};

// --- 3. SETTLEMENT INITIATED HANDLER ---
exports.settlementInitiateReceiver = async (req, res) => {
    try {
        const payload = req.body;
        
        if (!payload || !payload.data) {
            return res.status(400).json({ success: false, message: "Invalid payload format" });
        }
        
        // Immediately acknowledge receipt to Levant
        res.status(200).json({ success: true, message: "Settlement Initiate received" });

        const data = payload.data;
        console.log(`Processing Settlement Initiated. ID: ${data.id}, Amount: ${data.amount}`);

        // Helper 1: Format Levant's ISO timestamps to Oracle TO_DATE format
        const formatLevantDate = (isoString) => {
            if (!isoString) return null;
            return isoString.substring(0, 19).replace('T', ' ');
        };

        // Helper 2: Safely trim strings to prevent Oracle "value too large" crashes
        const safeString = (str, maxLength) => {
            if (str === null || str === undefined) return null;
            return String(str).substring(0, maxLength);
        };

        // Build the full INSERT SQL statement
        const insertQuery = `
            INSERT INTO td_settlement_initiated (
                SETTLE_INITIATE_ID, SETTLE_INITIATED_CREATED_AT, DISBURSEMENT_TYPE, 
                BENIFICIARY_BANK_NAME, BENIFICIARY_ACC_NAME, BENIFICIARY_ACC_NO, 
                BENIFICIARY_ACC_IFSC, BENIFICIARY_UPI_HANDLE, UNIQUE_TRANSACTION_REFF, 
                PAYMENT_MODE, CURRENCY, AMOUNT, SERVICE_CHARGE, GST_AMOUNT, 
                SERVICE_CHARGE_WITH_GST, NARRATION, STATUS, FALIURE_REASON, 
                DISBURSEMENT_DATE, AUTHORIZATION, MERCHANT_NAME, MERCHANT_EMAIL, 
                MERCHANT_ID, CREATED_BY, CREATED_AT
            ) VALUES (
                :s_id, TO_DATE(:s_created, 'YYYY-MM-DD HH24:MI:SS'), :d_type, 
                :b_bank, :b_name, :b_acc, :b_ifsc, :b_upi, :utr, :mode, :curr, 
                :amt, :schg, :gst, :schg_gst, :narr, :status, :fail_rsn, 
                TO_DATE(:d_date, 'YYYY-MM-DD HH24:MI:SS'), :auth, :m_name, :m_email, 
                :m_id, :c_by, SYSDATE
            )
        `;

        // Map payload to table definition, enforcing byte limits
        const settleValues = {
            s_id: safeString(data.id),
            s_created: formatLevantDate(data.created_at),
            d_type: safeString(data.disbursement_type), 
            b_bank: safeString(data.beneficiary_bank_name),
            b_name: safeString(data.beneficiary_account_name),
            b_acc: safeString(data.beneficiary_account_number),
            b_ifsc: safeString(data.beneficiary_account_ifsc),
            b_upi: safeString(data.beneficiary_upi_handle),
            utr: safeString(data.unique_transaction_reference),
            mode: safeString(data.payment_mode),
            curr: safeString(data.currency),
            amt: data.amount || 0,
            schg: data.service_charge || 0,
            gst: data.gst_amount || 0,
            schg_gst: data.service_charge_with_gst || 0,
            narr: safeString(data.narration),
            status: safeString(data.status), 
            fail_rsn: safeString(data.failure_reason),
            d_date: formatLevantDate(data.disbursement_date),
            auth: safeString(data.Authorization), 
            
            // Nested Merchant Object
            m_name: safeString(data.merchant?.name),
            m_email: safeString(data.merchant?.email),
            m_id: safeString(data.merchant?.id),
            
            c_by: 'LEVANT_WEBHOOK'
        };

        // Execute DB Insert — F_Insert(dbId, query, params)
        const insertResult = await F_Insert(DB_ID, insertQuery, settleValues);

        console.log(`Successfully inserted into td_settlement_initiated. Rows affected: ${insertResult.rowsAffected}`);

    } catch (error) { 
        console.error("Settlement Initiate Error:", error); 
    }
};

// --- 4. SETTLEMENT STATUS UPDATE HANDLER ---
exports.settlementUpdateReceiver = async (req, res) => {
    try {
        const payload = req.body;
        
        if (!payload || !payload.data) {
            return res.status(400).json({ success: false, message: "Invalid payload format" });
        }
        
        // Immediately acknowledge receipt to Levant
        res.status(200).json({ success: true, message: "Settlement Update received" });

        const data = payload.data;
        console.log(`Processing Settlement Update. ID: ${data.id}, Status: ${data.status}`);

        // Helper 1: Format Levant's ISO timestamps to Oracle TO_DATE format
        const formatLevantDate = (isoString) => {
            if (!isoString) return null;
            return isoString.substring(0, 19).replace('T', ' ');
        };

        // Helper 2: Safely trim strings to prevent Oracle "ORA-12899: value too large" crashes
        const safeString = (str, maxLength) => {
            if (str === null || str === undefined) return null;
            return String(str).substring(0, maxLength);
        };

        // Build the full INSERT SQL statement
        const insertQuery = `
            INSERT INTO td_settlement_approval (
                SETTLEMENT_STATUS_ID, SETTLEMENT_STATUS_CREATED_AT, DISBURSEMENT_TYPE, 
                BENIFICIARY_BANK_NAME, BENIFICIARY_ACC_NAME, BENIFICIARY_ACC_NO, 
                BENIFICIARY_ACC_IFSC, BENIFICIARY_UPI_HANDLE, UNIQUE_TRANSACTION_REFF, 
                PAYMENT_MODE, CURRENCY, AMOUNT, SERVICE_CHARGE, GST_AMOUNT, 
                SERVICE_CHARGE_WITH_GST, NARRATION, STATUS, FALIURE_REASON, 
                DISBURSEMENT_DATE, AUTHORIZATION, MERCHANT_NAME, MERCHANT_EMAIL, 
                MERCHANT_ID, CREATED_BY, CREATED_AT
            ) VALUES (
                :s_id, TO_DATE(:s_created, 'YYYY-MM-DD HH24:MI:SS'), :d_type, 
                :b_bank, :b_name, :b_acc, :b_ifsc, :b_upi, :utr, :mode, :curr, 
                :amt, :schg, :gst, :schg_gst, :narr, :status, :fail_rsn, 
                TO_DATE(:d_date, 'YYYY-MM-DD HH24:MI:SS'), :auth, :m_name, :m_email, 
                :m_id, :c_by, SYSDATE
            )
        `;

        // Map payload to table definition
        const settleValues = {
            s_id: safeString(data.id),
            s_created: formatLevantDate(data.created_at),
            d_type: safeString(data.disbursement_type),
            b_bank: safeString(data.beneficiary_bank_name),
            b_name: safeString(data.beneficiary_account_name),
            b_acc: safeString(data.beneficiary_account_number),
            b_ifsc: safeString(data.beneficiary_account_ifsc), 
            b_upi: safeString(data.beneficiary_upi_handle, 20),
            utr: safeString(data.unique_transaction_reference),
            mode: safeString(data.payment_mode),
            curr: safeString(data.currency),
            amt: data.amount || 0,
            schg: data.service_charge || 0,
            gst: data.gst_amount || 0,
            schg_gst: data.service_charge_with_gst || 0,
            narr: safeString(data.narration),
            status: safeString(data.status), 
            fail_rsn: safeString(data.failure_reason),
            d_date: formatLevantDate(data.disbursement_date),
            auth: safeString(data.Authorization),
            
            // Nested Merchant Object
            m_name: safeString(data.merchant?.name),
            m_email: safeString(data.merchant?.email), 
            m_id: safeString(data.merchant?.id),
            
            c_by: 'LEVANT_WEBHOOK'
        };

        // Execute DB Insert — F_Insert(dbId, query, params)
        const insertResult = await F_Insert(DB_ID, insertQuery, settleValues);

        console.log(`Successfully inserted into td_settlement_approval. Rows affected: ${insertResult.rowsAffected}`);

    } catch (error) { 
        console.error("Settlement Update Error:", error); 
    }
};