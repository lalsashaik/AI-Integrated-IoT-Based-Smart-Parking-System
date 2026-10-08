// js/manage-wallets.js
import { auth, db } from './firebase-config.js';
import { ref, get, update, push } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const searchInput = document.getElementById('global-search-input');
const btnSearch = document.getElementById('btn-search-all');
const resultsSection = document.getElementById('search-results-section');
const resultsTbody = document.getElementById('search-results-tbody');
const rechargeSection = document.getElementById('recharge-form-section');
const btnProcess = document.getElementById('btn-process-recharge');
const notification = document.getElementById('overflow-notification');

let allUsers = {}; 
let selectedUid = null;

// OVERFLOW MESSAGE FUNCTION
function showOverflow(msg, type = 'success') {
    notification.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${msg}`;
    notification.className = `overflow-msg show ${type}`;
    setTimeout(() => { notification.classList.remove('show'); }, 4000);
}

btnSearch.addEventListener('click', async () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
        showOverflow("Please enter a search term.", "error");
        return;
    }

    resultsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Searching database...</td></tr>';
    resultsSection.classList.remove('hidden');
    rechargeSection.classList.add('hidden');

    const usersSnap = await get(ref(db, 'users'));
    if (usersSnap.exists()) {
        allUsers = usersSnap.val();
        renderSearchResults(query);
    } else {
        resultsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">Database node empty.</td></tr>';
    }
});

function renderSearchResults(query) {
    resultsTbody.innerHTML = '';
    let matchCount = 0;

    for (const uid in allUsers) {
        const u = allUsers[uid];
        const pd = u.personalDetails || {};
        const fullName = `${pd.firstName || u.firstName || ''} ${pd.lastName || u.lastName || ''}`.toLowerCase();
        const vehicle = (pd.vehicleNumber || '').toLowerCase();
        const aadhaar = (pd.aadhaar || '').toLowerCase();

        if (fullName.includes(query) || vehicle.includes(query) || aadhaar.includes(query)) {
            matchCount++;
            const row = `
                <tr>
                    <td><strong>${fullName.toUpperCase()}</strong><br><small style="color:#94a3b8">${u.email}</small></td>
                    <td>${pd.vehicleNumber || '---'}</td>
                    <td>${pd.aadhaar || '---'}</td>
                    <td style="color:#10b981; font-weight:700;">₹${parseFloat(u.walletBalance || 0).toFixed(2)}</td>
                    <td><button class="btn-view" onclick="window.selectUserForRecharge('${uid}')">Select User</button></td>
                </tr>
            `;
            resultsTbody.insertAdjacentHTML('beforeend', row);
        }
    }
    if (matchCount === 0) resultsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No records found for "${query}".</td></tr>';
}

window.selectUserForRecharge = (uid) => {
    selectedUid = uid;
    const u = allUsers[uid];
    const pd = u.personalDetails || {};
    const initials = `${pd.firstName?.charAt(0) || u.firstName?.charAt(0) || 'U'}${pd.lastName?.charAt(0) || u.lastName?.charAt(0) || 'S'}`.toUpperCase();

    document.getElementById('sel-user-initials').textContent = initials;
    document.getElementById('sel-user-name').textContent = `${pd.firstName || u.firstName} ${pd.lastName || u.lastName || ''}`.toUpperCase();
    document.getElementById('sel-user-details').textContent = `Vehicle: ${pd.vehicleNumber || 'N/A'} | UID: ${uid.substring(0,8)}`;
    document.getElementById('sel-user-balance').textContent = `₹${parseFloat(u.walletBalance || 0).toFixed(2)}`;
    
    rechargeSection.classList.remove('hidden');
    document.getElementById('admin-recharge-amt').focus();
};

btnProcess.addEventListener('click', async () => {
    const amtInput = document.getElementById('admin-recharge-amt');
    const amt = parseFloat(amtInput.value);
    
    if (isNaN(amt) || amt <= 0) {
        showOverflow("Enter a valid recharge amount.", "error");
        return;
    }

    btnProcess.disabled = true;
    btnProcess.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Processing Cash Transaction...';

    try {
        const userRef = ref(db, `users/${selectedUid}`);
        const snap = await get(userRef);
        const currentBal = snap.exists() ? (snap.val().walletBalance || 0) : 0;
        const newBal = currentBal + amt;

        await update(userRef, { walletBalance: newBal });
        await push(ref(db, 'transactions'), {
            userId: selectedUid,
            type: 'Credit',
            amount: amt,
            description: `Counter Recharge (Mgr: ${auth.currentUser.email})`,
            timestamp: new Date().toISOString()
        });

        showOverflow(`Successfully recharged ₹${amt} to ${document.getElementById('sel-user-name').textContent}`, "success");
        setTimeout(() => { location.reload(); }, 2500);
    } catch (e) {
        showOverflow("Transaction Failed: " + e.message, "error");
        btnProcess.disabled = false;
        btnProcess.textContent = "Confirm Cash Recharge";
    }
});