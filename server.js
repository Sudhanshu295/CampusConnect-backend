// CampusConnect backend - improved version
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const bcrypt = require('bcrypt');

const app = express();

// Use CORS only from frontend (dev)
app.use(cors({ origin: 'https://campus-connect-frontend-tawny.vercel.app', credentials: true }));
app.use(express.json());

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || 'mongodb+srv://jhasudhanshu913_db_user:xUETM5IjTq0S8C0g@cluster0.zcfhnpa.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0';
mongoose.connect(MONGO_URI)
  .then(() => console.log('MongoDB connected'))
  .catch(err => console.error('MongoDB connection error:', err));

// Schemas
const userSchema = new mongoose.Schema({
  name: String,
  enrollment: String,
  email: String,
  passwordHash: String,
  role: { type: String, default: 'student' }
});

const eventSchema = new mongoose.Schema({
  title: String,
  date: String,
  description: String
});

const regSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  eventId: { type: mongoose.Schema.Types.ObjectId, ref: 'Event' },
  timestamp: { type: Date, default: Date.now }
});

// Models
const User = mongoose.model('User', userSchema);
const Event = mongoose.model('Event', eventSchema);
const Registration = mongoose.model('Registration', regSchema);

// Session setup
app.use(session({
  secret: process.env.SESSION_SECRET || 'campussecret',
  resave: false,
  saveUninitialized: false,
  store: MongoStore.create({ mongoUrl: MONGO_URI }),
  cookie: { maxAge: 1000 * 60 * 60 * 24 } // 1 day
}));

// Helper middleware to catch async errors
const asyncHandler = fn => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ===================== AUTH ROUTES =====================

// Signup
app.post('/api/signup', asyncHandler(async (req, res) => {
  const { name, enrollment, email, password } = req.body;
  const existing = await User.findOne({ enrollment });
  if (existing) return res.status(400).json({ error: 'Enrollment already registered' });
  const hash = await bcrypt.hash(password, 10);
  const user = new User({ name, enrollment, email, passwordHash: hash });
  await user.save();
  req.session.userId = user._id;
  res.json({ message: 'ok', user: { name: user.name, enrollment: user.enrollment, role: user.role } });
}));

// Login
app.post('/api/login', asyncHandler(async (req, res) => {
  const { enrollment, password } = req.body;
  const user = await User.findOne({ enrollment });
  if (!user) return res.status(400).json({ error: 'Invalid credentials' });
  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(400).json({ error: 'Invalid credentials' });
  req.session.userId = user._id;
  res.json({ message: 'ok', user: { name: user.name, enrollment: user.enrollment, role: user.role } });
}));

// Logout
app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ message: 'logged out' }));
});

// Get current user
app.get('/api/me', asyncHandler(async (req, res) => {
  if (!req.session.userId) return res.json({ user: null });
  const user = await User.findById(req.session.userId).select('-passwordHash');
  res.json({ user });
}));

// ===================== EVENT ROUTES =====================

// Get events
app.get('/api/events', asyncHandler(async (req, res) => {
  const events = await Event.find().limit(50);
  res.json(events);
}));

// Create event (admin only)
app.post('/api/events', asyncHandler(async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Not logged in' });
  const user = await User.findById(req.session.userId);
  if (user.role !== 'admin') return res.status(403).json({ error: 'Not authorized' });
  const event = new Event(req.body);
  await event.save();
  res.json(event);
}));

// Register for event
app.post('/api/events/:id/register', asyncHandler(async (req, res) => {
  if (!req.session.userId) return res.status(401).json({ error: 'Login required' });
  const eventId = req.params.id;

  // Check for duplicate registration
  const existing = await Registration.findOne({ userId: req.session.userId, eventId });
  if (existing) return res.status(400).json({ error: 'Already registered' });

  const registration = new Registration({ userId: req.session.userId, eventId });
  await registration.save();
  res.json({ message: 'registered' });
}));

// ===================== SEED ROUTE (dev only) =====================
app.get('/api/seed', asyncHandler(async (req, res) => {
  // Create admin if not exists
  const admin = await User.findOne({ enrollment: 'ADMIN001' });
  if (!admin) {
    const hash = await bcrypt.hash('adminpass', 10);
    await User.create({ name: 'Admin', enrollment: 'ADMIN001', email: 'admin@college.edu', passwordHash: hash, role: 'admin' });
  }

  // Create sample events if none exist
  if ((await Event.countDocuments()) === 0) {
    await Event.create([
      { title: 'Coding Hackathon', date: '2025-11-01', description: 'Team-based competition' },
      { title: 'AI Talk', date: '2025-12-05', description: 'Guest lecture on AI' }
    ]);
  }
  res.json({ message: 'seeded' });
}));

// ===================== GLOBAL ERROR HANDLER =====================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

app.get('/', (req, res) => {
  res.send('CampusConnect backend is running!');
});


// Start server
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

