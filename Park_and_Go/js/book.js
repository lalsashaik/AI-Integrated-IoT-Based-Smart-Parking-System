// js/book.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { ref, get, push, set, onValue } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const complexSelect = document.getElementById('book-complex');
const slotGrid = document.getElementById('slot-grid');
const summaryBox = document.getElementById('booking-summary');
const summarySlotName = document.getElementById('summary-slot-name');
const btnInitiate = document.getElementById('btn-initiate-booking');
const btnCheck = document.getElementById('btn-check-availability');
const availabilitySection = document.getElementById('availability-section');
const timeDisplay = document.getElementById('selected-time-display');

const dateInput = document.getElementById('book-date');
const timeInput = document.getElementById('book-time');
const vehInput = document.getElementById('book-vehicle-input');
const drvInput = document.getElementById('book-driver-input');
const vehRadios = document.querySelectorAll('input[name="veh-type"]');
const drvRadios = document.querySelectorAll('input[name="drv-type"]');

const modal = document.getElementById('confirm-modal');
const btnCancel = document.getElementById('modal-btn-cancel');
const btnConfirm = document.getElementById('modal-btn-confirm');

let currentUserId = null;
let selectedSlotId = null;
let currentRate = 50; 
let userProfileName = '';
let userProfileVehicle = '';
let currentWalletBalance = 0;
let liveBookingsListener = null; 

// Set minimum date to today
dateInput.min = new Date().toISOString().split('T')[0];
dateInput.value = new Date().toISOString().split('T')[0];

// 1. Authenticate & Load User Data
onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUserId = user.uid;
    let userSnap = await get(ref(db, `users/${user.uid}`));
    if (!userSnap.exists()) userSnap = await get(ref(db, `admins/${user.uid}`));
    
    if (userSnap.exists()) {
      const data = userSnap.val();
      userProfileName = (data.personalDetails && data.personalDetails.firstName) ? `${data.personalDetails.firstName} ${data.personalDetails.lastName}` : (data.firstName || 'User');
      userProfileVehicle = (data.personalDetails && data.personalDetails.vehicleNumber) ? data.personalDetails.vehicleNumber : 'NOT REGISTERED';
      currentWalletBalance = data.walletBalance ? parseFloat(data.walletBalance) : 0;
      
      vehInput.value = userProfileVehicle;
      drvInput.value = userProfileName;
    }
  } else {
    window.location.href = 'index.html';
  }
});

// 2. Dynamically Load Complexes from Database
onValue(ref(db, 'complexes'), (snap) => {
    complexSelect.innerHTML = '<option value="" disabled selected>-- Select Parking Complex --</option>';
    if (snap.exists()) {
        const complexes = snap.val();
        for (const key in complexes) {
            const c = complexes[key];
            complexSelect.insertAdjacentHTML('beforeend', `<option value="${key}"> ${c.name} (${c.address.village})</option>`);
        }
    } else {
        complexSelect.innerHTML = '<option value="" disabled selected>No complexes available</option>';
    }
});

// 3. Toggles for Vehicle and Driver
vehRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if(e.target.value === 'myself') {
      vehInput.readOnly = true; vehInput.value = userProfileVehicle;
    } else {
      vehInput.readOnly = false; vehInput.value = ''; vehInput.placeholder = 'Enter Vehicle Number'; vehInput.focus();
    }
  });
});

drvRadios.forEach(radio => {
  radio.addEventListener('change', (e) => {
    if(e.target.value === 'myself') {
      drvInput.readOnly = true; drvInput.value = userProfileName;
    } else {
      drvInput.readOnly = false; drvInput.value = ''; drvInput.placeholder = 'Enter Driver Name & Phone'; drvInput.focus();
    }
  });
});

complexSelect.addEventListener('change', () => {
    availabilitySection.classList.add('hidden');
    selectedSlotId = null;
    summaryBox.classList.add('hidden');
});

// 4. Time-Based Availability Check
btnCheck.addEventListener('click', async () => {
  if (!complexSelect.value) return alert("Please select a Parking Complex first.");
  if (!dateInput.value || !timeInput.value) return alert("Please select both Date and Arrival Time.");

  const bookingDateTime = new Date(`${dateInput.value}T${timeInput.value}`);
  const now = new Date();
  const diffInMinutes = (bookingDateTime - now) / (1000 * 60);

  if (diffInMinutes < 0) {
      return alert("Invalid Selection: You cannot book a slot for a past time.");
  }

  if (diffInMinutes > 15) {
      const allowedTime = new Date(bookingDateTime.getTime() - 15 * 60000);
      const timeString = allowedTime.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
      return alert(`Advanced Booking Locked!\n\nTo ensure fair access, you can only reserve a space 15 minutes before your arrival.\n\nPlease try booking again at ${timeString}.`);
  }

  timeDisplay.textContent = `${dateInput.value} @ ${timeInput.value}`;
  availabilitySection.classList.remove('hidden');
  availabilitySection.scrollIntoView({ behavior: 'smooth' });
  
  await generateDynamicSlots();
});

// 5. Generate Slots Logic (REAL-TIME UPDATE)
async function generateDynamicSlots() {
  const selectedComplex = complexSelect.value;
  const selectedDate = dateInput.value;

  if (liveBookingsListener) {
    liveBookingsListener(); 
  }

  const layoutSnap = await get(ref(db, `parkingLayout/${selectedComplex}`));
  slotGrid.innerHTML = '';
  
  if (!layoutSnap.exists()) {
    slotGrid.innerHTML = '<p style="grid-column:1/-1; text-align:center; padding: 20px; color: #64748b;">No physical slots configured for this location yet. The Manager needs to add them.</p>';
    return;
  }

  const layoutData = layoutSnap.val();
  const slotIds = Object.keys(layoutData).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));

  slotIds.forEach(id => {
    const isMaint = layoutData[id] === 'maintenance';
    
    const el = document.createElement('div');
    el.className = `slot ${isMaint ? 'booked maintenance' : 'available'}`;
    el.setAttribute('data-slot-id', id);
    el.innerHTML = `<i class="fas ${isMaint ? 'fa-tools' : 'fa-car-side'}"></i><span>${id}</span>`;

    if (!isMaint) {
      el.onclick = () => {
        if (el.classList.contains('booked')) return; 

        document.querySelectorAll('.slot').forEach(s => s.classList.remove('selected'));
        el.classList.add('selected');
        selectedSlotId = id;
        summarySlotName.textContent = id;
        summaryBox.classList.remove('hidden');
        btnInitiate.disabled = false;
      };
    }
    slotGrid.appendChild(el);
  });

  liveBookingsListener = onValue(ref(db, 'bookings'), (bookingsSnap) => {
    document.querySelectorAll('.slot:not(.maintenance)').forEach(el => {
        if (!el.classList.contains('selected')) {
            el.className = 'slot available';
            el.querySelector('i').className = 'fas fa-car-side';
        }
    });

    if (bookingsSnap.exists()) {
      const allBookings = bookingsSnap.val();
      
      for (const key in allBookings) {
        const b = allBookings[key];
        const isActive = (b.status === 'Reserved' || b.status === 'Parked');
        
        if (isActive && b.complex === selectedComplex && b.date === selectedDate) {
          const slotEl = document.querySelector(`.slot[data-slot-id="${b.slot}"]`);
          
          if (slotEl) {
            slotEl.className = 'slot booked'; 
            slotEl.querySelector('i').className = 'fas fa-car';

            // FIXED: Ensure we don't trigger the "stolen slot" alert if the current user is the one who just booked it!
            if (selectedSlotId === b.slot && b.userId !== currentUserId) {
              selectedSlotId = null;
              slotEl.classList.remove('selected');
              summaryBox.classList.add('hidden');
              btnInitiate.disabled = true;
              alert(`Oops! Slot ${b.slot} was just reserved by someone else a second ago. Please pick another.`);
            }
          }
        }
      }
    }
  });
}

// 6. Booking Confirmation Workflow
btnInitiate.addEventListener('click', () => {
  if (currentWalletBalance < 50) {
    return alert(`Insufficient E-Wallet Balance!\n\nYour balance is ₹${currentWalletBalance}. A minimum of ₹50 is required to reserve a slot. Please recharge your E-Wallet.`);
  }
  if (vehInput.value.trim() === '' || vehInput.value === 'NOT REGISTERED') return alert("Enter a valid Vehicle Number.");
  if (drvInput.value.trim() === '') return alert("Enter Driver Details.");
  if (!selectedSlotId) return alert("Please select a parking slot from the grid.");

  document.getElementById('mod-complex').textContent = complexSelect.options[complexSelect.selectedIndex].text;
  document.getElementById('mod-slot').textContent = selectedSlotId;
  document.getElementById('mod-vehicle').textContent = vehInput.value.toUpperCase();
  document.getElementById('mod-driver').textContent = drvInput.value;
  document.getElementById('mod-datetime').textContent = `${dateInput.value} at ${timeInput.value}`;

  modal.classList.remove('hidden');
});

btnCancel.addEventListener('click', () => modal.classList.add('hidden'));

btnConfirm.addEventListener('click', async () => {
  btnConfirm.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Reserving...';
  btnConfirm.disabled = true;

  const bookingData = {
    userId: currentUserId, 
    complex: complexSelect.value, 
    date: dateInput.value,
    time: timeInput.value, 
    slot: selectedSlotId, 
    vehicle: vehInput.value.toUpperCase(),
    driver: drvInput.value, 
    hourlyRate: currentRate, 
    status: 'Reserved', 
    createdAt: new Date().toISOString()
  };

  try {
    const newBookingRef = push(ref(db, 'bookings'));
    await set(newBookingRef, bookingData);
    btnConfirm.style.background = "#10b981";
    btnConfirm.innerHTML = '<i class="fas fa-check"></i> Reservation Successful!';
    
    setTimeout(() => { window.location.href = 'history.html'; }, 1500);
  } catch (error) {
    alert("Error saving reservation: " + error.message);
    btnConfirm.innerHTML = 'Yes, Confirm Slot';
    btnConfirm.disabled = false;
  }
});