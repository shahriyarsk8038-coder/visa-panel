const mongoose = require('mongoose');

// Define Admin Schema
const adminSchema = new mongoose.Schema({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true }
});

// Define User Schema
const userSchema = new mongoose.Schema({
  id: { type: String, required: true, unique: true },
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  status: { type: String, default: 'active' }, // "active" | "blocked"
  expireAt: { type: Date, required: true },
  note: { type: String, default: '' },
  boundDeviceId: { type: String, default: null },
  boundDeviceName: { type: String, default: null },
  maxDevices: { type: Number, default: 1 },
  lastLogin: { type: Date, default: null },
  lastIp: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

// Session Schema - tracks each browser session
const sessionSchema = new mongoose.Schema({
  username: { type: String, required: true },
  deviceId: { type: String, required: true },
  sessionId: { type: String, required: true, unique: true },
  ip: { type: String, default: '' },
  lastPing: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

const Admin = mongoose.model('Admin', adminSchema);
const User = mongoose.model('User', userSchema);
const Session = mongoose.model('Session', sessionSchema);

// Connect to MongoDB
async function connectDb() {
  try {
    const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/visa_panel_db";
    await mongoose.connect(MONGODB_URI);
    console.log('✅ Connected to MongoDB successfully.');
    
    // Initialize default admin if it doesn't exist
    const adminExists = await Admin.findOne({ username: 'admin' });
    if (!adminExists) {
      await Admin.create({ username: 'admin', password: 'admin123' });
      console.log('Admin account created with default credentials.');
    }
  } catch (error) {
    console.error('❌ MongoDB Connection Error:', error);
    process.exit(1);
  }
}

module.exports = {
  connectDb,
  Admin,
  User,
  Session
};
