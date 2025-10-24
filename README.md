# Pegi – Backend (MVP)
## Si të niset lokalisht
1) Instaloni Docker (opsionale) ose PostgreSQL lokalisht.
2) (Opsioni i shpejtë) Nisni DB me Docker:
   ```bash
   docker compose up -d
   ```
3) Krijoni `.env` nga `.env.example` dhe plotësoni `DATABASE_URL` dhe `PORT` nëse duhet.
4) Instaloni varësitë dhe startoni:
   ```bash
   npm install
   npm run dev
   ```
5) Endpoints kryesore:
   - GET `/api/books`
   - POST `/api/orders`
   - GET `/api/admin/orders`
   - PUT `/api/admin/orders/:id/status`
   - GET `/api/admin/orders/:id/invoice`

Për pagesat me Stripe, vendosni `STRIPE_SECRET_KEY` (mund të përdoren test keys).
