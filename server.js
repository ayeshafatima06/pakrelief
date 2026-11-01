import express from 'express';
import Stripe from 'stripe';
import cors from 'cors';
import dotenv from 'dotenv';

// Load environment variables from .env
dotenv.config();

const app = express();

// Configuration
const PORT = process.env.PORT || 3000;
const STRIPE_SECRET_KEY = process.env.STRIPE_SECRET_KEY || 'sk_test_YOUR_STRIPE_SECRET_KEY';
const STRIPE_WEBHOOK_SECRET = process.env.STRIPE_WEBHOOK_SECRET || '';

// Initialize Stripe client
const stripe = new Stripe(STRIPE_SECRET_KEY, {
  apiVersion: '2024-12-18.acacia' as any
});

// Enable CORS for frontend requests (Vite, React, mobile, or external clients)
app.use(cors({
  origin: true,
  credentials: true
}));

// ============================================================================
// 1. CRITICAL: STRIPE WEBHOOK HANDLER
// Must be registered BEFORE express.json() so express.raw() can capture the raw Buffer
// ============================================================================
const webhookHandler = async (req: express.Request, res: express.Response) => {
  const sig = req.headers['stripe-signature'] as string;
  let event: Stripe.Event;

  try {
    if (STRIPE_WEBHOOK_SECRET && sig) {
      // Production & Stripe CLI secure signature verification
      event = stripe.webhooks.constructEvent(req.body, sig, STRIPE_WEBHOOK_SECRET);
      console.log(`🔐 [STRIPE WEBHOOK] Signature verified successfully.`);
    } else {
      // Sandbox fallback: express.raw produces a Buffer, so decode to UTF-8 before JSON.parse
      const rawString = Buffer.isBuffer(req.body) ? req.body.toString('utf8') : req.body;
      event = typeof rawString === 'string' ? JSON.parse(rawString) : rawString;
      console.warn('⚠️ [STRIPE WEBHOOK] Parsed without signature verification (Sandbox mode). For production, set STRIPE_WEBHOOK_SECRET.');
    }
  } catch (err: any) {
    console.error(`❌ Webhook Error: ${err.message}`);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle specific Stripe event types
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      
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

      // 🚀 Place your business logic here:
      // - Update order status to 'Paid' in your database
      // - Dispatch relief supplies or send confirmation receipts
      break;
    }

    case 'payment_intent.succeeded': {
      const paymentIntent = event.data.object as Stripe.PaymentIntent;
      console.log(`💳 [PAYMENT INTENT] Succeeded: ${paymentIntent.id} (${(paymentIntent.amount / 100).toFixed(2)} ${paymentIntent.currency.toUpperCase()})`);
      break;
    }

    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      console.log(`⏳ [SESSION EXPIRED] Checkout session ${session.id} expired.`);
      break;
    }

    default:
      console.log(`ℹ️ [STRIPE EVENT] Received unhandled event type: ${event.type}`);
  }

  // Acknowledge receipt of the webhook to Stripe
  res.status(200).json({ received: true });
};

// Register webhook on both /webhook and /api/webhook for flexibility
app.post('/webhook', express.raw({ type: 'application/json' }), webhookHandler);
app.post('/api/webhook', express.raw({ type: 'application/json' }), webhookHandler);

// ============================================================================
// 2. STANDARD JSON BODY PARSER FOR ALL OTHER API ENDPOINTS
// ============================================================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health & Status Endpoint
app.get('/api/health', (req, res) => {
  const isKeyPlaceholder = !STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.includes('YOUR_STRIPE_SECRET_KEY') || STRIPE_SECRET_KEY.length < 20;
  res.json({
    status: 'online',
    service: 'Stripe Sandbox Payment API',
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
    // Check if key is still unconfigured
    if (!STRIPE_SECRET_KEY || STRIPE_SECRET_KEY.includes('YOUR_STRIPE_SECRET_KEY') || STRIPE_SECRET_KEY.length < 20) {
      return res.status(500).json({
        success: false,
        error: 'Stripe Secret Key is not configured. Please set STRIPE_SECRET_KEY in your .env file.'
      });
    }

    // Extract dynamic fields with safe fallbacks
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

    // Determine the base client URL dynamically
    const origin = req.headers.origin || req.headers.referer || `http://localhost:${PORT}`;
    const cleanOrigin = Array.isArray(origin) ? origin[0] : origin.replace(/\/$/, '');

    // Properly formatted success & cancel URLs
    const finalSuccessUrl = successUrl || `${cleanOrigin}/success?session_id={CHECKOUT_SESSION_ID}`;
    const finalCancelUrl = cancelUrl || `${cleanOrigin}/cancel`;

    // Stripe expects amounts in the smallest currency unit (cents/paise)
    // For PKR, USD, EUR, etc. multiply by 100
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

    // Return the checkout URL and session ID to the front-end
    return res.status(200).json({ 
      success: true, 
      checkout_url: session.url,
      session_id: session.id
    });
    
  } catch (error: any) {
    console.error('❌ Failed to create checkout session:', error);
    return res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Start the local development server if executed directly
app.listen(PORT, () => {
  console.log(`🚀 Stripe Test API running on http://localhost:${PORT}`);
  console.log(`📍 Webhook endpoint: http://localhost:${PORT}/webhook`);
  console.log(`💳 Checkout endpoint: POST http://localhost:${PORT}/api/create-test-checkout`);
});

export default app;
