// js/manage-managers.js
import { auth, db } from './firebase-config.js';
import { createUserWithEmailAndPassword, sendEmailVerification } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { ref, set, get, onValue, update } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const regForm = document.getElementById('manager-reg-form');
const listBody = document.getElementById('manager-list-body');
const notification = document.getElementById('overflow-notification');

// Generate ID Format: PKSP2603XXXX
function generatePKSPID() {
    const d = new Date();
    const yy = d.getFullYear().toString().slice(-2);
    const mm = (d.getMonth() + 1).toString().padStart(2, '0');
    return `PKSP${yy}${mm}${Math.floor(1000 + Math.random() * 9000)}`;
}

// Notification Helper
function showOverflow(msg, type = 'success') {
    if(!notification) {
        alert(msg);
        return;
    }
    notification.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-exclamation-circle'}"></i> ${msg}`;
    notification.className = `overflow-msg show ${type}`;
    setTimeout(() => notification.classList.remove('show'), 4000);
}

// 1. Load Managers into Directory Table
onValue(ref(db, 'managers'), (snap) => {
    if(!listBody) return;
    listBody.innerHTML = '';
    
    if (snap.exists()) {
        const data = snap.val();
        Object.keys(data).forEach(uid => {
            const m = data[uid];
            listBody.insertAdjacentHTML('beforeend', `
                <tr>
                    <td><strong>${m.managerID}</strong></td>
                    <td>${m.personal.firstName} ${m.personal.lastName}</td>
                    <td>${m.complex.name}</td>
                    <td>${m.complex.totalSlots} Slots</td>
                    <td><button class="btn-view" onclick="window.showDetails('${uid}')">Show More</button></td>
                </tr>
            `);
        });
    } else {
        listBody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 20px;">No managers registered yet.</td></tr>';
    }
});

// 2. Dual-Node Registration Logic (Manager + Complex)
if (regForm) {
    regForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const btn = document.getElementById('reg-submit-btn');
        const pass = document.getElementById('reg-pass').value;
        const confirmPass = document.getElementById('reg-confirm').value;

        if (pass !== confirmPass) return alert("Passwords mismatch!");

        btn.disabled = true;
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Registering System Data...';
        
        const email = document.getElementById('reg-email').value;
        const mID = generatePKSPID();
        const complexName = document.getElementById('reg-complex').value;
        const firstName = document.getElementById('reg-fname').value;
        const lastName = document.getElementById('reg-lname').value;
        const totalSlots = document.getElementById('reg-slot-qty').value;

        try {
            // A. Create Auth User & Send Verification
            const cred = await createUserWithEmailAndPassword(auth, email, pass);
            await sendEmailVerification(cred.user);

            // B. Prepare Manager Profile Data
            const managerData = {
                managerID: mID,
                email: email,
                personal: {
                    firstName: firstName,
                    lastName: lastName,
                    aadhaar: document.getElementById('reg-aadhaar').value,
                    mobile: document.getElementById('reg-mobile').value
                },
                complex: {
                    name: complexName,
                    prefix: document.getElementById('reg-prefix').value,
                    totalSlots: totalSlots,
                    timings: `${document.getElementById('reg-open').value} - ${document.getElementById('reg-close').value}`,
                    address: {
                        state: document.getElementById('reg-state').value,
                        district: document.getElementById('reg-district').value,
                        village: document.getElementById('reg-village').value,
                        door: document.getElementById('reg-door').value
                    }
                },
                role: 'manager',
                createdAt: new Date().toISOString()
            };

            // C. Prepare Standalone Complex Data for the Users/Booking side
            const complexData = {
                name: complexName,
                managerUid: cred.user.uid,
                managerName: `${firstName} ${lastName}`,
                prefix: document.getElementById('reg-prefix').value,
                totalSlots: totalSlots,
                timings: `${document.getElementById('reg-open').value} - ${document.getElementById('reg-close').value}`,
                address: {
                    state: document.getElementById('reg-state').value,
                    district: document.getElementById('reg-district').value,
                    village: document.getElementById('reg-village').value,
                    door: document.getElementById('reg-door').value
                },
                status: "Active",
                createdAt: new Date().toISOString()
            };

            // D. Execute Both Database Writes Simultaneously
            await set(ref(db, `managers/${cred.user.uid}`), managerData);
            await set(ref(db, `complexes/${complexName}`), complexData);
            
            showOverflow(`Success! Verification sent to ${email}. ID: ${mID} and Complex stored!`);
            document.getElementById('registration-overlay').classList.add('hidden');
            regForm.reset();

        } catch (err) { 
            alert("Registration Failed: " + err.message); 
        } finally { 
            btn.disabled = false; 
            btn.innerHTML = 'Register Manager & Send Verification';
        }
    });
}

// 3. Show More Detail Modal
window.showDetails = async (uid) => {
    const snap = await get(ref(db, `managers/${uid}`));
    if (!snap.exists()) return;
    
    const m = snap.val();
    const content = document.getElementById('details-content');
    
    content.innerHTML = `
        <div class="mgmt-modal-header">
            <h3>Profile: ${m.managerID}</h3>
            <button onclick="document.getElementById('details-overlay').classList.add('hidden')" class="close-overlay">&times;</button>
        </div>
        
        <h4 class="sub-title"><i class="fas fa-user-shield"></i> Personal Data</h4>
        <div class="mgmt-grid">
            <div class="field"><label>First Name</label><input type="text" id="edit-fname" value="${m.personal.firstName}"></div>
            <div class="field"><label>Last Name</label><input type="text" id="edit-lname" value="${m.personal.lastName}"></div>
            <div class="field"><label>Aadhaar</label><input type="text" id="edit-aadhaar" value="${m.personal.aadhaar}"></div>
            <div class="field"><label>Mobile</label><input type="text" id="edit-mobile" value="${m.personal.mobile}"></div>
        </div>
        
        <h4 class="sub-title"><i class="fas fa-building"></i> Infrastructure Settings</h4>
        <div class="mgmt-grid">
            <div class="field"><label>Complex Name</label><input type="text" id="edit-cname" value="${m.complex.name}" disabled style="background:#f1f5f9;"></div>
            <div class="field"><label>Total Capacity (Slots)</label><input type="number" id="edit-slots" value="${m.complex.totalSlots}"></div>
        </div>
        
        <button class="submit-full-btn" onclick="window.saveEdits('${uid}', '${m.complex.name}')">Synchronize & Save Modifications</button>
    `;
    document.getElementById('details-overlay').classList.remove('hidden');
};

// 4. Synchronized Data Editing
window.saveEdits = async (uid, complexName) => {
    try {
        const newFname = document.getElementById('edit-fname').value;
        const newLname = document.getElementById('edit-lname').value;
        const newSlots = document.getElementById('edit-slots').value;

        // Update Manager Private Node
        await update(ref(db, `managers/${uid}`), {
            "personal/firstName": newFname,
            "personal/lastName": newLname,
            "personal/aadhaar": document.getElementById('edit-aadhaar').value,
            "personal/mobile": document.getElementById('edit-mobile').value,
            "complex/totalSlots": newSlots
        });

        // Update Public Complexes Node (Keeping data synchronized)
        await update(ref(db, `complexes/${complexName}`), {
            "managerName": `${newFname} ${newLname}`,
            "totalSlots": newSlots
        });

        showOverflow("Manager and Complex nodes updated successfully!");
        document.getElementById('details-overlay').classList.add('hidden');
    } catch(e) {
        alert("Update Error: " + e.message);
    }
};

// UI Triggers for the Registration Modal
const showRegBtn = document.getElementById('show-registration-btn');
if (showRegBtn) showRegBtn.onclick = () => document.getElementById('registration-overlay').classList.remove('hidden');

const closeRegBtn = document.getElementById('close-reg-btn');
if (closeRegBtn) closeRegBtn.onclick = () => document.getElementById('registration-overlay').classList.add('hidden');