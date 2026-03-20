import Database from 'better-sqlite3';
import fs from 'fs';

console.log('🔧 Setting up Auto-Lister...\n');

// Create data directory
if (!fs.existsSync('./data')) {
  fs.mkdirSync('./data', { recursive: true });
  console.log('✅ Created data directory');
}

// Initialize database
const db = new Database('./data/auto-lister.db');
console.log('✅ Database initialized');

// Create tables
const tables = [
  `CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    email TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    name TEXT NOT NULL,
    subscription_tier TEXT DEFAULT 'free',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`,

  `CREATE TABLE IF NOT EXISTS products (
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
  )`,

  `CREATE TABLE IF NOT EXISTS listings (
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
  )`,

  `CREATE TABLE IF NOT EXISTS inventory (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id TEXT NOT NULL,
    product_id INTEGER NOT NULL,
    total_quantity INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (product_id) REFERENCES products(id)
  )`,

  `CREATE TABLE IF NOT EXISTS orders (
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
  )`
];

tables.forEach((table, index) => {
  db.exec(table);
});

console.log('✅ Created database tables');

// Create demo user
try {
  db.prepare(`
    INSERT INTO users (id, email, password, name, subscription_tier)
    VALUES (?, ?, ?, ?, ?)
  `).run('demo-user', 'admin@example.com', 'Admin123!', 'Admin User', 'professional');
  
  console.log('✅ Created demo user');
  console.log('   Email: admin@example.com');
  console.log('   Password: Admin123!');
} catch (e) {
  console.log('⚠️  Demo user already exists');
}

db.close();

console.log('\n✅ Setup complete!\n');
console.log('Run: npm run dev\n');