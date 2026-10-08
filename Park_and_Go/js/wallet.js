// js/wallet.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { ref, onValue } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const walletDisplay = document.getElementById('wallet-display');
const minAlert = document.getElementById('min-balance-alert');
const transTbody = document.getElementById('transaction-tbody');
const mobileTxContainer = document.getElementById('mobile-tx-container');

let currentUserId = null;

onAuthStateChanged(auth, (user) => {
  if (user) {
    currentUserId = user.uid;
    fetchLiveWalletData();
  } else {
    window.location.href = 'index.html';
  }
});

function fetchLiveWalletData() {
  // 1. LIVE Fetch Balance
  const userRef = ref(db, `users/${currentUserId}`);
  onValue(userRef, (snap) => {
      if (snap.exists()) {
          const data = snap.val();
          const balance = parseFloat(data.walletBalance) || 0;
          walletDisplay.textContent = `₹ ${balance.toFixed(2)}`;
          minAlert.style.display = balance < 50 ? 'inline-block' : 'none';
      }
  });

  // 2. LIVE Fetch Transactions (Recharges/Deductions)
  const transRef = ref(db, 'transactions');
  onValue(transRef, (snapshot) => {
    if (snapshot.exists()) {
      const allTrans = snapshot.val();
      const myTrans = [];
      
      for (const key in allTrans) {
        if (allTrans[key].userId === currentUserId) {
            myTrans.push(allTrans[key]);
        }
      }

      // Sort newest first
      myTrans.sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
      renderTransactions(myTrans);
    } else {
      showEmptyState();
    }
  });
}

function showEmptyState() {
    transTbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding: 25px; color:#64748b;">No recent transactions.</td></tr>';
    mobileTxContainer.innerHTML = '<div style="text-align:center; padding: 25px; color:#64748b; background: #f8fafc; border-radius: 12px; border: 1px dashed #cbd5e1;">No recent transactions.</div>';
}

function renderTransactions(list) {
  transTbody.innerHTML = '';
  mobileTxContainer.innerHTML = '';

  if (list.length === 0) {
      showEmptyState();
      return;
  }

  list.forEach(t => {
    const isCredit = t.type === 'Credit';
    const sign = isCredit ? '+' : '-';
    const amtColor = isCredit ? '#10b981' : '#ef4444';
    const typeIcon = isCredit ? 'fa-arrow-down text-success' : 'fa-arrow-up text-danger';
    
    const dateObj = new Date(t.timestamp);
    const formattedDate = dateObj.toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

    // --- 1. Desktop Table Row ---
    const desktopRow = `
      <tr>
        <td><i class="fas ${typeIcon}"></i> <strong>${t.type}</strong></td>
        <td>${t.description}</td>
        <td style="font-weight:800; color: ${amtColor}; font-size: 1.05rem;">
          ${sign} ₹${parseFloat(t.amount).toFixed(2)}
        </td>
        <td><span class="date-subtext">${formattedDate}</span></td>
        <td><span class="status-badge status-completed">Success</span></td>
      </tr>
    `;
    transTbody.insertAdjacentHTML('beforeend', desktopRow);

    // --- 2. Mobile Card Format ---
    const mobileCard = `
      <div class="mobile-tx-card">
        <div class="tx-left">
          <span class="tx-desc">${t.description}</span>
          <span class="tx-date">${formattedDate}</span>
        </div>
        <div class="tx-right">
          <span class="tx-amt" style="color: ${amtColor};">${sign} ₹${parseFloat(t.amount).toFixed(2)}</span>
          <span style="font-size: 0.7rem; color: #64748b; font-weight: bold; text-transform: uppercase;"><i class="fas ${typeIcon}"></i> ${t.type}</span>
        </div>
      </div>
    `;
    mobileTxContainer.insertAdjacentHTML('beforeend', mobileCard);
  });
}