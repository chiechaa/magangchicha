require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const path = require('path');
const storageConfig = require('./config/storage');
const mikrotikConfig = require('./config/mikrotik');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware CORS
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
}));

app.options('*', cors());

app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Routes Static File
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/login', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.get('/register', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'admin.html'));
});

// Fallback GET /api/register
app.get('/api/register', (req, res) => {
  res.redirect('/register.html');
});

// Register new user
app.post('/api/register', async (req, res) => {
  const isJson = req.headers['content-type'] && req.headers['content-type'].includes('application/json');

  try {
    const { name, email, phone, username, password } = req.body;
    
    // Validate input
    if (!name || !email || !phone || !username || !password) {
      if (isJson) {
        return res.status(400).json({ success: false, message: 'Semua kolom wajib diisi!' });
      }
      return res.status(400).send(`
        <div style="background:#07090e; color:#f87171; font-family:sans-serif; padding:40px; text-align:center; min-height:100vh;">
          <h2>Registrasi Gagal</h2>
          <p>Semua kolom wajib diisi!</p>
          <a href="/register.html" style="color:#00f2fe;">Kembali ke Registrasi</a>
        </div>
      `);
    }
    
    // Check if username already exists
    const existingUser = await storageConfig.getUserByUsername(username);
    if (existingUser) {
      if (isJson) {
        return res.status(400).json({ success: false, message: 'Username sudah terdaftar!' });
      }
      return res.status(400).send(`
        <div style="background:#07090e; color:#f87171; font-family:sans-serif; padding:40px; text-align:center; min-height:100vh;">
          <h2>Registrasi Gagal</h2>
          <p>Username '${username}' sudah terdaftar!</p>
          <a href="/register.html" style="color:#00f2fe;">Kembali ke Registrasi</a>
        </div>
      `);
    }
    
    // Add user to storage (Upstash Redis)
    await storageConfig.addUser({ name, email, phone, username, password });
    
    // Jika request dari AJAX fetch JSON
    if (isJson) {
      return res.json({ success: true, message: 'Registrasi berhasil! Menunggu persetujuan admin.' });
    }

    // Jika dari Form Submit Native (Captive Portal HP): Tampilkan Halaman Sukses Langsung di Layar!
    return res.send(`
      <!DOCTYPE html>
      <html lang="id">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Registrasi Berhasil - TKJ Network</title>
        <style>
          * { margin:0; padding:0; box-sizing:border-box; }
          body {
            background-color: #07090e;
            color: #f8fafc;
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            padding: 20px;
          }
          .card {
            background: #0d1322;
            border: 1px solid #1e293b;
            border-top: 3px solid #10b981;
            border-radius: 12px;
            padding: 32px 24px;
            max-width: 400px;
            width: 100%;
            text-align: center;
            box-shadow: 0 20px 40px rgba(0, 0, 0, 0.8);
          }
          .icon {
            font-size: 48px;
            margin-bottom: 12px;
          }
          h2 {
            color: #34d399;
            font-size: 20px;
            margin-bottom: 8px;
          }
          p {
            color: #94a3b8;
            font-size: 13px;
            line-height: 1.6;
            margin-bottom: 24px;
          }
          .username-badge {
            background: #1e293b;
            color: #00f2fe;
            padding: 4px 10px;
            border-radius: 6px;
            font-family: monospace;
          }
          .btn {
            display: block;
            width: 100%;
            background: linear-gradient(135deg, #00f2fe 0%, #3b82f6 100%);
            color: #07090e;
            padding: 12px;
            border-radius: 8px;
            text-decoration: none;
            font-weight: bold;
            font-size: 13px;
            text-transform: uppercase;
            letter-spacing: 0.05em;
          }
        </style>
      </head>
      <body>
        <div class="card">
          <div class="icon">✅</div>
          <h2>Registrasi Berhasil!</h2>
          <p>
            Akun <span class="username-badge">${username}</span> berhasil terdaftar.<br><br>
            Silakan tunggu persetujuan (<b>approval</b>) dari admin sebelum login ke Hotspot.
          </p>
          <a href="/login.html" class="btn">Kembali ke Login</a>
        </div>
      </body>
      </html>
    `);

  } catch (error) {
    console.error('Registration error:', error);
    if (isJson) {
      return res.status(500).json({ success: false, message: 'Registrasi gagal pada server.' });
    }
    return res.status(500).send(`
      <div style="background:#07090e; color:#f87171; font-family:sans-serif; padding:40px; text-align:center; min-height:100vh;">
        <h2>Terjadi Kesalahan Server</h2>
        <p>Gagal memproses pendaftaran. Silakan coba lagi.</p>
        <a href="/register.html" style="color:#00f2fe;">Coba Lagi</a>
      </div>
    `);
  }
});

// Get all users (admin only) - Statistik MikroTik
app.get('/api/users', async (req, res) => {
  try {
    const users = await storageConfig.getAllUsers();
    
    let mikrotikStats = [];
    if (mikrotikConfig.getUsersStats && typeof mikrotikConfig.getUsersStats === 'function') {
      mikrotikStats = await mikrotikConfig.getUsersStats();
    }

    const enrichedUsers = users.map(user => {
      const stats = mikrotikStats.find(s => s.name === user.username || s.user === user.username) || {};
      
      return {
        ...user,
        bytesIn: parseInt(stats['bytes-in'] || stats.bytesIn || 0),
        bytesOut: parseInt(stats['bytes-out'] || stats.bytesOut || 0),
        uptime: stats.uptime || 'Off'
      };
    });

    res.json({ success: true, users: enrichedUsers });
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ success: false, message: 'Failed to get users' });
  }
});

// Approve user (admin only)
app.post('/api/approve', async (req, res) => {
  try {
    const { username, adminName } = req.body;
    
    if (!username || !adminName) {
      return res.status(400).json({ success: false, message: 'Username and admin name are required' });
    }
    
    await storageConfig.approveUser(username, adminName);
    
    const userData = await storageConfig.getUserByUsername(username);
    await mikrotikConfig.addUserToHotspot(userData.username, userData.password);
    
    res.json({ success: true, message: 'User approved successfully' });
  } catch (error) {
    console.error('Approval error:', error);
    res.status(500).json({ success: false, message: 'Approval failed' });
  }
});

// Reject user (admin only)
app.post('/api/reject', async (req, res) => {
  try {
    const { username, adminName } = req.body;
    
    if (!username || !adminName) {
      return res.status(400).json({ success: false, message: 'Username and admin name are required' });
    }
    
    await storageConfig.rejectUser(username, adminName);
    
    res.json({ success: true, message: 'User rejected successfully' });
  } catch (error) {
    console.error('Rejection error:', error);
    res.status(500).json({ success: false, message: 'Rejection failed' });
  }
});

// Delete user (admin only)
app.delete('/api/users/:username', async (req, res) => {
  try {
    const { username } = req.params;
    
    await storageConfig.deleteUser(username);
    await mikrotikConfig.removeUserFromHotspot(username);
    
    res.json({ success: true, message: 'User deleted successfully' });
  } catch (error) {
    console.error('Deletion error:', error);
    res.status(500).json({ success: false, message: 'Deletion failed' });
  }
});

// Validate login
app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }
    
    const user = await storageConfig.getUserByUsername(username);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    if (user.password !== password) {
      return res.status(401).json({ success: false, message: 'Invalid password' });
    }
    
    if (user.status !== 'approved') {
      return res.status(403).json({ success: false, message: 'User not approved yet' });
    }
    
    const mikrotikResult = await mikrotikConfig.validateLogin(username, password);
    
    if (mikrotikResult.success) {
      res.json({ success: true, message: 'Login successful', user: { name: user.name, username: user.username } });
    } else {
      res.status(401).json({ success: false, message: mikrotikResult.message });
    }
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
});

// Check user status
app.get('/api/status/:username', async (req, res) => {
  try {
    const { username } = req.params;
    const user = await storageConfig.getUserByUsername(username);
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    res.json({ success: true, status: user.status });
  } catch (error) {
    console.error('Status check error:', error);
    res.status(500).json({ success: false, message: 'Status check failed' });
  }
});

// Admin authentication
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  
  if (password === process.env.ADMIN_PASSWORD) {
    res.json({ success: true, message: 'Admin login successful' });
  } else {
    res.status(401).json({ success: false, message: 'Invalid admin password' });
  }
});

module.exports = app;

if (process.env.NODE_ENV !== 'production') {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}
