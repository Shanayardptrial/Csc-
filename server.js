require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const path = require('path');
const Razorpay = require('razorpay');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Database setup - Use PostgreSQL on Render, SQLite locally
let db;
let isPostgres = false;

if (process.env.DATABASE_URL) {
    // Use PostgreSQL (Render)
    const { Pool } = require('pg');
    db = new Pool({
        connectionString: process.env.DATABASE_URL,
        ssl: {
            rejectUnauthorized: false
        }
    });
    isPostgres = true;
    console.log('Using PostgreSQL database');
} else {
    // Use SQLite (Local development)
    const Database = require('better-sqlite3');
    db = new Database('csc_portal.db');
    isPostgres = false;
    console.log('Using SQLite database');

    // Create tables for SQLite
    db.exec(`
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);

    db.exec(`
        CREATE TABLE IF NOT EXISTS appointments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            userId INTEGER,
            operatorId INTEGER,
            status TEXT DEFAULT 'pending_payment',
            scheduledAt DATETIME,
            paymentId TEXT,
            amount INTEGER DEFAULT 5000,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
    `);
}

// Initialize Razorpay
const razorpay = new Razorpay({
    key_id: 'rzp_test_PLACEHOLDER',
    key_secret: 'YOUR_SECRET_KEY'
});

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// API Routes
app.post('/api/register', async (req, res) => {
    const { username, password, role } = req.body;

    try {
        if (isPostgres) {
            const result = await db.query(
                'INSERT INTO users (username, password, role) VALUES ($1, $2, $3) RETURNING id',
                [username, password, role || 'user']
            );
            res.json({ success: true, userId: result.rows[0].id });
        } else {
            const stmt = db.prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)');
            const info = stmt.run(username, password, role || 'user');
            res.json({ success: true, userId: info.lastInsertRowid });
        }
    } catch (err) {
        console.error('Registration error:', err);
        res.status(400).json({ success: false, error: 'Username already exists' });
    }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    try {
        if (isPostgres) {
            const result = await db.query(
                'SELECT * FROM users WHERE username = $1 AND password = $2',
                [username, password]
            );
            const user = result.rows[0];
            if (user) {
                res.json({ success: true, user });
            } else {
                res.status(401).json({ success: false, error: 'Invalid credentials' });
            }
        } else {
            const stmt = db.prepare('SELECT * FROM users WHERE username = ? AND password = ?');
            const user = stmt.get(username, password);
            if (user) {
                res.json({ success: true, user });
            } else {
                res.status(401).json({ success: false, error: 'Invalid credentials' });
            }
        }
    } catch (err) {
        console.error('Login error:', err);
        res.status(500).json({ success: false, error: 'Login failed' });
    }
});

app.post('/api/book', async (req, res) => {
    const { userId, scheduledAt } = req.body;

    try {
        if (isPostgres) {
            const result = await db.query(
                'INSERT INTO appointments (user_id, scheduled_at) VALUES ($1, $2) RETURNING id',
                [userId, scheduledAt]
            );
            res.json({ success: true, appointmentId: result.rows[0].id });
        } else {
            const stmt = db.prepare('INSERT INTO appointments (userId, scheduledAt) VALUES (?, ?)');
            const info = stmt.run(userId, scheduledAt);
            res.json({ success: true, appointmentId: info.lastInsertRowid });
        }
    } catch (err) {
        console.error('Booking error:', err);
        res.status(500).json({ success: false, error: 'Booking failed' });
    }
});

app.post('/api/create-order', async (req, res) => {
    const { appointmentId } = req.body;
    const amount = 5000;

    try {
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

app.post('/api/verify-payment', async (req, res) => {
    const { appointmentId, paymentId, orderId, signature } = req.body;

    try {
        if (isPostgres) {
            await db.query(
                'UPDATE appointments SET status = $1, payment_id = $2 WHERE id = $3',
                ['paid', paymentId, appointmentId]
            );
        } else {
            const stmt = db.prepare('UPDATE appointments SET status = ?, paymentId = ? WHERE id = ?');
            stmt.run('paid', paymentId, appointmentId);
        }
        res.json({ success: true });
    } catch (err) {
        console.error('Payment verification error:', err);
        res.status(500).json({ success: false, error: 'Update failed' });
    }
});

app.get('/api/appointments', async (req, res) => {
    try {
        if (isPostgres) {
            const result = await db.query('SELECT * FROM appointments ORDER BY id DESC');
            const appointments = result.rows.map(apt => ({
                id: apt.id,
                userId: apt.user_id,
                operatorId: apt.operator_id,
                status: apt.status,
                scheduledAt: apt.scheduled_at,
                paymentId: apt.payment_id,
                amount: apt.amount
            }));
            res.json({ success: true, appointments });
        } else {
            const stmt = db.prepare('SELECT * FROM appointments ORDER BY id DESC');
            const appointments = stmt.all();
            res.json({ success: true, appointments });
        }
    } catch (err) {
        console.error('Fetch appointments error:', err);
        res.status(500).json({ success: false, appointments: [] });
    }
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
