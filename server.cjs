const express = require('express');
const Stripe = require('stripe');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_YOUR_STRIPE_SECRET_KEY';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Initialize Stripe client
const stripe = new Stripe(STRIPE_SECRET_KEY);

// Enable CORS
app.use(cors({ origin: true, credentials: true }));

// ============================================================================
// 1. CRITICAL: STRIPE WEBHOOK HANDLER
// Must be registered BEFORE express.json() so express.raw() can capture the raw Buffer
// ============================================================================
const webhookHandler = async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    if (STRIPE_WEBHOOK_SECRET && sig) {
      // Production & Stripe CLI secure signature verification
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
      console.log('🔐 [STRIPE WEBHOOK] Signature verified successfully.');
    } else {
      // Sandbox fallback: express.raw produces a Buffer, so decode to UTF-8 before JSON.parse
      const rawString = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
      event = typeof rawString === 'string' ? JSON.parse(rawString) : rawString;
      console.warn('⚠️ [STRIPE WEBHOOK] Parsed without signature verification (Sandbox mode). For production, set STRIPE_WEBHOOK_SECRET.');
    }
  } catch (err) {
    console.error(`❌ Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle specific Stripe event types
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    
    const currency = (session.currency || 'pkr').toUpperCase();
    const amountTotal = session.amount_total != null ? (session.amount_total / 100).toFixed(2) : '0.00';
    // Safe optional chaining prevents crashes if customer_details is null
    const customerEmail = session.customer_details?.email || session.customer_email || 'Not provided';
    const customerName = session.customer_details?.name || 'Anonymous Donor/Customer';

    console.log('💰 [SUCCESS] Simulated payment received!');
    console.log(`   - Transaction ID : ${session.id}`);
    console.log(`   - Payment Status : ${session.payment_status}`);
    console.log(`   - Amount         : ${amountTotal} ${currency}`);
    console.log(`   - Customer Email : ${customerEmail}`);
    console.log(`   - Customer Name  : ${customerName}`);

    // 🚀 Place your database write / notification trigger here
  }

  res.status(200).json({ received: true });
};

// Register webhook endpoint before express.json()
app.post('/webhook', express.raw({ type: 'application/json' }), webhookHandler);
app.post('/api/webhook', express.raw({ type: 'application/json' }), webhookHandler);

// ============================================================================
// 2. STANDARD JSON BODY PARSER FOR ALL OTHER API ENDPOINTS
// ============================================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check
app.get('/api/health', (req, res) => {
  const isKeyPlaceholder = STRIPE_SECRET_KEY.includes('YOUR_STRIPE_SECRET_KEY');
  res.json({
    status: 'online',
    service: 'Stripe Sandbox Payment API (CommonJS)',
    stripeConfigured: !isKeyPlaceholder,
    port: PORT,
    timestamp: new Date().toISOString()
  });
});

// ============================================================================
// 3. CREATE CHECKOUT SESSION ENDPOINT
// ============================================================================
app.post('/api/create-test-checkout', async (req, res) => {
  try {
    if (STRIPE_SECRET_KEY.includes('YOUR_STRIPE_SECRET_KEY')) {
      return res.status(500).json({
        success: false,
        error: 'Stripe Secret Key is not configured. Please set STRIPE_SECRET_KEY in your .env file.'
      });
    }

    const {
      amount = 1500, // Default 1500 PKR
      currency = 'pkr',
      name = 'App Sandbox Test Item',
      description = 'Testing complete app integration workflow',
      customerEmail,
      metadata = {},
      successUrl,
      cancelUrl
    } = req.body || {};

    // Dynamic origin fallback
    const origin = req.headers.origin || req.headers.referer || `http://localhost:${PORT}`;
    const cleanOrigin = Array.isArray(origin) ? origin[0] : origin.replace(/\/$/, '');

    // Fixed success & cancel URLs with proper query parameters
    const finalSuccessUrl = successUrl || `${cleanOrigin}/success?session_id={CHECKOUT_SESSION_ID}`;
    const finalCancelUrl = cancelUrl || `${cleanOrigin}/cancel`;

    // Stripe expects amount in smallest currency unit (e.g. cents/paise)
    const unitAmount = Math.round(Number(amount) * 100);

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: String(name),
              description: String(description),
            },
            unit_amount: unitAmount,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      customer_email: customerEmail || undefined,
      metadata: {
        integration: 'sandbox_test',
        ...metadata
      },
      success_url: finalSuccessUrl,
      cancel_url: finalCancelUrl,
    });

    console.log(`🔗 Created Stripe Checkout Session: ${session.id} (${amount} ${currency.toUpperCase()})`);

    res.status(200).json({ 
      success: true, 
      checkout_url: session.url,
      session_id: session.id
    });
    
  } catch (error) {
    console.error('❌ Failed to create checkout session:', error);
    res.status(500).json({ success: false, error: error.message });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 Stripe Test API running on http://localhost:${PORT}`);
  console.log(`📍 Webhook: POST http://localhost:${PORT}/webhook`);
  console.log(`💳 Checkout: POST http://localhost:${PORT}/api/create-test-checkout`);
});

module.exports = app;
