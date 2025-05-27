const express = require('express');
const crypto = require('crypto');
const cors = require('cors');
const fetch = require('node-fetch');
const app = express();
const port = 3000;

app.use(cors());

// In-memory fake DB
const orders = {
  '1001': { amount: 9000.00, currency: 'COP', description: 'Product 1' },
  '1002': { amount: 15000.50, currency: 'COP', description: 'Product 2' }
};

const INTEGRITY_KEY = 'prod_integrity_czf9lmtFTgQqvzDGx9KWOsbEYXvgYHik'; // <--- your real integrity key!
const PUBLIC_KEY = 'pub_prod_bKfXqpYwOA5GRdoZKOUoDFlnqcev5rvh'; // <--- your real public key!

// Serve HTML payment page securely
app.get('/pagar', (req, res) => {
  const { pedido } = req.query;
  const order = orders[pedido];
  if (!order) return res.status(404).send('<h2>Orden no encontrada.</h2>');
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
      <head>
        <meta charset="UTF-8" />
        <title>Pagar Pedido</title>
        <script src="https://checkout.wompi.co/widget.js"></script>
        <style>
          body { font-family: Arial, sans-serif; text-align: center; padding: 50px; background: #f9f9f9;}
          .spinner {margin: 40px auto; width: 50px; height: 50px; border: 5px solid #ccc; border-top-color: #007bff; border-radius: 50%; animation: spin 1s linear infinite;}
          @keyframes spin { to { transform: rotate(360deg); } }
          #pay-button { margin-top: 30px; padding: 15px 30px; font-size: 18px; background-color: #007bff; color: white; border: none; border-radius: 8px; cursor: pointer; display: none;}
        </style>
      </head>
      <body>
        <h1>Procesando tu pago...</h1>
        <div class="spinner"></div>
        <button id="pay-button">Iniciar pago</button>
        <script>
          (async () => {
            // Get payment details securely from backend endpoint
            const resp = await fetch('/api/order?pedido=${pedido}');
            const data = await resp.json();
            if (data.error) {
              document.body.innerHTML = '<h2>Ocurrió un error: ' + data.error + '</h2>';
              return;
            }
            const { amountInCents, reference, currency, description, signature, publicKey } = data;

            window.checkoutInstance = new WidgetCheckout({
              currency: currency,
              amountInCents: amountInCents,
              reference: reference,
              publicKey: publicKey,
              signature: { integrity: signature },
              redirectUrl: "http://localhost:3000/confirmacion"
            });

            document.getElementById("pay-button").style.display = "inline-block";
            document.querySelector(".spinner").style.display = "none";
            document.querySelector("h1").textContent = "¡Listo para pagar!";

          })();

          document.getElementById("pay-button").addEventListener("click", function () {
            if (window.checkoutInstance) {
              window.checkoutInstance.open(function (result) {
                if (result.transaction && result.transaction.id) {
                  window.location.href = "/confirmacion?id=" + result.transaction.id;
                } else {
                  alert("Ocurrió un error al procesar el pago. Intenta nuevamente.");
                }
              });
            }
          });
        </script>
      </body>
    </html>
  `);
});

// Secure API: returns all info for Widget (amount, signature, etc.)
app.get('/api/order', (req, res) => {
  const { pedido } = req.query;
  const order = orders[pedido];
  if (!order) return res.json({ error: 'Orden no encontrada.' });

  const amountInCents = Math.round(order.amount * 100);
  const currency = order.currency;
  const reference = `pedido-${pedido}`;
  const textToSign = `${reference}${amountInCents}${currency}${INTEGRITY_KEY}`;
  const hash = crypto.createHash('sha256').update(textToSign).digest('hex');

  res.json({
    amountInCents,
    reference,
    currency,
    description: order.description,
    signature: hash,
    publicKey: PUBLIC_KEY
  });
});

// Confirmation (with Wompi verification!)
app.get('/confirmacion', async (req, res) => {
  const { id } = req.query;
  if (!id) return res.send('<h2>Transacción no encontrada</h2>');

  // Lookup transaction in Wompi API
  try {
    const wompiRes = await fetch(`https://production.wompi.co/v1/transactions/${id}`);
    const wompiData = await wompiRes.json();
    if (wompiData && wompiData.data) {
      const tx = wompiData.data;
      const html = `
        <h2>Resultado del Pago</h2>
        <p><b>ID Transacción:</b> ${tx.id}</p>
        <p><b>Referencia:</b> ${tx.reference}</p>
        <p><b>Estado:</b> ${tx.status}</p>
        <p><b>Monto pagado:</b> ${(tx.amount_in_cents / 100).toFixed(2)} ${tx.currency}</p>
        <a href="/">Volver al inicio</a>
      `;
      res.send(html);
    } else {
      res.send('<h2>No se pudo verificar el pago con Wompi.</h2>');
    }
  } catch (err) {
    res.send('<h2>Error al consultar Wompi: ' + err.message + '</h2>');
  }
});

// Home page for quick links
app.get('/', (req, res) => {
  res.send(`
    <h1>Demo de Pagos Wompi (Widget Seguro)</h1>
    <ul>
      <li><a href="/pagar?pedido=1001">Pagar Pedido 1001</a></li>
      <li><a href="/pagar?pedido=1002">Pagar Pedido 1002</a></li>
    </ul>
  `);
});

app.listen(port, () => {
  console.log(`Servidor iniciado en http://localhost:${port}`);
});
