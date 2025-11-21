require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
const path = require('path');
const Razorpay = require('razorpay');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Initialize Supabase
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Error: SUPABASE_URL and SUPABASE_KEY are required in .env file');
}

const supabase = createClient(supabaseUrl, supabaseKey);

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

// API Routes
app.post('/api/register', async (req, res) => {
    const { username, password, role } = req.body;

    const { data, error } = await supabase
        .from('users')
        .insert([{ username, password, role: role || 'user' }])
        .select()
        .single();

    if (error) {
        console.error('Registration error:', error);
        return res.status(400).json({ success: false, error: error.message || 'Username already exists or error creating user' });
    }

    res.json({ success: true, userId: data.id });
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;

    const { data: user, error } = await supabase
        .from('users')
        .select('*')
        .eq('username', username)
        .eq('password', password)
        .single();

    if (user) {
        res.json({ success: true, user });
    } else {
        res.status(401).json({ success: false, error: 'Invalid credentials' });
    }
});

app.post('/api/book', async (req, res) => {
    const { userId, scheduledAt } = req.body;

    // Note: Supabase expects snake_case column names usually, but we map input camelCase to DB snake_case
    const { data, error } = await supabase
        .from('appointments')
        .insert([{
            user_id: userId,
            scheduled_at: scheduledAt
        }])
        .select()
        .single();

    if (error) {
        console.error('Booking error:', error);
        return res.status(500).json({ success: false, error: 'Booking failed' });
    }

    res.json({ success: true, appointmentId: data.id });
});

// Create Razorpay Order
app.post('/api/create-order', async (req, res) => {
    const { appointmentId } = req.body;
    const amount = 5000; // ₹50.00 in paise

    try {
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

app.post('/api/verify-payment', async (req, res) => {
    const { appointmentId, paymentId, orderId, signature } = req.body;

    const { error } = await supabase
        .from('appointments')
        .update({
            status: 'paid',
            payment_id: paymentId
        })
        .eq('id', appointmentId);

    if (error) {
        console.error('Payment verification update error:', error);
        return res.status(500).json({ success: false, error: 'Update failed' });
    }

    res.json({ success: true });
});

app.get('/api/appointments', async (req, res) => {
    const { data, error } = await supabase
        .from('appointments')
        .select('*')
        .order('id', { ascending: false });

    if (error) {
        console.error('Fetch appointments error:', error);
        return res.status(500).json({ success: false, appointments: [] });
    }

    // Map snake_case DB columns to camelCase for frontend compatibility
    const appointments = data.map(apt => ({
        id: apt.id,
        userId: apt.user_id,
        operatorId: apt.operator_id,
        status: apt.status,
        scheduledAt: apt.scheduled_at,
        paymentId: apt.payment_id,
        amount: apt.amount
    }));

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
