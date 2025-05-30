require('dotenv').config();
const express = require('express');
const fetch   = require('node-fetch');
const crypto  = require('crypto');
const path    = require('path');

const app = express();
const {
  PORT = 3000,
  WOMPI_PUBLIC_KEY,
  WOMPI_PRIVATE_KEY,
  WOMPI_WEBHOOK_SECRET
} = process.env;

// Serve static front‑end
app.use(express.static(path.join(__dirname, 'public')));

// JSON parsing for API
app.use(express.json());

// 1) Public config endpoint
app.get('/config', (req, res) => {
  res.json({ publicKey: WOMPI_PUBLIC_KEY });
});

// 2) Example: Create a payment link via server
app.post('/api/create-payment-link', async (req, res) => {
  const { name, description, amount } = req.body;
  try {
    const response = await fetch('https://production.wompi.co/v1/payment_links', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${WOMPI_PRIVATE_KEY}`,
        'Content-Type':  'application/json'
      },
      body: JSON.stringify({
        name,
        description,
        currency:        'COP',
        amount_in_cents: amount || null,
        single_use:      false,
        collect_shipping: false
      })
    });
    const data = await response.json();
    res.status(response.ok ? 200 : 400).json(data);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// 3) Webhook receiver (raw body + signature)
app.post('/webhook', express.raw({ type: '*/*' }), (req, res) => {
  const signature = req.headers['x-event-checksum'];
  const computed  = crypto
    .createHmac('sha256', WOMPI_WEBHOOK_SECRET)
    .update(req.body)
    .digest('hex');

  if (computed !== signature) {
    console.warn('🔒 Invalid webhook signature');
    return res.status(401).send('Invalid signature');
  }

  const event = JSON.parse(req.body);
  console.log('✅ Webhook received:', event.event, event.data);
  res.status(200).end();
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Server listening on http://localhost:${PORT}`);
});
