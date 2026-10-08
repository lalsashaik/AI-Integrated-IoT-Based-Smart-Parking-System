// js/dashboard.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { ref, get, onValue } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const contentArea = document.querySelector('.content-area');

onAuthStateChanged(auth, async (user) => {
    if (user) {
        contentArea.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--primary-blue); font-size: 1.2rem;"><i class="fas fa-spinner fa-spin"></i> Fetching system data...</div>`;

        let role = 'user'; 
        let firstName = 'User';
        let walletBalance = 0;
        let managerComplex = 'Unassigned';
        
        const [userSnap, adminSnap, managerSnap] = await Promise.all([
            get(ref(db, `users/${user.uid}`)), 
            get(ref(db, `admins/${user.uid}`)),
            get(ref(db, `managers/${user.uid}`)) 
        ]);

        if (userSnap.exists()) {
            role = userSnap.val().role ? userSnap.val().role.toLowerCase() : 'user';
            firstName = userSnap.val().personalDetails?.firstName || userSnap.val().firstName || 'User';
            walletBalance = parseFloat(userSnap.val().walletBalance || 0);
        } else if (managerSnap.exists()) {
            role = 'manager';
            const mgrData = managerSnap.val();
            firstName = mgrData.personal?.firstName || mgrData.firstName || 'Manager';
            
            // FIX: Drill down into complex.name based on Firebase structure
            if (mgrData.complex && mgrData.complex.name) {
                managerComplex = mgrData.complex.name; 
            } else if (typeof mgrData.complex === 'string') {
                managerComplex = mgrData.complex;
            }
        } else if (adminSnap.exists()) {
            role = adminSnap.val().role ? adminSnap.val().role.toLowerCase() : 'admin';
            firstName = adminSnap.val().firstName || 'Admin';
        }
        
        renderDashboard(role, firstName, walletBalance, user.uid, managerComplex);
    } else {
        window.location.href = 'index.html';
    }
});

function renderDashboard(role, firstName, walletBalance, uid, managerComplex) {
    let html = `
        <div class="welcome-section">
            <h2>Welcome back, ${firstName.toUpperCase()}!</h2>
            <p>Here is your current system overview and latest updates.</p>
        </div>
        <div class="stats-grid" id="main-stats-grid">
    `;
    
    let recentActivitiesHtml = '';

    // ==========================================
    // ADMIN DASHBOARD
    // ==========================================
    if (role === 'admin') {
        html += generateCard("System Revenue", "₹ 0.00", "Awaiting live payments data", "fas fa-wallet");
        html += generateCard("Facility Managers", `<span id="admin-mgr-count">0</span>`, "Active manager accounts", "fas fa-user-tie");
        html += generateCard("Total Drivers", `<span id="admin-usr-count">0</span>`, "Registered in system", "fas fa-users");
        recentActivitiesHtml = `<li><span><i class="fas fa-info-circle" style="color: #94a3b8; margin-right: 10px;"></i> Dashboard active.</span></li>`;
    } 
    // ==========================================
    // MANAGER DASHBOARD
    // ==========================================
    else if (role === 'manager') {
        html += generateCard("Assigned Complex", `<span style="color: #1e4f73; font-weight: 800; font-size: 1.2rem;">${managerComplex}</span>`, "Active Facility", "fas fa-building");
        html += generateCard("Today's Parkings", `<span id="mgr-parkings">0</span>`, "Vehicles hosted today", "fas fa-clipboard-check");
        html += generateCard("Today's Revenue", `₹ <span id="mgr-revenue">0.00</span>`, "Collected from exits today", "fas fa-hand-holding-usd");
        
        recentActivitiesHtml = `<div id="mgr-activities"><li><i class="fas fa-spinner fa-spin"></i> Loading complex activities...</li></div>`;
        
        fetchManagerLiveStats(managerComplex);
    } 
    // ==========================================
    // USER DASHBOARD
    // ==========================================
    else {
        html += generateCard("Wallet Balance", `₹ <span id="dyn-wallet">${walletBalance.toFixed(2)}</span>`, "Available funds", "fas fa-wallet");
        html += generateCard("Total Bookings", `<span id="dyn-total">0</span>`, "Lifetime completed", "fas fa-history");
        html += generateCard("Active Booking", `<span id="dyn-active-slot">None</span>`, `<span id="dyn-active-loc">No active reservations</span>`, "fas fa-car");
        
        recentActivitiesHtml = `<div id="dyn-activities"><li><i class="fas fa-spinner fa-spin"></i> Loading recent activities...</li></div>`;

        fetchUserLiveBookings(uid);
    }

    html += `
        <div class="stat-card solid-blue">
            <div class="stat-card-header">
                <h3>System Status</h3>
                <div class="stat-icon"><i class="far fa-clock"></i></div>
            </div>
            <div>
                <div class="stat-value" id="live-date">Loading...</div>
                <div class="stat-desc" id="live-time">Loading...</div>
            </div>
        </div>
    </div>`; 

    html += `
        <div class="data-section">
            <h3>Recent Activities</h3>
            <div class="section-icon"><i class="fas fa-bell"></i></div>
            <ul class="data-list">
                ${recentActivitiesHtml}
            </ul>
        </div>
        
        <div class="dashboard-footer">
            <span><strong>Developed by BATCH-30 Students</strong></span>
            <span>&copy; 2026 Parking Portal System</span>
        </div>
    `;
    
    contentArea.innerHTML = html;
    startClock();
}

function generateCard(title, value, desc, iconClass) {
    return `
        <div class="stat-card">
            <div class="stat-card-header">
                <h3>${title}</h3>
                <div class="stat-icon"><i class="${iconClass}"></i></div>
            </div>
            <div>
                <div class="stat-value">${value}</div>
                <div class="stat-desc">${desc}</div>
            </div>
        </div>
    `;
}

// ==========================================
// REAL-TIME MANAGER DATA FETCHER
// ==========================================
function fetchManagerLiveStats(complexName) {
    if (!complexName || complexName === 'Unassigned') {
        document.getElementById('mgr-activities').innerHTML = `<li><span><i class="fas fa-exclamation-triangle" style="color: #ef4444; margin-right: 10px;"></i> Contact admin to assign a complex.</span></li>`;
        return;
    }

    const bookingsRef = ref(db, 'bookings');
    
    onValue(bookingsRef, (snap) => {
        if (!snap.exists()) return;

        const allBookings = snap.val();
        let todayParkingsCount = 0;
        let todayRevenueSum = 0;
        let complexBookings = [];

        // YYYY-MM-DD format based on local time to match "date" field in DB
        const now = new Date();
        const year = now.getFullYear();
        const month = String(now.getMonth() + 1).padStart(2, '0');
        const day = String(now.getDate()).padStart(2, '0');
        const todayStr = `${year}-${month}-${day}`; 

        for (const key in allBookings) {
            const b = allBookings[key];
            
            // FILTER: Compare booking.complex directly to manager's complex.name
            if (b.complex === complexName) {
                complexBookings.push(b);

                // Check Today's Parkings (Vehicles that are currently Parked, or Exited today)
                if (b.date === todayStr && (b.status === 'Parked' || b.status === 'Exit')) {
                    todayParkingsCount++;
                }

                // Check Today's Revenue (Sum of finalFare for Exits happening today)
                if (b.status === 'Exit' && b.finalFare && b.exitTime && b.exitTime.includes(todayStr)) {
                    todayRevenueSum += parseFloat(b.finalFare);
                }
            }
        }

        // Update DOM Elements
        const parkingsEl = document.getElementById('mgr-parkings');
        const revenueEl = document.getElementById('mgr-revenue');
        if (parkingsEl) parkingsEl.textContent = todayParkingsCount;
        if (revenueEl) revenueEl.textContent = todayRevenueSum.toFixed(2);

        // Update Activities List
        const activitiesEl = document.getElementById('mgr-activities');
        if (activitiesEl) {
            // Sort by createdAt timestamp
            complexBookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
            const top3 = complexBookings.slice(0, 3);
            let actHtml = '';

            if (top3.length === 0) {
                actHtml = `<li><span><i class="fas fa-info-circle" style="color: #94a3b8; margin-right: 10px;"></i> No vehicles processed at ${complexName} yet.</span></li>`;
            } else {
                top3.forEach(b => {
                    let iconColor = b.status === 'Exit' ? '#10b981' : (b.status === 'Parked' ? '#3b82f6' : '#f59e0b');
                    let icon = b.status === 'Exit' ? 'fa-check-circle' : (b.status === 'Parked' ? 'fa-parking' : 'fa-clock');
                    let fareText = b.finalFare ? ` <strong style="color:#10b981;">(+₹${b.finalFare})</strong>` : '';
                    
                    actHtml += `
                        <li>
                            <span><i class="fas ${icon}" style="color: ${iconColor}; margin-right: 10px;"></i> Vehicle <strong>${b.vehicle}</strong> (Slot ${b.slot}) - <span style="font-size: 0.8em; font-weight: bold; text-transform: uppercase;">${b.status}</span>${fareText}</span>
                            <span class="data-date">${b.date} @ ${b.time}</span>
                        </li>
                    `;
                });
            }
            activitiesEl.innerHTML = actHtml;
        }
    });
}

// ==========================================
// REAL-TIME USER DATA FETCHER
// ==========================================
function fetchUserLiveBookings(uid) {
    const bookingsRef = ref(db, 'bookings');
    onValue(bookingsRef, (snap) => {
        if (!snap.exists()) return;
        
        const allBookings = snap.val();
        let myBookings = [];
        
        for (const key in allBookings) {
            if (allBookings[key].userId === uid) {
                myBookings.push({ id: key, ...allBookings[key] });
            }
        }

        const totalEl = document.getElementById('dyn-total');
        if (totalEl) totalEl.textContent = myBookings.length;

        myBookings.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        const activeBooking = myBookings.find(b => b.status === 'Reserved' || b.status === 'Parked');
        
        const slotEl = document.getElementById('dyn-active-slot');
        const locEl = document.getElementById('dyn-active-loc');
        
        if (activeBooking && slotEl && locEl) {
            slotEl.textContent = activeBooking.slot;
            locEl.innerHTML = `${activeBooking.complex} (<span style="color:#10b981; font-weight:bold;">${activeBooking.status}</span>)`;
        } else if (slotEl && locEl) {
            slotEl.textContent = "None";
            locEl.textContent = "No active reservations";
        }

        const activitiesEl = document.getElementById('dyn-activities');
        if (activitiesEl) {
            let actHtml = '';
            const top3 = myBookings.slice(0, 3);
            
            if (top3.length === 0) {
                actHtml = `<li><span><i class="fas fa-info-circle" style="color: #94a3b8; margin-right: 10px;"></i> No bookings found.</span></li>`;
            } else {
                top3.forEach(b => {
                    const iconColor = b.status === 'Exit' ? '#10b981' : (b.status === 'Cancelled' ? '#ef4444' : '#f59e0b');
                    const icon = b.status === 'Exit' ? 'fa-check-circle' : (b.status === 'Cancelled' ? 'fa-times-circle' : 'fa-clock');
                    actHtml += `
                        <li>
                            <span><i class="fas ${icon}" style="color: ${iconColor}; margin-right: 10px;"></i> Slot <strong>${b.slot}</strong> at ${b.complex} (${b.status})</span>
                            <span class="data-date">${b.date}</span>
                        </li>
                    `;
                });
            }
            activitiesEl.innerHTML = actHtml;
        }
    });

    const userRef = ref(db, `users/${uid}`);
    onValue(userRef, (snap) => {
        if(snap.exists() && document.getElementById('dyn-wallet')) {
            const bal = parseFloat(snap.val().walletBalance || 0);
            document.getElementById('dyn-wallet').textContent = bal.toFixed(2);
        }
    });
}

function startClock() {
    const timeEl = document.getElementById('live-time');
    const dateEl = document.getElementById('live-date');
    if(!timeEl || !dateEl) return;

    const updateTime = () => {
        const now = new Date();
        dateEl.textContent = now.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
        timeEl.textContent = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
    };
    
    updateTime();
    setInterval(updateTime, 1000);
}