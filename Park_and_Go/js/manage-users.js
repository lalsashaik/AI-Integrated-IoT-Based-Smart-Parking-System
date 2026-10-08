import { db } from './firebase-config.js';
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const filterInput = document.getElementById('user-directory-filter');
const resultsTbody = document.getElementById('dir-results-tbody');
const countBadge = document.getElementById('results-count');
const editSection = document.getElementById('edit-user-section');
const editForm = document.getElementById('admin-edit-form');
const notification = document.getElementById('overflow-notification');

let cachedUsers = {}; 
let currentEditingUid = null;

function showMsg(msg, type = 'success') {
    notification.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${msg}`;
    notification.className = `overflow-msg show ${type}`;
    setTimeout(() => notification.classList.remove('show'), 4000);
}

async function loadDirectory() {
    resultsTbody.innerHTML = '<tr><td colspan="5" style="text-align:center;"><i class="fas fa-spinner fa-spin"></i> Loading All Users...</td></tr>';
    const snap = await get(ref(db, 'users'));
    if (snap.exists()) {
        cachedUsers = snap.val();
        applyFilter("");
    }
}

function applyFilter(query) {
    const term = query.toLowerCase();
    resultsTbody.innerHTML = '';
    let matches = 0;

    for (const uid in cachedUsers) {
        const u = cachedUsers[uid];
        const pd = u.personalDetails || {};
        const name = `${pd.firstName || u.firstName || ''} ${pd.lastName || u.lastName || ''}`.toLowerCase();
        const vehicle = (pd.vehicleNumber || '').toLowerCase();

        if (name.includes(term) || vehicle.includes(term) || u.email.toLowerCase().includes(term)) {
            matches++;
            resultsTbody.insertAdjacentHTML('beforeend', `
                <tr>
                    <td><strong>${name.toUpperCase()}</strong></td>
                    <td>${u.email}<br><small>${pd.mobile || '---'}</small></td>
                    <td><i class="fas fa-car"></i> ${pd.vehicleNumber || '---'}<br><small>AAD: ${pd.aadhaar || '---'}</small></td>
                    <td><span class="status-badge status-active">${u.role || 'user'}</span></td>
                    <td><button class="btn-view" onclick="window.loadUserForEdit('${uid}')">Edit</button></td>
                </tr>
            `);
        }
    }
    countBadge.textContent = `${matches} Users Loaded`;
}

filterInput.addEventListener('input', (e) => applyFilter(e.target.value));

window.loadUserForEdit = (uid) => {
    currentEditingUid = uid;
    const u = cachedUsers[uid];
    const pd = u.personalDetails || {};
    const addr = u.address || {};

    document.getElementById('editing-user-display').textContent = (pd.firstName || u.firstName || 'User').toUpperCase();
    document.getElementById('edit-fname').value = pd.firstName || u.firstName || '';
    document.getElementById('edit-lname').value = pd.lastName || u.lastName || '';
    document.getElementById('edit-mobile').value = pd.mobile || '';
    document.getElementById('edit-dob').value = pd.dob || '';
    document.getElementById('edit-aadhaar').value = pd.aadhaar || '';
    document.getElementById('edit-vehicle').value = pd.vehicleNumber || '';
    document.getElementById('edit-state').value = addr.state || '';
    document.getElementById('edit-district').value = addr.district || '';
    document.getElementById('edit-village').value = addr.village || '';
    document.getElementById('edit-pincode').value = addr.pincode || '';

    editSection.classList.remove('hidden');
    editSection.scrollIntoView({ behavior: 'smooth' });
};

editForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const updates = {
        personalDetails: {
            firstName: document.getElementById('edit-fname').value,
            lastName: document.getElementById('edit-lname').value,
            mobile: document.getElementById('edit-mobile').value,
            dob: document.getElementById('edit-dob').value,
            aadhaar: document.getElementById('edit-aadhaar').value,
            vehicleNumber: document.getElementById('edit-vehicle').value.toUpperCase()
        },
        address: {
            state: document.getElementById('edit-state').value,
            district: document.getElementById('edit-district').value,
            village: document.getElementById('edit-village').value,
            pincode: document.getElementById('edit-pincode').value
        }
    };

    try {
        await update(ref(db, `users/${currentEditingUid}`), updates);
        showMsg("Details updated successfully", "success");
        editSection.classList.add('hidden');
        loadDirectory();
    } catch (err) {
        showMsg("Update failed", "error");
    }
});

document.getElementById('btn-close-edit').onclick = () => editSection.classList.add('hidden');
loadDirectory();