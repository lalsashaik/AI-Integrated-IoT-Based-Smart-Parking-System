// js/components.js
import { auth, db } from './firebase-config.js';
import { onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { ref, get } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

const menus = {
  user: [
    { name: "Dashboard", link: "dashboard.html", icon: "fas fa-tachometer-alt" }, 
    { name: "Book Slot", link: "book.html", icon: "fas fa-parking" },
    { name: "History", link: "history.html", icon: "fas fa-history" },
    { name: "E-Wallet", link: "wallet.html", icon: "fas fa-wallet" }, 
    { name: "My Account", link: "profile-settings.html", icon: "fas fa-user-circle" }, 
    { name: "Developer Team", link: "devs.html", icon: "fas fa-laptop-code" }
  ],
  manager: [
    { name: "Dashboard", link: "dashboard.html", icon: "fas fa-tachometer-alt" }, 
    { name: "Parking Data", link: "parking-data.html", icon: "fas fa-database" },
    { name: "Allot Slot", link: "allot.html", icon: "fas fa-check-circle" }, 
    { name: "Manage Parkings", link: "manage-parking.html", icon: "fas fa-building" },
    { name: "Manage E-Wallets", link: "manage-wallets.html", icon: "fas fa-hand-holding-usd" },
    { name: "My Account", link: "profile-settings.html", icon: "fas fa-user-circle" }, 
    { name: "Developer Team", link: "devs.html", icon: "fas fa-laptop-code" }
  ],
  admin: [
    { name: "Dashboard", link: "dashboard.html", icon: "fas fa-tachometer-alt" }, 
    { name: "Parking Data", link: "data.html", icon: "fas fa-database" },
    { name: "Manage E-Wallets", link: "manage-wallets.html", icon: "fas fa-wallet" }, 
    { name: "Manage Users", link: "manage-users.html", icon: "fas fa-users" },
    { name: "Manage Managers", link: "manage-managers.html", icon: "fas fa-user-tie" }, 
    { name: "Manage Parkings", link: "manage-parking.html", icon: "fas fa-building" },
    { name: "Profile Settings", link: "profile-settings.html", icon: "fas fa-user-cog" }, 
    { name: "Developers Team", link: "devs.html", icon: "fas fa-laptop-code" }
  ]
};

onAuthStateChanged(auth, async (user) => {
  if (user) {
    let role = 'user'; let fName = 'User'; let lName = ''; let displayRole = 'Driver Account';
    let customID = `PRK${user.uid.substring(0, 6).toUpperCase()}`;
    
    const [userSnap, adminSnap, managerSnap] = await Promise.all([
      get(ref(db, `users/${user.uid}`)),
      get(ref(db, `admins/${user.uid}`)),
      get(ref(db, `managers/${user.uid}`))
    ]);

    if (userSnap.exists()) {
      const userData = userSnap.val();
      role = userData.role ? userData.role.toLowerCase() : 'user';
      if (userData.personalDetails) {
          fName = userData.personalDetails.firstName || 'User'; 
          lName = userData.personalDetails.lastName || '';
      }
    }

    if (managerSnap.exists()) {
      const mgrData = managerSnap.val();
      role = 'manager';
      displayRole = 'Facility Manager';
      customID = mgrData.managerID || customID;
      fName = mgrData.personal ? mgrData.personal.firstName : fName;
      lName = mgrData.personal ? mgrData.personal.lastName : lName;
    }

    if (adminSnap.exists()) {
      const adminData = adminSnap.val();
      role = adminData.role ? adminData.role.toLowerCase() : 'admin';
      displayRole = 'Administrator';
      if (fName === 'User' || fName === '') { 
          fName = adminData.firstName || 'Admin'; 
          lName = adminData.lastName || ''; 
      }
    }

    renderSidebar(role, fName, lName, displayRole, customID);
    renderTopbar(role, fName, lName);
  } else {
    window.location.href = 'index.html';
  }
});

function renderSidebar(role, fName, lName, displayRole, displayID) {
  const container = document.getElementById('sidebar-container');
  if(!container) return; 
  
  const allLinks = menus[role] || menus.user;
  const currentPage = window.location.pathname.split("/").pop() || 'dashboard.html';
  const initials = `${fName.charAt(0).toUpperCase()}${lName ? lName.charAt(0).toUpperCase() : ''}`;

  // Mobile Logic: Show first 4 links, move others to "More" menu
  const visibleLinks = allLinks.slice(0, 4);
  const hiddenLinks = allLinks.slice(4);

  let html = `
    <div class="sidebar">
      <div class="sidebar-header brand-header">
        <h2 class="sidebar-main-brand">Park <span class="highlight">And</span> Go</h2>
        <p class="sidebar-sub-brand">Parking Slot Booking Portal</p>
      </div>
      
      <div class="sidebar-profile-card">
        <div class="sidebar-avatar">${initials}</div>
        <div class="profile-info">
          <p class="profile-name">${fName} ${lName}</p>
          <p class="profile-role"><i class="fas fa-shield-alt"></i> ${displayRole}</p>
          <p class="profile-id">ID: ${displayID}</p>
        </div>
      </div>
      <ul class="sidebar-menu">
  `;
  
  // Render full menu for desktop
  allLinks.forEach(item => { 
    const isActive = currentPage === item.link ? 'class="active"' : '';
    html += `<li class="desktop-only"><a href="${item.link}" ${isActive}><i class="${item.icon}"></i> ${item.name}</a></li>`; 
  });

  // Render limited menu for mobile bottom bar
  visibleLinks.forEach(item => {
    const isActive = currentPage === item.link ? 'class="active"' : '';
    html += `<li class="mobile-only"><a href="${item.link}" ${isActive}><i class="${item.icon}"></i> ${item.name}</a></li>`;
  });

  // Add "More" trigger for mobile if hidden links exist
  if(hiddenLinks.length > 0) {
    html += `
      <li class="mobile-only">
        <a href="javascript:void(0)" id="mobile-more-btn"><i class="fas fa-ellipsis-h"></i> More</a>
        <div class="mobile-more-menu" id="mobile-more-menu">
          ${hiddenLinks.map(item => `<a href="${item.link}"><i class="${item.icon}"></i> ${item.name}</a>`).join('')}
        </div>
      </li>
    `;
  }

  html += `</ul></div>`;
  container.innerHTML = html;

  // Toggle "More" Menu Logic for Mobile
  const moreBtn = document.getElementById('mobile-more-btn');
  if(moreBtn) {
    moreBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      document.getElementById('mobile-more-menu').classList.toggle('show');
    });
  }

  // Close more menu on click outside
  document.addEventListener('click', () => {
    const moreMenu = document.getElementById('mobile-more-menu');
    if(moreMenu && moreMenu.classList.contains('show')) moreMenu.classList.remove('show');
  });
}

function renderTopbar(role, fName, lName) {
  const container = document.getElementById('topbar-container');
  if(!container) return; 

  const currentPage = window.location.pathname.split("/").pop() || 'dashboard.html';
  const links = menus[role] || menus.user;
  const currentMenu = links.find(item => item.link === currentPage);
  const pageTitle = currentMenu ? currentMenu.name : 'Dashboard';

  const initials = `${fName.charAt(0).toUpperCase()}${lName ? lName.charAt(0).toUpperCase() : ''}`;

  container.innerHTML = `
    <div class="topbar">
      <h2 class="page-title">${pageTitle}</h2>
      <div class="topbar-right">
        <div class="avatar-dropdown" id="avatar-btn">
          <div class="topbar-avatar">${initials}</div>
          <span class="topbar-username">${fName} ${lName}</span>
          <i class="fas fa-chevron-down dropdown-icon"></i>
          <div class="dropdown-content" id="dropdown-menu">
            <a href="profile-settings.html"><i class="fas fa-cog"></i> Profile Settings</a>
            <a href="#" id="logout-btn" style="color: #ef4444;"><i class="fas fa-sign-out-alt"></i> Logout</a>
          </div>
        </div>
      </div>
    </div>
  `;

  document.getElementById('avatar-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.getElementById('dropdown-menu').classList.toggle('show');
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#avatar-btn')) {
      const dropdown = document.getElementById('dropdown-menu');
      if (dropdown && dropdown.classList.contains('show')) dropdown.classList.remove('show');
    }
  });

  document.getElementById('logout-btn').addEventListener('click', (e) => { 
    e.preventDefault(); 
    signOut(auth).then(() => { window.location.href = 'index.html'; }); 
  });
}