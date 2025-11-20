const socket = io();
let currentUser = null;
let currentAppointmentId = null;
let currentServiceType = 'General Consultation';

// Navigation
function showPage(pageId) {
    document.querySelectorAll('.page').forEach(page => page.classList.add('hidden'));
    document.getElementById(`${pageId}-page`).classList.remove('hidden');

    if (pageId === 'dashboard') {
        loadAppointments();
        if (currentUser) {
            document.getElementById('user-name-display').textContent = currentUser.username;
        }
    }
}

function updateNav() {
    const loginBtn = document.getElementById('login-btn');
    const logoutBtn = document.getElementById('logout-btn');
    if (currentUser) {
        loginBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
    } else {
        loginBtn.classList.remove('hidden');
        logoutBtn.classList.add('hidden');
    }
}

function logout() {
    currentUser = null;
    updateNav();
    showPage('landing');
}

// Auth
document.getElementById('login-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('login-username').value;
    const password = document.getElementById('login-password').value;

    const res = await fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
    });
    const data = await res.json();

    if (data.success) {
        currentUser = data.user;
        updateNav();
        showPage('dashboard');
    } else {
        alert(data.error);
    }
});

document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('reg-username').value;
    const password = document.getElementById('reg-password').value;
    const role = document.getElementById('reg-role').value;

    const res = await fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password, role })
    });
    const data = await res.json();

    if (data.success) {
        alert('Registration successful! Please login.');
        showPage('login');
    } else {
        alert(data.error);
    }
});

// Booking & Payment
document.getElementById('booking-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!currentUser) return;

    const scheduledAt = document.getElementById('book-time').value;
    const serviceType = document.getElementById('book-service').value;
    currentServiceType = serviceType;

    // 1. Create Appointment
    const res = await fetch('/api/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: currentUser.id, scheduledAt, service: serviceType })
    });
    const data = await res.json();

    if (data.success) {
        currentAppointmentId = data.appointmentId;

        // 2. Open Razorpay Payment Page
        window.open('https://rzp.io/rzp/2KLaksmx', '_blank');

        // 3. Show Verification Modal
        document.getElementById('payment-modal').classList.remove('hidden');
    }
});

async function verifyManualPayment() {
    const paymentId = document.getElementById('payment-id-input').value;
    if (!paymentId) {
        alert('Please enter a Payment ID');
        return;
    }

    // 4. Verify
    await fetch('/api/verify-payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            appointmentId: currentAppointmentId,
            paymentId: paymentId,
            orderId: "MANUAL_VERIFY",
            signature: "MANUAL_SIG"
        })
    });

    closePaymentModal();
    alert('Payment Verified!');
    loadAppointments();
    showReceipt(currentAppointmentId, paymentId, currentServiceType);
}

function closePaymentModal() {
    document.getElementById('payment-modal').classList.add('hidden');
    document.getElementById('payment-id-input').value = '';
}

function showReceipt(appointmentId, paymentId, service = 'Consultation') {
    document.getElementById('rcpt-date').textContent = new Date().toLocaleDateString();
    document.getElementById('rcpt-id').textContent = paymentId;
    document.getElementById('rcpt-user').textContent = currentUser.username;
    document.getElementById('rcpt-service').textContent = service;
    document.getElementById('receipt-modal').classList.remove('hidden');
}

function closeReceipt() {
    document.getElementById('receipt-modal').classList.add('hidden');
}

async function loadAppointments() {
    const res = await fetch('/api/appointments');
    const data = await res.json();
    const list = document.getElementById('appointments-list');
    list.innerHTML = '';

    data.appointments.forEach(apt => {
        const div = document.createElement('div');
        div.className = 'p-4 bg-slate-950 rounded-xl border border-slate-800 flex justify-between items-center hover:border-brand-500/30 transition-colors';
        div.innerHTML = `
            <div>
                <div class="flex items-center gap-2 mb-1">
                    <span class="font-bold text-white">#${apt.id}</span>
                    <span class="text-xs px-2 py-0.5 rounded-full ${apt.status === 'paid' ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/20'} uppercase font-bold tracking-wider">${apt.status}</span>
                </div>
                <p class="text-sm text-slate-400">${new Date(apt.scheduledAt).toLocaleString()}</p>
            </div>
            <div class="flex gap-2">
                ${apt.status === 'paid' ? `<button onclick="showReceipt('${apt.id}', '${apt.paymentId}')" class="bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg text-sm font-medium transition-all">Receipt</button>` : ''}
                ${apt.status === 'paid' ? `<button onclick="startCall(${apt.id})" class="bg-brand-600 hover:bg-brand-500 text-white px-4 py-2 rounded-lg text-sm font-medium shadow-lg shadow-brand-500/20 transition-all">Join Call</button>` : ''}
            </div>
        `;
        list.appendChild(div);
    });
}

// Video Call
async function startCall(roomId) {
    showPage('call');

    try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
        document.getElementById('local-video').srcObject = stream;

        socket.emit('join-room', roomId, currentUser.id);
        console.log('Joined room:', roomId);
    } catch (err) {
        console.error('Error accessing media devices:', err);
        alert('Could not access camera/microphone');
    }
}

function endCall() {
    const video = document.getElementById('local-video');
    if (video.srcObject) {
        video.srcObject.getTracks().forEach(track => track.stop());
        video.srcObject = null;
    }
    showPage('dashboard');
}
