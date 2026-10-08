// js/parking-data.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { ref, get, onValue } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const tbody = document.getElementById('movement-tbody');
const loader = document.getElementById('data-loader');
const driverModal = document.getElementById('driver-modal');
const btnRefresh = document.getElementById('btn-refresh');

// Filter Inputs
const searchInput = document.getElementById('search-input');
const filterEntryDate = document.getElementById('filter-entry-date');
const filterExitDate = document.getElementById('filter-exit-date');
const btnClearFilters = document.getElementById('btn-clear-filters');

let globalBookings = []; // Caches data for instant filtering

onAuthStateChanged(auth, async (user) => {
    if (user) {
        fetchMovementData();
    } else {
        window.location.href = 'index.html';
    }
});

function fetchMovementData() {
    loader.classList.remove('hidden');

    const bookingsRef = ref(db, 'bookings');
    onValue(bookingsRef, (snap) => {
        if (snap.exists()) {
            globalBookings = [];
            snap.forEach(child => {
                globalBookings.push({ id: child.key, ...child.val() });
            });

            // FIXED: Strict descending sort. Newest timestamps stay at the absolute top.
            globalBookings.sort((a, b) => {
                const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
                const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
                return timeB - timeA; 
            });
            
            applyFilters();
        } else {
            globalBookings = [];
            tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 20px;">No movement records found.</td></tr>`;
        }
        loader.classList.add('hidden');
    }, (error) => {
        console.error("Error fetching data:", error);
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; color: red;">Error loading data. Check console.</td></tr>`;
        loader.classList.add('hidden');
    });
}

// ==========================================
// FILTERING LOGIC
// ==========================================
function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const entryDate = filterEntryDate.value; 
    const exitDate = filterExitDate.value;   

    const filtered = globalBookings.filter(b => {
        const matchesSearch = !searchTerm || 
            b.id.toLowerCase().includes(searchTerm) || 
            (b.vehicle && b.vehicle.toLowerCase().includes(searchTerm)) ||
            (b.driver && b.driver.toLowerCase().includes(searchTerm));

        const matchesEntry = !entryDate || (b.entryTime && b.entryTime.startsWith(entryDate));
        const matchesExit = !exitDate || (b.exitTime && b.exitTime.startsWith(exitDate));

        return matchesSearch && matchesEntry && matchesExit;
    });

    renderTable(filtered);
}

searchInput.addEventListener('input', applyFilters);
filterEntryDate.addEventListener('change', applyFilters);
filterExitDate.addEventListener('change', applyFilters);

btnClearFilters.addEventListener('click', () => {
    searchInput.value = '';
    filterEntryDate.value = '';
    filterExitDate.value = '';
    applyFilters();
});

// ==========================================
// TABLE RENDERING
// ==========================================
function formatTime(isoString) {
    if (!isoString) return '<span style="color:#cbd5e1;">--</span>';
    const date = new Date(isoString);
    return date.toLocaleString('en-GB', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function renderTable(bookings) {
    tbody.innerHTML = '';
    
    if (bookings.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 20px;">No records match your filters.</td></tr>`;
        return;
    }

    bookings.forEach(b => {
        const tr = document.createElement('tr');
        
        let statusColor = '#64748b'; let statusBg = '#f1f5f9';
        if (b.status === 'Reserved') { statusColor = '#b45309'; statusBg = '#fef3c7'; }
        if (b.status === 'Parked') { statusColor = '#065f46'; statusBg = '#ecfdf5'; }
        if (b.status === 'Exit') { statusColor = '#475569'; statusBg = '#e2e8f0'; }
        if (b.status === 'Cancelled') { statusColor = '#991b1b'; statusBg = '#fef2f2'; }

        let fareDisplay = '<span style="color:#cbd5e1;">--</span>';
        if (b.status === 'Exit') {
            fareDisplay = `<strong style="color: #10b981;">₹ ${b.finalFare || 0}</strong>`;
        } else if (b.status === 'Cancelled') {
            fareDisplay = `<span style="color:#ef4444; font-size: 0.75rem; font-weight: bold;">CANCELLED</span>`;
        }

        tr.innerHTML = `
            <td class="mono-text">#${b.id.substring(1, 7).toUpperCase()}</td>
            <td><strong>${b.vehicle || 'N/A'}</strong></td>
            <td>
                <button class="driver-link-btn" data-uid="${b.userId}" title="View Driver Contact Info">
                    <i class="fas fa-user-circle"></i> ${b.driver || 'Unknown'}
                </button>
            </td>
            <td>${b.complex}<br><span style="font-size:0.8em; color:#64748b;">Slot: ${b.slot}</span></td>
            <td>${b.date} <br> ${b.time}</td>
            <td>${formatTime(b.entryTime)}</td>
            <td>${formatTime(b.exitTime)}</td>
            <td>${fareDisplay}</td>
            <td><span style="background:${statusBg}; color:${statusColor}; padding: 4px 10px; border-radius: 12px; font-size: 0.75rem; font-weight: bold; text-transform: uppercase;">${b.status}</span></td>
        `;
        tbody.appendChild(tr);
    });

    // Attach click listeners
    document.querySelectorAll('.driver-link-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const uid = e.currentTarget.getAttribute('data-uid');
            openDriverProfile(uid);
        });
    });
}

// ==========================================
// DRIVER PROFILE LOOKUP
// ==========================================
async function openDriverProfile(uid) {
    if (!uid) return alert("No User ID associated with this booking.");
    
    driverModal.classList.remove('hidden');
    document.getElementById('driver-profile-content').style.display = 'none';
    document.getElementById('driver-loader').classList.remove('hidden');

    try {
        const userSnap = await get(ref(db, `users/${uid}`));
        
        if (userSnap.exists()) {
            const u = userSnap.val();
            const p = u.personalDetails || {}; 
            const a = u.address || {}; 
            
            document.getElementById('prof-name').textContent = `${p.firstName || u.firstName || ''} ${p.lastName || u.lastName || ''}`.trim() || 'Unknown User';
            document.getElementById('prof-role').textContent = u.role ? u.role.toUpperCase() : 'USER';
            document.getElementById('prof-email').textContent = p.email || u.email || 'N/A';
            document.getElementById('prof-phone').textContent = p.mobile || u.mobile || 'N/A';
            document.getElementById('prof-aadhaar').textContent = p.aadhaar || 'N/A';
            document.getElementById('prof-wallet').textContent = `₹ ${parseFloat(u.walletBalance || 0).toFixed(2)}`;
            
            const locationParts = [a.village, a.district, a.state].filter(Boolean).join(', ');
            let fullAddress = 'Address not provided';
            if (locationParts && a.pincode) { fullAddress = `${locationParts}-${a.pincode}`; } 
            else if (locationParts) { fullAddress = locationParts; } 
            else if (a.pincode) { fullAddress = `Pincode: ${a.pincode}`; }
            
            document.getElementById('prof-address').textContent = fullAddress;
            document.getElementById('prof-created').textContent = u.createdAt ? new Date(u.createdAt).toLocaleDateString('en-GB') : 'N/A';

            document.getElementById('driver-loader').classList.add('hidden');
            document.getElementById('driver-profile-content').style.display = 'block';
        } else {
            alert("User profile no longer exists in database.");
            driverModal.classList.add('hidden');
        }
    } catch (e) {
        console.error(e);
        alert("Failed to fetch user data.");
        driverModal.classList.add('hidden');
    }
}

document.getElementById('close-driver-modal').addEventListener('click', () => {
    driverModal.classList.add('hidden');
});

btnRefresh.addEventListener('click', () => {
    fetchMovementData();
});