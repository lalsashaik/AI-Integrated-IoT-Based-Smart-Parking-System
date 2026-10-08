// js/profilesettings.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { ref, get, update } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const userForm = document.getElementById('user-profile-form');
const managerForm = document.getElementById('manager-profile-form');
const loader = document.getElementById('profile-loader');
const statusMsg = document.getElementById('save-status');

let currentUserId = null;
let isManager = false;

// 1. Authenticate and Fetch Data
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUserId = user.uid;
    
    // Check if the user is a Manager first
    const managerSnap = await get(ref(db, `managers/${user.uid}`));
    
    if (managerSnap.exists()) {
        isManager = true;
        populateManagerForm(managerSnap.val());
    } else {
        // If not a manager, they are a User or Admin (stored in 'users' node)
        isManager = false;
        const userSnap = await get(ref(db, `users/${user.uid}`));
        if (userSnap.exists()) {
            populateUserForm(userSnap.val());
        } else {
            // Fallback for isolated legacy admins, if any
            const adminSnap = await get(ref(db, `admins/${user.uid}`));
            if(adminSnap.exists()) populateUserForm(adminSnap.val());
        }
    }
  } else {
    window.location.href = 'index.html';
  }
});

// ==========================================
// POPULATION LOGIC
// ==========================================
function populateUserForm(data) {
  loader.classList.add('hidden');
  userForm.classList.remove('hidden');

  const pd = data.personalDetails || {};
  const addr = data.address || {};

  document.getElementById('prof-fname').value = pd.firstName || data.firstName || '';
  document.getElementById('prof-lname').value = pd.lastName || data.lastName || '';
  document.getElementById('prof-email').value = pd.email || data.email || '';
  document.getElementById('prof-mobile').value = pd.mobile || '';
  document.getElementById('prof-dob').value = pd.dob || '';
  document.getElementById('prof-aadhaar').value = pd.aadhaar || '';
  document.getElementById('prof-vehicle').value = pd.vehicleNumber || '';

  document.getElementById('prof-state').value = addr.state || '';
  document.getElementById('prof-district').value = addr.district || '';
  document.getElementById('prof-village').value = addr.village || '';
  document.getElementById('prof-pincode').value = addr.pincode || '';
}

function populateManagerForm(data) {
  loader.classList.add('hidden');
  managerForm.classList.remove('hidden');

  const p = data.personal || {};
  const c = data.complex || {};
  const addr = c.address || {};

  document.getElementById('mgr-fname').value = p.firstName || '';
  document.getElementById('mgr-lname').value = p.lastName || '';
  document.getElementById('mgr-email').value = data.email || '';
  document.getElementById('mgr-mobile').value = p.mobile || '';
  document.getElementById('mgr-aadhaar').value = p.aadhaar || '';
  document.getElementById('mgr-id').value = data.managerID || '';

  document.getElementById('mgr-complex-name').value = c.name || '';
  document.getElementById('mgr-prefix').value = c.prefix || '';
  document.getElementById('mgr-slots').value = c.totalSlots || '';
  document.getElementById('mgr-timings').value = c.timings || '';

  document.getElementById('mgr-state').value = addr.state || '';
  document.getElementById('mgr-district').value = addr.district || '';
  document.getElementById('mgr-village').value = addr.village || '';
  document.getElementById('mgr-door').value = addr.door || '';
}

// ==========================================
// SUBMISSION LOGIC
// ==========================================
function displayStatus(msg, isSuccess = true) {
    statusMsg.textContent = msg;
    statusMsg.className = `status-msg ${isSuccess ? 'success' : 'error'}`;
    setTimeout(() => { location.reload(); }, 1500);
}

// User/Admin Save
userForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-save-user');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  btn.disabled = true;

  const updatedData = {
    personalDetails: {
      firstName: document.getElementById('prof-fname').value,
      lastName: document.getElementById('prof-lname').value,
      email: document.getElementById('prof-email').value,
      mobile: document.getElementById('prof-mobile').value,
      dob: document.getElementById('prof-dob').value,
      aadhaar: document.getElementById('prof-aadhaar').value,
      vehicleNumber: document.getElementById('prof-vehicle').value.toUpperCase()
    },
    address: {
      state: document.getElementById('prof-state').value,
      district: document.getElementById('prof-district').value,
      village: document.getElementById('prof-village').value,
      pincode: document.getElementById('prof-pincode').value
    }
  };

  try {
    await update(ref(db, `users/${currentUserId}`), updatedData);
    displayStatus("User Profile updated successfully!");
  } catch (err) {
    displayStatus("Error: " + err.message, false);
    btn.disabled = false;
  }
});

// Manager Save
managerForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const btn = document.getElementById('btn-save-mgr');
  btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Saving...';
  btn.disabled = true;

  const updatedData = {
    "personal/firstName": document.getElementById('mgr-fname').value,
    "personal/lastName": document.getElementById('mgr-lname').value,
    "personal/mobile": document.getElementById('mgr-mobile').value,
    "personal/aadhaar": document.getElementById('mgr-aadhaar').value,
    "complex/name": document.getElementById('mgr-complex-name').value,
    "complex/prefix": document.getElementById('mgr-prefix').value,
    "complex/totalSlots": document.getElementById('mgr-slots').value,
    "complex/timings": document.getElementById('mgr-timings').value,
    "complex/address/state": document.getElementById('mgr-state').value,
    "complex/address/district": document.getElementById('mgr-district').value,
    "complex/address/village": document.getElementById('mgr-village').value,
    "complex/address/door": document.getElementById('mgr-door').value
  };

  try {
    await update(ref(db, `managers/${currentUserId}`), updatedData);
    displayStatus("Manager Settings updated successfully!");
  } catch (err) {
    displayStatus("Error: " + err.message, false);
    btn.disabled = false;
  }
});