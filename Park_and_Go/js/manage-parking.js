// js/manage-parking.js
import { auth, db } from './firebase-config.js';
import { ref, get, update, remove, onValue } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const complexSelect = document.getElementById('manage-complex-select');
const ui = document.getElementById('management-ui'); // The container holding the grid and bulk tools
const slotGrid = document.getElementById('admin-slot-grid');
const notification = document.getElementById('overflow-notification');

let currentComplex = "";
let currentPrefix = ""; // Fetched dynamically from database
let selectedId = "";

function notify(msg, type='success') {
    if(!notification) return alert(msg);
    notification.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : 'fa-tools'}"></i> ${msg}`;
    notification.className = `overflow-msg show ${type}`;
    setTimeout(() => notification.classList.remove('show'), 3000);
}

// 1. Load Complexes & Attach Prefixes
onValue(ref(db, 'complexes'), (snap) => {
    complexSelect.innerHTML = '<option value="" disabled selected>-- Choose Complex to Manage --</option>';
    if (snap.exists()) {
        const complexes = snap.val();
        for (const key in complexes) {
            const c = complexes[key];
            // Store the prefix directly in the option tag for immediate access
            complexSelect.insertAdjacentHTML('beforeend', 
                `<option value="${key}" data-prefix="${c.prefix}">${c.name} (${c.prefix})</option>`
            );
        }
    }
});

// 2. Handle Complex Selection
complexSelect.addEventListener('change', (e) => {
    currentComplex = e.target.value;
    currentPrefix = e.target.options[e.target.selectedIndex].getAttribute('data-prefix');
    
    // Update UI headers
    const nameDisplay = document.getElementById('active-complex-name');
    if (nameDisplay) nameDisplay.textContent = `${currentComplex} (Prefix: ${currentPrefix})`;
    
    if (ui) ui.classList.remove('hidden');
    syncGrid();
});

// 3. Render the Grid
function syncGrid() {
    onValue(ref(db, `parkingLayout/${currentComplex}`), (snap) => {
        slotGrid.innerHTML = '';
        const data = snap.val() || {};
        
        // Sort keys alphanumerically (e.g., SVG-01, SVG-02)
        const keys = Object.keys(data).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));
        
        keys.forEach(id => {
            const status = data[id];
            const el = document.createElement('div');
            
            el.className = `slot ${status === 'maintenance' ? 'maintenance' : 'vacant'}`;
            el.innerHTML = `<i class="fas ${status === 'maintenance' ? 'fa-tools' : 'fa-car'}"></i><span>${id}</span>`;
            
            el.onclick = () => {
                selectedId = id;
                document.getElementById('m-slot-id').textContent = `Manage Slot: ${id}`;
                document.getElementById('status-modal').classList.remove('hidden');
            };
            slotGrid.appendChild(el);
        });
        
        const countDisplay = document.getElementById('slot-total-count');
        if (countDisplay) countDisplay.textContent = `${keys.length} Mapped Slots`;
    });
}

// 4. Smart Bulk Add (Uses Database Prefix)
document.getElementById('btn-bulk-add').onclick = async () => {
    const qtyInput = document.getElementById('add-qty').value;
    const qty = parseInt(qtyInput);
    if (!qty || qty < 1) return notify("Enter a valid quantity", "error");

    const snap = await get(ref(db, `parkingLayout/${currentComplex}`));
    let maxNumber = 0;
    
    // Scan existing slots to find the highest number to prevent duplicates
    if (snap.exists()) {
        Object.keys(snap.val()).forEach(key => {
            const parts = key.split('-');
            if (parts.length > 1) {
                const num = parseInt(parts[1], 10);
                if (num > maxNumber) maxNumber = num;
            }
        });
    }

    const updates = {};
    for (let i = 1; i <= qty; i++) {
        // Formats the ID: e.g., "SVG-01", "SVG-15"
        const newNumber = (maxNumber + i).toString().padStart(2, '0');
        const newSlotId = `${currentPrefix}-${newNumber}`;
        updates[newSlotId] = "vacant";
    }

    try {
        await update(ref(db, `parkingLayout/${currentComplex}`), updates);
        notify(`Successfully mapped ${qty} new slots with prefix ${currentPrefix}.`);
        document.getElementById('add-qty').value = '';
    } catch (e) {
        notify("Failed to add slots.", "error");
    }
};

// 5. Bulk Delete (Removes highest numbered slots first)
document.getElementById('btn-bulk-del').onclick = async () => {
    const qtyInput = document.getElementById('del-qty').value;
    const qty = parseInt(qtyInput);
    
    const snap = await get(ref(db, `parkingLayout/${currentComplex}`));
    if (!snap.exists() || !qty || qty < 1) return notify("Nothing to delete or invalid quantity.", "error");

    const keys = Object.keys(snap.val()).sort((a,b) => a.localeCompare(b, undefined, {numeric: true}));
    const toDelete = keys.slice(-qty);

    if (confirm(`Are you sure you want to permanently delete the last ${toDelete.length} slots from the database?`)) {
        try {
            for (let key of toDelete) {
                await remove(ref(db, `parkingLayout/${currentComplex}/${key}`));
            }
            notify(`Removed ${toDelete.length} slots from infrastructure.`);
            document.getElementById('del-qty').value = '';
        } catch (e) {
            notify("Failed to delete slots.", "error");
        }
    }
};

// 6. Maintenance Toggle Logic
document.getElementById('set-vacant').onclick = () => setSlotStatus("vacant");
document.getElementById('set-maint').onclick = () => setSlotStatus("maintenance");

async function setSlotStatus(statusType) {
    try {
        await update(ref(db, `parkingLayout/${currentComplex}`), {
            [selectedId]: statusType
        });
        document.getElementById('status-modal').classList.add('hidden');
        notify(`Slot ${selectedId} is now marked as ${statusType.toUpperCase()}`);
    } catch (e) {
        notify("Update failed.", "error");
    }
}