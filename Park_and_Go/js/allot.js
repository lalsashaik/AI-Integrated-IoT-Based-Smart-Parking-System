// js/allot.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { ref, get, update, push } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const html5QrCode = new Html5Qrcode("reader");
const verifyCard = document.getElementById('verification-result');
const scanIdleState = document.getElementById('scan-idle-state');
const scannerWrapper = document.getElementById('scanner-wrapper');
const errorMsg = document.getElementById('scanner-error-msg');
const popup = document.getElementById('popup');

let activeBookingId = null;
let currentBooking = null;
let currentManagerId = null;
let isProcessingScan = false; // Prevents the scanner from double-firing on mobile

// 1. Authenticate Manager
onAuthStateChanged(auth, (user) => {
    if (user) {
        currentManagerId = user.uid;
    } else {
        window.location.href = 'index.html';
    }
});

function showMsg(text, success = true) {
    popup.textContent = text;
    popup.style.background = success ? "#10b981" : "#ef4444";
    popup.classList.add('show');
    setTimeout(() => popup.classList.remove('show'), 4000);
}

// 2. Open Full-Screen Scanner
document.getElementById('start-scan-btn').addEventListener('click', () => {
    isProcessingScan = false; // Unlock scanner
    scanIdleState.classList.add('hidden');
    scannerWrapper.classList.remove('hidden');
    
    const config = { fps: 20, qrbox: { width: 250, height: 250 }, aspectRatio: 1.0 };
    html5QrCode.start({ facingMode: "environment" }, config, onScanSuccess).catch(err => {
        alert("Camera access denied or unavailable.");
        closeScanner();
    });
});

function closeScanner() {
    html5QrCode.stop().then(() => {
        scannerWrapper.classList.add('hidden');
        scanIdleState.classList.remove('hidden');
    }).catch(err => console.log(err));
}

document.getElementById('stop-scan-btn').addEventListener('click', closeScanner);

// 3. Process Scanned Data
async function onScanSuccess(decodedText) {
    if (isProcessingScan) return; // Instantly block double-scans
    isProcessingScan = true;      // Lock the scanner

    activeBookingId = decodedText.trim();
    const now = new Date();

    try {
        const snap = await get(ref(db, `bookings/${activeBookingId}`));
        if (!snap.exists()) {
            isProcessingScan = false;
            return displayError("Invalid QR: Booking not found.");
        }
        
        currentBooking = snap.val();
        
        // Safeguard the booked time
        const bookedTimeStr = `${currentBooking.date || ''}T${currentBooking.time || '00:00'}`;
        const bookedTime = new Date(bookedTimeStr);

        // Validation Checks
        if (currentBooking.status === 'Reserved' && !isNaN(bookedTime) && now < bookedTime) {
            isProcessingScan = false;
            return displayError(`DENIED: Arrived too early.`);
        }
        if (currentBooking.status === 'Exit' || currentBooking.status === 'Cancelled') {
            isProcessingScan = false;
            return displayError(`DENIED: Ticket is already ${currentBooking.status}.`);
        }

        // Success: Close Scanner & Show UI
        await html5QrCode.stop();
        scannerWrapper.classList.add('hidden');
        
        // Populate Data safely
        document.getElementById('v-vehicle').textContent = currentBooking.vehicle || 'N/A';
        document.getElementById('v-slot').textContent = currentBooking.slot || 'N/A';
        document.getElementById('v-driver').textContent = currentBooking.driver || 'Unknown';
        
        const statusEl = document.getElementById('v-status');
        statusEl.textContent = currentBooking.status;
        
        const actionBtn = document.getElementById('confirm-allotment');
        const fareBox = document.getElementById('fare-calculation');

        // Logic based on Entry vs Exit
        if (currentBooking.status === 'Reserved') {
            statusEl.style.background = '#fef3c7'; statusEl.style.color = '#b45309';
            fareBox.classList.add('hidden');
            actionBtn.textContent = "Confirm Entry (Parked)";
            actionBtn.style.background = "#10b981"; actionBtn.style.color = "white";
            actionBtn.removeAttribute('data-fare'); // Clear any old fare data
        } 
        else if (currentBooking.status === 'Parked') {
            statusEl.style.background = '#ecfdf5'; statusEl.style.color = '#065f46';
            
            const entryStr = currentBooking.entryTime || now.toISOString();
            const entry = new Date(entryStr);
            
            // 1. Calculate exact minutes parked
            let duration = Math.ceil((now - entry) / (1000 * 60));
            if (isNaN(duration) || duration < 0) duration = 0; 

            // 2. Fetch Hourly Rate safely
            let hourlyRate = parseFloat(currentBooking.hourlyRate);
            if (isNaN(hourlyRate) || hourlyRate <= 0) hourlyRate = 50; 

            // 3. Proportional Fare Calculation
            let fare = Math.ceil((duration / 60) * hourlyRate); 

            // 4. IRONCLAD ₹1 MINIMUM FARE
            if (isNaN(fare) || fare < 1) {
                fare = 1; 
            }
            
            document.getElementById('v-duration').textContent = duration;
            document.getElementById('v-fare').textContent = `₹ ${fare}`;
            fareBox.classList.remove('hidden');
            
            // Inject the calculated fare strictly into the button HTML
            actionBtn.textContent = `Deduct ₹${fare} & Exit`;
            actionBtn.style.background = "#e11d48"; actionBtn.style.color = "white";
            actionBtn.setAttribute('data-fare', fare);
            
            currentBooking.totalFare = fare;
        }

        verifyCard.classList.remove('hidden');
    } catch (e) { 
        console.error(e);
        isProcessingScan = false;
        displayError("Connection Error"); 
    }
}

function displayError(msg) {
    errorMsg.textContent = msg;
    errorMsg.classList.remove('hidden');
    setTimeout(() => { errorMsg.classList.add('hidden'); }, 4000);
}

// 4. Confirm Database Updates (Entry or Exit)
document.getElementById('confirm-allotment').addEventListener('click', async () => {
    const btn = document.getElementById('confirm-allotment');
    btn.innerHTML = `<i class="fas fa-spinner fa-spin"></i> Processing...`;
    btn.disabled = true;

    try {
        // =====================================
        // ENTRY FLOW
        // =====================================
        if (currentBooking.status === 'Reserved') {
            await update(ref(db, `bookings/${activeBookingId}`), { 
                status: 'Parked', 
                entryTime: new Date().toISOString(),
                processedByEntry: currentManagerId || "UNKNOWN_MANAGER"
            });
            showMsg("Vehicle Parked Successfully!");
            setTimeout(() => { location.reload(); }, 1500);
        } 
        
        // =====================================
        // EXIT & PAYMENT FLOW
        // =====================================
        else if (currentBooking.status === 'Parked') {
            
            // FORCE PULL THE EXACT FARE FROM THE BUTTON HTML
            let fareAmount = parseFloat(btn.getAttribute('data-fare'));

            // ULTIMATE BACKUP CHECK: IT IS NOW IMPOSSIBLE TO CHARGE 0
            if (isNaN(fareAmount) || fareAmount < 1) {
                fareAmount = 1; 
            }
            
            const timestamp = new Date().toISOString();
            const safeUserId = currentBooking.userId || "UNKNOWN_USER";
            const safeComplex = currentBooking.complex || "Unknown Complex";
            const safeSlot = currentBooking.slot || "Unknown Slot";
            const safeVehicle = currentBooking.vehicle || "Unknown Vehicle";
            const safeManager = currentManagerId || "UNKNOWN_MANAGER";

            // 1. Deduct from User's Wallet
            if (safeUserId !== "UNKNOWN_USER") {
                const userRef = ref(db, `users/${safeUserId}`);
                const userSnap = await get(userRef);
                if (userSnap.exists()) {
                    const currentBal = parseFloat(userSnap.val().walletBalance) || 0; 
                    await update(userRef, { walletBalance: currentBal - fareAmount });
                }
            }

            // 2. Add to Manager's Total Revenue
            if (safeManager !== "UNKNOWN_MANAGER") {
                const managerRef = ref(db, `managers/${safeManager}`);
                const managerSnap = await get(managerRef);
                if (managerSnap.exists()) {
                    const currentRev = parseFloat(managerSnap.val().totalRevenue) || 0; 
                    await update(managerRef, { totalRevenue: currentRev + fareAmount });
                }
            }

            // 3. Log Transactions (Debit & Credit)
            try {
                await push(ref(db, 'transactions'), {
                    userId: safeUserId, type: "Debit", amount: fareAmount,
                    description: `Parking Fare - ${safeComplex} (Slot ${safeSlot})`,
                    bookingId: activeBookingId, timestamp: timestamp
                });

                if (safeManager !== "UNKNOWN_MANAGER") {
                    await push(ref(db, 'transactions'), {
                        managerId: safeManager, type: "Credit", amount: fareAmount,
                        description: `Revenue Collected - ${safeComplex} (Vehicle: ${safeVehicle})`,
                        bookingId: activeBookingId, timestamp: timestamp
                    });
                }
            } catch (logErr) {
                console.warn("Could not log transaction, but proceeding with exit.", logErr);
            }

            // 4. Finalize Booking
            await update(ref(db, `bookings/${activeBookingId}`), { 
                status: 'Exit', 
                exitTime: timestamp, 
                finalFare: fareAmount, 
                processedByExit: safeManager
            });
            
            showMsg(`Success! ₹${fareAmount} deducted. Gate Opened.`);
            setTimeout(() => { location.reload(); }, 2000);
        }
    } catch (e) { 
        console.error("FIREBASE UPDATE ERROR:", e); 
        showMsg("Update Failed. Check console for details.", false); 
        btn.disabled = false;
        btn.textContent = "Try Again";
    }
});

// Reset UI
document.getElementById('btn-cancel-scan').addEventListener('click', () => {
    verifyCard.classList.add('hidden');
    scanIdleState.classList.remove('hidden');
    isProcessingScan = false;
});