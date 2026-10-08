// js/history.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { ref, update, onValue } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const tbody = document.getElementById('history-tbody');
const mobileCardsContainer = document.getElementById('mobile-cards-container'); // NEW
const loader = document.getElementById('history-loader');
const tableContainer = document.getElementById('table-container');
const emptyState = document.getElementById('empty-state');

const viewModal = document.getElementById('view-modal');
const thankYouOverlay = document.getElementById('thank-you-overlay');
const btnCancel = document.getElementById('btn-cancel-booking');

// Filters & Controls
const searchInput = document.getElementById('search-input');
const filterDate = document.getElementById('filter-date');
const filterStatus = document.getElementById('filter-status');
const btnClearFilters = document.getElementById('btn-clear-filters');
const btnToggleFilters = document.getElementById('btn-toggle-filters'); // NEW
const filterControls = document.getElementById('filter-controls'); // NEW

let currentUserId = null;
let globalBookings = [];
let currentlyViewingBookingId = null;
let lastKnownStatus = {}; 

// 1. Authenticate User
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentUserId = user.uid;
        fetchLiveHistory();
    } else {
        window.location.href = 'index.html';
    }
});

// Mobile Filter Toggle Logic
btnToggleFilters.addEventListener('click', () => {
    filterControls.classList.toggle('collapsed-mobile');
    if (filterControls.classList.contains('collapsed-mobile')) {
        btnToggleFilters.innerHTML = `<i class="fas fa-filter"></i> Show Filters`;
    } else {
        btnToggleFilters.innerHTML = `<i class="fas fa-times"></i> Hide Filters`;
    }
});

// 2. Real-Time Fetch Logic
function fetchLiveHistory() {
    const bookingsRef = ref(db, 'bookings');
    
    onValue(bookingsRef, (snap) => {
        loader.classList.add('hidden');
        
        if (!snap.exists()) {
            globalBookings = [];
            applyFilters();
            return;
        }

        const allBookings = snap.val();
        globalBookings = [];

        for (const key in allBookings) {
            if (allBookings[key].userId === currentUserId) {
                const b = { id: key, ...allBookings[key] };
                globalBookings.push(b);

                // Detect Manager Scans in Real-Time
                if (currentlyViewingBookingId === b.id) {
                    const prevStatus = lastKnownStatus[b.id];
                    const currentStatus = b.status;

                    if (prevStatus === 'Reserved' && currentStatus === 'Parked') {
                        closeModal();
                    } else if (prevStatus === 'Parked' && currentStatus === 'Exit') {
                        closeModal();
                        showThankYou();
                    }
                    lastKnownStatus[b.id] = currentStatus;
                }
            }
        }

        // Sort Newest First
        globalBookings.sort((a, b) => {
            const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
            const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
            return timeB - timeA;
        });

        applyFilters(); 
    });
}

// 3. Filtering Logic
function applyFilters() {
    const searchTerm = searchInput.value.toLowerCase().trim();
    const dateValue = filterDate.value; 
    const statusValue = filterStatus.value;

    const filtered = globalBookings.filter(b => {
        const matchesSearch = !searchTerm || 
            b.complex.toLowerCase().includes(searchTerm) || 
            b.slot.toLowerCase().includes(searchTerm) || 
            (b.vehicle && b.vehicle.toLowerCase().includes(searchTerm)) ||
            b.id.toLowerCase().includes(searchTerm);

        const matchesDate = !dateValue || b.date === dateValue;
        const matchesStatus = !statusValue || b.status === statusValue;

        return matchesSearch && matchesDate && matchesStatus;
    });

    if (globalBookings.length === 0) {
        tableContainer.classList.add('hidden');
        mobileCardsContainer.classList.add('hidden');
        emptyState.classList.remove('hidden');
    } else if (filtered.length === 0) {
        tableContainer.classList.remove('hidden');
        mobileCardsContainer.classList.remove('hidden');
        emptyState.classList.add('hidden');
        tbody.innerHTML = `<tr><td colspan="7" style="text-align:center; padding: 30px;">No bookings match your filters.</td></tr>`;
        mobileCardsContainer.innerHTML = `<div style="text-align:center; padding:30px; color:#64748b;">No bookings match your filters.</div>`;
    } else {
        tableContainer.classList.remove('hidden');
        mobileCardsContainer.classList.remove('hidden');
        emptyState.classList.add('hidden');
        renderData(filtered); // Calls rendering for both desktop & mobile
    }
}

searchInput.addEventListener('input', applyFilters);
filterDate.addEventListener('change', applyFilters);
filterStatus.addEventListener('change', applyFilters);

btnClearFilters.addEventListener('click', () => {
    searchInput.value = '';
    filterDate.value = '';
    filterStatus.value = '';
    applyFilters();
});

// 4. Render the Data (Both Desktop Table & Mobile Cards)
function renderData(bookings) {
    tbody.innerHTML = '';
    mobileCardsContainer.innerHTML = ''; // Clear mobile view

    bookings.forEach(b => {
        // Status Formatting
        let statusColor = '#64748b'; let statusBg = '#f1f5f9';
        if (b.status === 'Reserved') { statusColor = '#b45309'; statusBg = '#fef3c7'; }
        if (b.status === 'Parked') { statusColor = '#065f46'; statusBg = '#ecfdf5'; }
        if (b.status === 'Exit') { statusColor = '#475569'; statusBg = '#e2e8f0'; }
        if (b.status === 'Cancelled') { statusColor = '#991b1b'; statusBg = '#fef2f2'; }
        
        const fareStr = b.finalFare ? `<strong style="color: #10b981;">₹ ${b.finalFare}</strong>` : '<span style="color:#cbd5e1;">--</span>';

        // --- 1. Desktop Table Row ---
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="mono-text">#${b.id.substring(1, 7).toUpperCase()}</td>
            <td><strong>${b.complex}</strong><br><span style="font-size:0.8em; color:#64748b;">Slot: ${b.slot}</span></td>
            <td>${b.date}<br><span style="font-size:0.8em; color:#64748b;">${b.time}</span></td>
            <td><strong>${b.vehicle || 'N/A'}</strong></td>
            <td>${fareStr}</td>
            <td><span class="status-badge" style="background:${statusBg}; color:${statusColor};">${b.status}</span></td>
            <td><button class="btn-view" data-id="${b.id}">View QR</button></td>
        `;
        tbody.appendChild(tr);

        // --- 2. Mobile Card (Matches Reference Image) ---
        const card = document.createElement('div');
        card.className = 'mobile-booking-card';
        card.innerHTML = `
            <div class="card-header">
                <span class="mono-text">#${b.id.substring(1, 7).toUpperCase()}</span>
                <span class="status-badge" style="background:${statusBg}; color:${statusColor};">${b.status}</span>
            </div>
            <div class="card-row">
                <span class="card-label">COMPLEX :</span>
                <span class="card-value">${b.complex} (Slot: ${b.slot})</span>
            </div>
            <div class="card-row">
                <span class="card-label">DATE & TIME :</span>
                <span class="card-value">${b.date} @ ${b.time}</span>
            </div>
            <div class="card-row">
                <span class="card-label">VEHICLE :</span>
                <span class="card-value">${b.vehicle || 'N/A'}</span>
            </div>
            <div class="card-row">
                <span class="card-label">FARE :</span>
                <span class="card-value">${fareStr}</span>
            </div>
            <button class="btn-view" data-id="${b.id}"><i class="fas fa-qrcode"></i> View QR</button>
        `;
        mobileCardsContainer.appendChild(card);
    });

    // Attach click listeners to ALL "View QR" buttons (Desktop & Mobile)
    document.querySelectorAll('.btn-view').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const id = e.currentTarget.getAttribute('data-id');
            openModal(id);
        });
    });
}

// 5. Modal Handling Logic
function openModal(id) {
    const booking = globalBookings.find(b => b.id === id);
    if (!booking) return;

    currentlyViewingBookingId = id;
    lastKnownStatus[id] = booking.status; 

    document.getElementById('det-id').textContent = `#${id.substring(1, 7).toUpperCase()}`;
    document.getElementById('det-complex').textContent = booking.complex;
    document.getElementById('det-slot').textContent = booking.slot;
    document.getElementById('det-date').textContent = `${booking.date} @ ${booking.time}`;
    document.getElementById('det-vehicle').textContent = booking.vehicle || 'N/A';
    
    const statusEl = document.getElementById('det-status');
    statusEl.textContent = booking.status;
    if (booking.status === 'Reserved') { statusEl.style.background = '#fef3c7'; statusEl.style.color = '#b45309'; }
    else if (booking.status === 'Parked') { statusEl.style.background = '#ecfdf5'; statusEl.style.color = '#065f46'; }
    else { statusEl.style.background = '#f1f5f9'; statusEl.style.color = '#64748b'; }

    const qrData = encodeURIComponent(booking.id);
    document.getElementById('qr-image').src = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${qrData}&color=1e4f73`;

    if (booking.status === 'Reserved') {
        btnCancel.classList.remove('hidden');
    } else {
        btnCancel.classList.add('hidden');
    }

    viewModal.classList.remove('hidden');
}

function closeModal() {
    currentlyViewingBookingId = null;
    viewModal.classList.add('hidden');
}

function showThankYou() {
    thankYouOverlay.classList.remove('hidden');
}

document.getElementById('close-modal').addEventListener('click', closeModal);
document.getElementById('close-thank-you').addEventListener('click', () => { thankYouOverlay.classList.add('hidden'); });

btnCancel.addEventListener('click', async () => {
    if (!currentlyViewingBookingId) return;
    if (confirm("Are you sure you want to cancel this reservation?")) {
        try {
            btnCancel.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Cancelling...`;
            await update(ref(db, `bookings/${currentlyViewingBookingId}`), { status: 'Cancelled' });
            closeModal(); 
            btnCancel.innerHTML = `<i class="fas fa-ban"></i> Cancel Booking`;
        } catch (e) {
            alert("Failed to cancel booking. Please try again.");
            btnCancel.innerHTML = `<i class="fas fa-ban"></i> Cancel Booking`;
        }
    }
});