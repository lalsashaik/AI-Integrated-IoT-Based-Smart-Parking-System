// js/login.js
import { auth, db } from './firebase-config.js';
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  sendEmailVerification,
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/10.7.0/firebase-auth.js";
import { ref, set } from "https://www.gstatic.com/firebasejs/10.7.0/firebase-database.js";

// ==========================================
// 1. GLOBAL HELPERS & LOADERS
// ==========================================
const hideLoader = () => {
  const loader = document.getElementById('global-loader');
  if (loader) {
    loader.style.opacity = '0';
    setTimeout(() => loader.style.display = 'none', 500);
  }
};

if (document.readyState === 'complete' || document.readyState === 'interactive') { hideLoader(); } 
else { window.addEventListener('DOMContentLoaded', hideLoader); }

window.togglePassword = function(inputId, icon) {
  const input = document.getElementById(inputId);
  // Get the <i> tag inside the span
  const iconElement = icon.querySelector('i');

  if (input.type === 'password') {
    input.type = 'text';
    // Switch to the "eye-slash" (closed eye) icon
    iconElement.classList.remove('fa-eye');
    iconElement.classList.add('fa-eye-slash');
  } else {
    input.type = 'password';
    // Switch back to the "eye" (open eye) icon
    iconElement.classList.remove('fa-eye-slash');
    iconElement.classList.add('fa-eye');
  }
};
function showPopup(message, isClickable = false) {
  const popup = document.getElementById('popup');
  popup.textContent = message;
  
  if (isClickable) {
    popup.classList.add('clickable');
    popup.onclick = () => {
      document.querySelector('.auth-wrapper').classList.remove("right-panel-active"); 
      popup.classList.remove('show'); 
      resetSteps();
    };
  } else {
    popup.classList.remove('clickable');
    popup.onclick = null;
  }

  popup.classList.add('show');
  if (!isClickable) {
    setTimeout(() => popup.classList.remove('show'), 4000);
  }
}

// ==========================================
// 2. UI TOGGLES & MULTI-STEP LOGIC
// ==========================================
const signUpButton = document.getElementById('signUp');
const signInButton = document.getElementById('signIn');
const wrapper = document.querySelector('.auth-wrapper');

const nextBtns = document.querySelectorAll('.btn-next');
const backBtns = document.querySelectorAll('.btn-back');
const formSteps = document.querySelectorAll('.form-step');
const progressSteps = document.querySelectorAll('.progress-step');
let currentStep = 0;

signUpButton.addEventListener('click', (e) => {
    e.preventDefault();
    wrapper.classList.add("right-panel-active");
});

signInButton.addEventListener('click', (e) => {
    e.preventDefault();
    wrapper.classList.remove("right-panel-active");
    resetSteps();
});

function resetSteps() {
    currentStep = 0;
    formSteps.forEach((step, idx) => {
        step.classList.remove('active');
        progressSteps[idx].classList.remove('active', 'completed');
    });
    formSteps[0].classList.add('active');
    progressSteps[0].classList.add('active');
}

nextBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    const currentFormStep = formSteps[currentStep];
    const inputs = currentFormStep.querySelectorAll('input[required]');
    let isValid = true;
    
    inputs.forEach(input => {
      if (!input.checkValidity()) {
        input.reportValidity();
        isValid = false;
      }
    });

    if (isValid) {
      formSteps[currentStep].classList.remove('active');
      progressSteps[currentStep].classList.add('completed');
      progressSteps[currentStep].classList.remove('active');
      
      currentStep++;
      
      formSteps[currentStep].classList.add('active');
      progressSteps[currentStep].classList.add('active');
    }
  });
});

backBtns.forEach(btn => {
  btn.addEventListener('click', () => {
    formSteps[currentStep].classList.remove('active');
    progressSteps[currentStep].classList.remove('active');
    
    currentStep--;
    
    formSteps[currentStep].classList.add('active');
    progressSteps[currentStep].classList.add('active');
    progressSteps[currentStep].classList.remove('completed');
  });
});

// ==========================================
// 3. FIREBASE SIGN UP LOGIC
// ==========================================
document.getElementById('signup-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const pwd = document.getElementById('reg-password').value;
  const confirmPwd = document.getElementById('reg-confirm').value;
  const btnSignup = document.getElementById('btn-signup');

  if (pwd !== confirmPwd) return showPopup("Passwords do not match!");
  if (pwd.length < 7) return showPopup("Password must be at least 7 characters!");

  try {
    btnSignup.disabled = true;
    btnSignup.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Creating...';

    const userCredential = await createUserWithEmailAndPassword(auth, document.getElementById('reg-email').value, pwd);
    const user = userCredential.user;
    await sendEmailVerification(user);

    await set(ref(db, 'users/' + user.uid), {
      role: 'user',
      personalDetails: {
        firstName: document.getElementById('reg-fname').value,
        lastName: document.getElementById('reg-lname').value,
        dob: document.getElementById('reg-dob').value,
        aadhaar: document.getElementById('reg-aadhaar').value,
        email: user.email,
        mobile: document.getElementById('reg-mobile').value,
        vehicleNumber: document.getElementById('reg-vehicle').value,
      },
      address: {
        state: document.getElementById('reg-state').value,
        district: document.getElementById('reg-district').value,
        village: document.getElementById('reg-village').value,
        pincode: document.getElementById('reg-pincode').value
      },
      createdAt: new Date().toISOString()
    });

    document.getElementById('signup-form').reset();
    showPopup("Registration successful! Click here to Login.", true);

  } catch (error) { 
    showPopup(error.message); 
  } finally {
    btnSignup.disabled = false;
    btnSignup.innerHTML = '<i class="fas fa-check-circle"></i> Create Account';
  }
});

// ==========================================
// 4. FIREBASE LOGIN & FORGOT PASSWORD
// ==========================================
document.getElementById('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const loginBtn = document.getElementById('btn-login');
  
  try {
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Signing In...';
    loginBtn.disabled = true;

    await signInWithEmailAndPassword(
      auth, 
      document.getElementById('login-email').value, 
      document.getElementById('login-password').value
    );
    
    window.location.href = 'dashboard.html';

  } catch (error) { 
    loginBtn.innerHTML = 'Sign In';
    loginBtn.disabled = false;
    showPopup("Invalid Credentials or User not found."); 
  }
});

document.getElementById('forgot-password').addEventListener('click', async (e) => {
  e.preventDefault();
  const emailInput = document.getElementById('login-email').value;
  
  if (!emailInput) {
    return showPopup("Please enter your email address above first.");
  }

  try {
    await sendPasswordResetEmail(auth, emailInput);
    showPopup("Password reset link sent! Check your inbox.");
  } catch (error) {
    showPopup("Error: " + error.message);
  }
});