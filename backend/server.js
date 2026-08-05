require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const { connectDb, Admin, User, Session } = require('./db');

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

// Serve Admin Panel Static Files
app.use('/admin', express.static(path.join(__dirname, '../admin-panel')));

app.get('/', (req, res) => {
  res.redirect('/admin');
});

function isUserExpired(user) {
  if (!user.expireAt) return false;
  return new Date(user.expireAt) < new Date();
}

// -------------------------------------------------------------
// 🔑 ADMIN API ROUTES
// -------------------------------------------------------------

app.post('/api/admin/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const admin = await Admin.findOne({ username });
    if (admin && admin.password === password) {
      return res.json({ success: true, token: "admin_token_secret_8899", username: admin.username });
    }
    return res.status(401).json({ success: false, message: "Invalid admin credentials!" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post('/api/admin/change-password', async (req, res) => {
  try {
    const { oldPassword, newPassword } = req.body;
    const admin = await Admin.findOne({ username: 'admin' });
    if (!admin || oldPassword !== admin.password) {
      return res.status(400).json({ success: false, message: "Current password incorrect!" });
    }
    admin.password = newPassword;
    await admin.save();
    res.json({ success: true, message: "Admin password updated successfully!" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.get('/api/admin/users', async (req, res) => {
  try {
    const users = await User.find({}).lean();
    const usersWithComputedStatus = users.map(user => {
      const expired = isUserExpired(user);
      let computedStatus = user.status;
      if (user.status === 'active' && expired) {
        computedStatus = 'expired';
      }
      return {
        ...user,
        computedStatus,
        isExpired: expired
      };
    });
    res.json({ success: true, users: usersWithComputedStatus });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post('/api/admin/users', async (req, res) => {
  try {
    const { username, password, validityDays, note, maxDevices } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: "Username and password are required!" });
    }

    const existing = await User.findOne({ username: { $regex: new RegExp(`^${username}$`, 'i') } });
    if (existing) {
      return res.status(400).json({ success: false, message: "Username already exists!" });
    }

    const days = parseInt(validityDays) || 30;
    const expireDate = new Date();
    expireDate.setDate(expireDate.getDate() + days);

    const newUser = new User({
      id: "usr_" + Date.now().toString(36) + Math.random().toString(36).substr(2, 4),
      username: username.trim(),
      password: password.trim(),
      status: "active",
      expireAt: expireDate,
      note: note || "",
      maxDevices: parseInt(maxDevices) || 1
    });

    await newUser.save();
    res.json({ success: true, message: "User created successfully!", user: newUser });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post('/api/admin/users/:id/toggle-block', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findOne({ id });
    if (!user) return res.status(404).json({ success: false, message: "User not found!" });

    user.status = user.status === "active" ? "blocked" : "active";
    await user.save();
    res.json({ success: true, message: `User status changed to ${user.status.toUpperCase()}`, status: user.status });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post('/api/admin/users/:id/reset-device', async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findOne({ id });
    if (!user) return res.status(404).json({ success: false, message: "User not found!" });

    user.boundDeviceId = null;
    user.boundDeviceName = null;
    await user.save();
    res.json({ success: true, message: "Device lock reset! User can now log in on a new PC." });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.post('/api/admin/users/:id/extend', async (req, res) => {
  try {
    const { id } = req.params;
    const { days } = req.body;
    const user = await User.findOne({ id });
    if (!user) return res.status(404).json({ success: false, message: "User not found!" });

    const addDays = parseInt(days) || 30;
    let baseDate = new Date(user.expireAt);
    if (isNaN(baseDate.getTime()) || baseDate < new Date()) {
      baseDate = new Date();
    }
    baseDate.setDate(baseDate.getDate() + addDays);

    user.expireAt = baseDate;
    await user.save();
    res.json({ success: true, message: `Validity extended by ${addDays} days!`, expireAt: user.expireAt });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

app.delete('/api/admin/users/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await User.findOneAndDelete({ id });
    if (!deleted) return res.status(404).json({ success: false, message: "User not found!" });
    res.json({ success: true, message: "User deleted successfully!" });
  } catch (error) {
    res.status(500).json({ success: false, message: "Server error" });
  }
});

// -------------------------------------------------------------
// 📊 ACTIVE SESSIONS (ADMIN)
// -------------------------------------------------------------

app.get('/api/admin/sessions', async (req, res) => {
  try {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const sessions = await Session.find({}).lean();
    const result = sessions.map(s => ({
      ...s,
      online: new Date(s.lastPing) > fiveMinAgo
    }));
    res.json({ success: true, sessions: result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// -------------------------------------------------------------
// 🛡️ CLIENT / EXTENSION API ROUTES
// -------------------------------------------------------------

app.post('/api/client/login', async (req, res) => {
  try {
    const { username, password, deviceId, deviceName } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!username || !password) {
      return res.status(400).json({ allowed: false, message: "Enter User ID and Password!" });
    }

    const user = await User.findOne({ username: { $regex: new RegExp(`^${username.trim()}$`, 'i') } });

    if (!user || user.password !== password.trim()) {
      return res.status(401).json({ allowed: false, message: "Invalid User ID or Password!" });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({ allowed: false, status: 'blocked', message: "Account is BLOCKED by Admin! Contact support." });
    }

    if (isUserExpired(user)) {
      return res.status(403).json({ allowed: false, status: 'expired', message: "Account validity EXPIRED! Please renew your subscription." });
    }

    const currentDeviceId = deviceId || "unknown_device";

    if (!user.boundDeviceId) {
      user.boundDeviceId = currentDeviceId;
      user.boundDeviceName = deviceName || "PC-1";
    } else if (user.boundDeviceId !== currentDeviceId) {
      return res.status(403).json({
        allowed: false,
        status: 'device_mismatch',
        message: `🚫 THIS ACCOUNT IS LOCKED TO ANOTHER COMPUTER! (${user.boundDeviceName || 'PC-1'}). You cannot share your account.`
      });
    }

    user.lastLogin = new Date();
    user.lastIp = clientIp;
    await user.save();

    // Track session
    const { sessionId } = req.body;
    const sid = sessionId || (user.id + '_' + currentDeviceId + '_' + Date.now());
    await Session.findOneAndUpdate(
      { sessionId: sid },
      { username: user.username, deviceId: currentDeviceId, ip: clientIp, lastPing: new Date(), sessionId: sid },
      { upsert: true, new: true }
    );

    const token = Buffer.from(`${user.id}:${user.username}:${currentDeviceId}:${Date.now()}`).toString('base64');

    res.json({
      allowed: true,
      status: 'active',
      token: token,
      username: user.username,
      expireAt: user.expireAt,
      boundDeviceId: user.boundDeviceId,
      message: "Login successful!"
    });
  } catch (error) {
    res.status(500).json({ allowed: false, message: "Server error" });
  }
});

app.post('/api/client/verify', async (req, res) => {
  try {
    const { username, token, deviceId } = req.body;
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    if (!username) {
      return res.status(400).json({ allowed: false, message: "Username missing" });
    }

    const user = await User.findOne({ username: { $regex: new RegExp(`^${username.trim()}$`, 'i') } });

    if (!user) {
      return res.status(404).json({ allowed: false, message: "User account not found" });
    }

    if (user.status === 'blocked') {
      return res.status(403).json({ allowed: false, status: 'blocked', message: "Your account has been BLOCKED by Admin!" });
    }

    if (isUserExpired(user)) {
      return res.status(403).json({ allowed: false, status: 'expired', message: "Subscription EXPIRED! Contact admin to renew." });
    }

    if (deviceId && user.boundDeviceId && user.boundDeviceId !== deviceId) {
      return res.status(403).json({
        allowed: false,
        status: 'device_mismatch',
        message: "🚫 DEVICE MISMATCH! Account locked to a different PC."
      });
    }

    user.lastLogin = new Date();
    user.lastIp = clientIp;
    await user.save();

    res.json({
      allowed: true,
      status: 'active',
      username: user.username,
      expireAt: user.expireAt
    });
  } catch (error) {
    res.status(500).json({ allowed: false, message: "Server error" });
  }
});

// Ping endpoint - extension calls this every 3 mins to stay "online"
app.post('/api/client/ping', async (req, res) => {
  try {
    const { username, sessionId, deviceId } = req.body;
    if (!username || !sessionId) return res.json({ ok: false });
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    await Session.findOneAndUpdate(
      { sessionId },
      { username, deviceId: deviceId || 'unknown', ip: clientIp, lastPing: new Date() },
      { upsert: true, new: true }
    );
    res.json({ ok: true });
  } catch (e) {
    res.json({ ok: false });
  }
});

// Bind to 0.0.0.0 to accept incoming Wi-Fi network connections
connectDb().then(() => {
  app.listen(PORT, '0.0.0.0', () => {
    console.log(`=================================================`);
    console.log(`🚀 Visa Extension Control Server running on port ${PORT}`);
    console.log(`💻 Admin URL: http://localhost:${PORT}/admin`);
    console.log(`=================================================`);
  });
});
