const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const Database = require('better-sqlite3');
const path = require('path');
const Razorpay = require('razorpay');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const db = new Database('csc_portal.db');

// Initialize Razorpay
// REPLACE THESE WITH YOUR ACTUAL KEYS
const razorpay = new Razorpay({
    key_id: 'rzp_test_PLACEHOLDER',
    key_secret: 'YOUR_SECRET_KEY'
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Serve index.html for root and client-side routing
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Initialize Database
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE,
    password TEXT,
    role TEXT DEFAULT 'user'
  );
  CREATE TABLE IF NOT EXISTS appointments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId INTEGER,
    operatorId INTEGER,
    status TEXT DEFAULT 'pending_payment',
    scheduledAt DATETIME,
    paymentId TEXT,
    amount INTEGER DEFAULT 5000
  );
`);

// API Routes
app.post('/api/register', (req, res) => {
    const { username, password, role } = req.body;
    try {
        const stmt = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
        const info = stmt.run(username, password, role || 'user');
        res.json({ success: true, userId: info.lastInsertRowid });
    } catch (err) {
        res.status(400).json({ success: false, error: 'Username already exists' });
    }
});

app.post('/api/login', (req, res) => {
    const { username, password } = req.body;
    const stmt = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?');
    const user = stmt.get(username, password);
    if (user) {
        res.json({ success: true, user });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

app.post('/api/book', (req, res) => {
    const { userId, scheduledAt } = req.body;
    const stmt = db.prepare('INSERT INTO appointments (userId, scheduledAt) VALUES (?, ?)');
    const info = stmt.run(userId, scheduledAt);
    res.json({ success: true, appointmentId: info.lastInsertRowid });
});

// Create Razorpay Order
app.post('/api/create-order', async (req, res) => {
    const { appointmentId } = req.body;
    const amount = 5000; // ₹50.00 in paise

    try {
        const options = {
            amount: amount,
            currency: "INR",
            receipt: "order_rcptid_" + appointmentId,
        };

        // In a real scenario with valid keys:
        // const order = await razorpay.orders.create(options);
        // res.json({ success: true, order });

        // MOCKING for demonstration without keys:
        const mockOrder = {
            id: "order_" + Date.now(),
            amount: amount,
            currency: "INR"
        };
        res.json({ success: true, order: mockOrder });

    } catch (error) {
        console.error(error);
        res.status(500).json({ success: false, error: 'Payment initiation failed' });
    }
});

app.post('/api/verify-payment', (req, res) => {
    const { appointmentId, paymentId, orderId, signature } = req.body;

    // Verify signature here using razorpay-node sdk in production

    const stmt = db.prepare('UPDATE appointments SET status = ?, paymentId = ? WHERE id = ?');
    stmt.run('paid', paymentId, appointmentId);
    res.json({ success: true });
});

app.get('/api/appointments', (req, res) => {
    const stmt = db.prepare('SELECT * FROM appointments ORDER BY id DESC');
    const appointments = stmt.all();
    res.json({ success: true, appointments });
});

// Socket.io
io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    socket.on('join-room', (roomId, userId) => {
        socket.join(roomId);
        socket.to(roomId).emit('user-connected', userId);
    });

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});
