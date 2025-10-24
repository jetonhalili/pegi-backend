import express from 'express'
import cors from 'cors'
import { readFileSync } from 'fs'
import path from 'path'
import url from 'url'
import dotenv from 'dotenv'
import pkg from 'pg'
import Stripe from 'stripe'
import PDFDocument from 'pdfkit'

dotenv.config()
const __dirname = path.dirname(url.fileURLToPath(import.meta.url))
const { Pool } = pkg
const app = express()
app.use(cors())
app.use(express.json())

const PORT = process.env.PORT || 8787
const pool = new Pool({ connectionString: process.env.DATABASE_URL })
const stripe = process.env.STRIPE_SECRET_KEY ? new Stripe(process.env.STRIPE_SECRET_KEY) : null

const q = async (text, params=[]) => (await pool.query(text, params)).rows

const VAT = Number(process.env.VAT_RATE || 0.18)
const SHIPPING = Number(process.env.FLAT_SHIPPING || 2.5)

function orderNumber(){ const y=new Date().getFullYear(); const r=Math.random().toString(36).slice(2,6).toUpperCase(); return `PEGI-${y}-${r}` }

// Migrate on start
async function migrate(){
  await pool.query(readFileSync(path.join(__dirname,'../sql/001_schema.sql'), 'utf8'))
  // seed if no books
  const { rows } = await pool.query('SELECT COUNT(*)::int AS c FROM books')
  if (rows[0].c===0){
    await pool.query(readFileSync(path.join(__dirname,'../sql/002_seed.sql'), 'utf8'))
  }
}
migrate().catch(console.error)

// --- Public endpoints ---
app.get('/api/books', async (req,res)=>{
  const { q:qq='', category='', author='' } = req.query
  const rows = await q(`SELECT * FROM books WHERE
    (LOWER(title||' '||author||' '||category||' '||coalesce(isbn,'')) LIKE LOWER($1))
    AND ($2='' OR category=$2) AND ($3='' OR author=$3)
    ORDER BY id DESC`, [ `%${qq}%`, category, author ])
  res.json(rows)
})

app.post('/api/orders', async (req,res)=>{
  const { buyer, items, payment_method='card' } = req.body
  if (!buyer?.name || !buyer?.email || !buyer?.address || !Array.isArray(items) || items.length===0){
    return res.status(400).json({error:'Missing fields'})
  }
  // Find or create customer
  const cust = await q('INSERT INTO customers(name,email,phone,address) VALUES ($1,$2,$3,$4) ON CONFLICT(email) DO UPDATE SET name=EXCLUDED.name, phone=EXCLUDED.phone, address=EXCLUDED.address RETURNING id',
    [buyer.name, buyer.email, buyer.phone||null, buyer.address])
  const customer_id = cust[0].id

  // Totals
  let subtotal = 0
  for (const it of items){ subtotal += Number(it.price)*Number(it.qty) }
  const tax = subtotal * VAT
  const shipping = SHIPPING
  const total = subtotal + tax + shipping

  const order_number = orderNumber()
  const o = await q('INSERT INTO orders(order_number,customer_id,status,subtotal,tax,shipping,total,payment_method,payment_status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id',
    [order_number, customer_id, 'new', subtotal, tax, shipping, total, payment_method, payment_method==='card'?'pending':'cod'])

  const order_id = o[0].id
  for (const it of items){
    await q('INSERT INTO order_items(order_id,book_id,qty,price) VALUES($1,$2,$3,$4)',
      [order_id, it.id, it.qty, it.price])
    await q('UPDATE books SET stock = GREATEST(stock - $1,0) WHERE id=$2', [it.qty, it.id])
  }

  res.json({ id: order_id, order_number, total })
})

// --- Admin endpoints ---
app.get('/api/admin/orders', async (req,res)=>{
  const rows = await q(`SELECT o.id, o.order_number, o.created_at, o.status, o.total,
    c.name AS buyer_name, c.email AS buyer_email, c.address AS buyer_address
    FROM orders o JOIN customers c ON c.id=o.customer_id
    ORDER BY o.created_at DESC LIMIT 500`)
  res.json(rows)
})

app.put('/api/admin/orders/:id/status', async (req,res)=>{
  const { status } = req.body
  await q('UPDATE orders SET status=$1 WHERE id=$2', [status, req.params.id])
  res.json({ok:true})
})

app.get('/api/admin/orders/:id/invoice', async (req,res)=>{
  const id = req.params.id
  const o = (await q(`SELECT o.*, c.name, c.email, c.address FROM orders o JOIN customers c ON c.id=o.customer_id WHERE o.id=$1`, [id]))[0]
  if (!o) return res.status(404).send('Not found')
  const items = await q(`SELECT oi.*, b.title FROM order_items oi JOIN books b ON b.id=oi.book_id WHERE oi.order_id=$1`, [id])

  const doc = new PDFDocument({ size:'A4', margin: 40 })
  res.setHeader('Content-Type','application/pdf')
  res.setHeader('Content-Disposition', `inline; filename="invoice-${o.order_number}.pdf"`)
  doc.pipe(res)

  doc.fontSize(18).text('Pegi – Faturë', { align:'left' })
  doc.moveDown(0.2).fontSize(10)
  doc.text(process.env.SELLER_NAME||'Botime Pegi', { align:'right' })
  doc.text(process.env.SELLER_ADDRESS||'', { align:'right' })
  if (process.env.SELLER_EMAIL) doc.text(process.env.SELLER_EMAIL, { align:'right' })
  if (process.env.SELLER_PHONE) doc.text(process.env.SELLER_PHONE, { align:'right' })
  if (process.env.SELLER_FISCAL) doc.text('Nr. fiskal: '+process.env.SELLER_FISCAL, { align:'right' })

  doc.moveDown()
  doc.text(`Nr: ${o.order_number}`)
  doc.text(`Data: ${new Date(o.created_at).toLocaleDateString('sq-AL')}`)
  doc.text(`Blerësi: ${o.name}`)
  doc.text(`Email: ${o.email}`)
  doc.text(`Adresa: ${o.address}`)

  doc.moveDown()
  doc.font('Helvetica-Bold').text('Titulli', 40).text('Qty', 300).text('Çmimi', 350).text('Totali', 430)
  doc.moveDown(0.2).font('Helvetica')
  for (const it of items){
    doc.text(it.title, 40).text(String(it.qty), 300).text((+it.price).toFixed(2)+'€', 350).text((+it.price*it.qty).toFixed(2)+'€', 430)
  }

  doc.moveDown()
  doc.text('Nën‑totali: '+(+o.subtotal).toFixed(2)+'€', { align:'right' })
  doc.text('TVSH: '+(+o.tax).toFixed(2)+'€', { align:'right' })
  doc.text('Dërgesa: '+(+o.shipping).toFixed(2)+'€', { align:'right' })
  doc.font('Helvetica-Bold').text('Totali: '+(+o.total).toFixed(2)+'€', { align:'right' })
  doc.end()
})

app.listen(PORT, ()=>console.log('Backend on http://localhost:'+PORT))
app.get("/", (req, res) => {
  res.send("Pegi API është online ✅");
});

app.get("/health", (req, res) => {
  res.json({ status: "ok" });
});
