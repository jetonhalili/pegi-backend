CREATE TABLE IF NOT EXISTS books(
  id SERIAL PRIMARY KEY,
  title TEXT NOT NULL,
  author TEXT,
  category TEXT,
  isbn TEXT,
  price NUMERIC(8,2) NOT NULL DEFAULT 0,
  stock INT NOT NULL DEFAULT 0,
  description TEXT,
  cover_url TEXT,
  created_at TIMESTAMP DEFAULT now(),
  updated_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS customers(
  id SERIAL PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT UNIQUE,
  phone TEXT,
  address TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS orders(
  id SERIAL PRIMARY KEY,
  order_number TEXT UNIQUE,
  customer_id INT REFERENCES customers(id),
  status TEXT NOT NULL DEFAULT 'new',
  subtotal NUMERIC(10,2) NOT NULL DEFAULT 0,
  tax NUMERIC(10,2) NOT NULL DEFAULT 0,
  shipping NUMERIC(10,2) NOT NULL DEFAULT 0,
  total NUMERIC(10,2) NOT NULL DEFAULT 0,
  payment_method TEXT,
  payment_status TEXT,
  created_at TIMESTAMP DEFAULT now()
);
CREATE TABLE IF NOT EXISTS order_items(
  id SERIAL PRIMARY KEY,
  order_id INT REFERENCES orders(id) ON DELETE CASCADE,
  book_id INT REFERENCES books(id),
  qty INT NOT NULL,
  price NUMERIC(8,2) NOT NULL
);
