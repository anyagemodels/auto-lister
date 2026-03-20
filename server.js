
```javascript
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import Database from 'better-sqlite3';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory exists
if (!fs.existsSync('./data')) {
  fs.mkdirSync('./data', { recursive: true });
}

// Initialize database
const db = new Database('./data/auto-lister.db');
db.pragma('journal_mode = WAL');

// Create tables if they don't exist
db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    subscription_tier TEXT DEFAULT 'free',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT,
    price REAL NOT NULL,
    category TEXT,
    sku TEXT UNIQUE,
    images TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS listings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    marketplace TEXT NOT NULL,
    marketplace_id TEXT,
    url TEXT,
    status TEXT DEFAULT 'active',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    total_quantity INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  );

  CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    listing_id INTEGER,
    customer_email TEXT,
    amount REAL NOT NULL,
    status TEXT DEFAULT 'pending',
    marketplace TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (listing_id) REFERENCES listings(id)
  );
`);

// Middleware
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// API Routes

// Health check
app.get('/api/health', (req, res) => {
  res.json({ 
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Authentication
app.post('/api/auth/register', (req, res) => {
  try {
    const { email, password, name } = req.body;

    if (!email || !password || !name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const id = `user_${Date.now()}`;
    const stmt = db.prepare(`
      INSERT INTO users (id, email, password, name) 
      VALUES (?, ?, ?, ?)
    `);
    
    stmt.run(id, email, password, name);

    res.status(201).json({ 
      success: true, 
      message: 'User registered successfully',
      userId: id 
    });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(400).json({ error: error.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { email, password } = req.body;

    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);

    if (!user || user.password !== password) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    res.json({ 
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        tier: user.subscription_tier
      }
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Products API
app.get('/api/products', (req, res) => {
  try {
    const userId = req.query.userId;
    
    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const products = db.prepare(`
      SELECT * FROM products WHERE user_id = ? ORDER BY created_at DESC
    `).all(userId);

    res.json({ products });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.post('/api/products', (req, res) => {
  try {
    const { userId, title, description, price, category, sku, images } = req.body;

    if (!userId || !title || !price) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    const stmt = db.prepare(`
      INSERT INTO products (user_id, title, description, price, category, sku, images)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(userId, title, description, price, category, sku, JSON.stringify(images || []));

    res.status(201).json({ 
      success: true,
      productId: result.lastInsertRowid
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const product = db.prepare('SELECT * FROM products WHERE id = ?').get(req.params.id);

    if (!product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    res.json({ product });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Inventory API
app.get('/api/inventory', (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const inventory = db.prepare(`
      SELECT i.*, p.title, p.sku FROM inventory i
      JOIN products p ON i.product_id = p.id
      WHERE i.user_id = ?
    `).all(userId);

    const totalQuantity = db.prepare(`
      SELECT SUM(total_quantity) as total FROM inventory WHERE user_id = ?
    `).get(userId);

    res.json({ 
      inventory,
      total: totalQuantity?.total || 0
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Orders API
app.get('/api/orders', (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const orders = db.prepare(`
      SELECT o.*, p.title FROM orders o
      LEFT JOIN listings l ON o.listing_id = l.id
      LEFT JOIN products p ON l.product_id = p.id
      WHERE o.user_id = ?
      ORDER BY o.created_at DESC
    `).all(userId);

    res.json({ orders });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Dashboard API
app.get('/api/dashboard', (req, res) => {
  try {
    const userId = req.query.userId;

    if (!userId) {
      return res.status(400).json({ error: 'userId required' });
    }

    const totalProducts = db.prepare('SELECT COUNT(*) as count FROM products WHERE user_id = ?').get(userId);
    const totalListings = db.prepare('SELECT COUNT(*) as count FROM listings WHERE user_id = ?').get(userId);
    const totalOrders = db.prepare('SELECT COUNT(*) as count FROM orders WHERE user_id = ?').get(userId);
    const totalRevenue = db.prepare('SELECT SUM(amount) as total FROM orders WHERE user_id = ?').get(userId);

    const recentOrders = db.prepare(`
      SELECT * FROM orders WHERE user_id = ? ORDER BY created_at DESC LIMIT 5
    `).all(userId);

    res.json({
      stats: {
        products: totalProducts?.count || 0,
        listings: totalListings?.count || 0,
        orders: totalOrders?.count || 0,
        revenue: totalRevenue?.total || 0
      },
      recentOrders
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Serve React app for all other routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Error handling
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════╗
║       AUTO-LISTER SERVER RUNNING       ║
╚════════════════════════════════════════╝

🚀 Server:  http://localhost:${PORT}
📊 API:     http://localhost:${PORT}/api
📱 Frontend: http://localhost:${PORT}
💾 Database: ./data/auto-lister.db

Press Ctrl+C to stop
  `);
});

export default app;
