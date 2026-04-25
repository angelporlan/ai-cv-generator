const Stripe = require('stripe');
const {
  getUserBilling,
  saveStripeCustomerId,
  updateBillingForUser
} = require('../../../auth-store');
const {
  APP_BASE_URL,
  STRIPE_PRICE_ID,
  STRIPE_SECRET_KEY
} = require('../config');
const { sendJson } = require('../http/response');
const { getAuthenticatedUser } = require('../http/session');

let stripeClient;

function getStripeClient() {
  if (!STRIPE_SECRET_KEY) {
    return null;
  }

  if (!stripeClient) {
    stripeClient = new Stripe(STRIPE_SECRET_KEY);
  }

  return stripeClient;
}

function ensureBillingConfig(response) {
  if (!STRIPE_SECRET_KEY || !STRIPE_PRICE_ID) {
    sendJson(response, 503, {
      ok: false,
      error: 'Stripe billing is not configured'
    });
    return false;
  }

  return true;
}

async function getOrCreateStripeCustomer(stripe, user) {
  const billing = await getUserBilling(user.id);

  if (billing.stripeCustomerId) {
    return billing.stripeCustomerId;
  }

  const customer = await stripe.customers.create({
    email: user.email,
    metadata: {
      userId: String(user.id)
    }
  });

  await saveStripeCustomerId(user.id, customer.id);
  return customer.id;
}

async function handleBillingCheckout(request, response) {
  const authSession = await getAuthenticatedUser(request);

  if (!authSession) {
    return sendJson(response, 401, {
      ok: false,
      requiresAuth: true,
      error: 'Authentication required to subscribe'
    });
  }

  if (!ensureBillingConfig(response)) {
    return;
  }

  try {
    const stripe = getStripeClient();
    const customerId = await getOrCreateStripeCustomer(stripe, authSession.user);
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      client_reference_id: String(authSession.user.id),
      metadata: {
        userId: String(authSession.user.id),
        plan: 'pro'
      },
      line_items: [
        {
          price: STRIPE_PRICE_ID,
          quantity: 1
        }
      ],
      success_url: `${APP_BASE_URL}/?billing=success`,
      cancel_url: `${APP_BASE_URL}/?billing=cancel`
    });

    return sendJson(response, 200, {
      ok: true,
      url: session.url
    });
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      error: error.message || 'Could not create Stripe Checkout session'
    });
  }
}

async function handleBillingPortal(request, response) {
  const authSession = await getAuthenticatedUser(request);

  if (!authSession) {
    return sendJson(response, 401, {
      ok: false,
      requiresAuth: true,
      error: 'Authentication required to manage billing'
    });
  }

  if (!STRIPE_SECRET_KEY) {
    return sendJson(response, 503, {
      ok: false,
      error: 'Stripe billing is not configured'
    });
  }

  try {
    const stripe = getStripeClient();
    const customerId = await getOrCreateStripeCustomer(stripe, authSession.user);
    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: APP_BASE_URL
    });

    return sendJson(response, 200, {
      ok: true,
      url: session.url
    });
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      error: error.message || 'Could not create Stripe Billing Portal session'
    });
  }
}

async function syncCheckoutSession(session) {
  const userId = session.client_reference_id || session.metadata?.userId;

  if (!userId || !session.customer) {
    return;
  }

  let subscriptionStatus = 'none';
  let currentPeriodEnd = null;
  let subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id;

  if (subscriptionId) {
    const stripe = getStripeClient();
    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
    subscriptionStatus = subscription.status || subscriptionStatus;
    currentPeriodEnd = subscription.current_period_end
      ? new Date(subscription.current_period_end * 1000).toISOString()
      : null;
  }

  await updateBillingForUser(userId, {
    stripeCustomerId: typeof session.customer === 'string' ? session.customer : session.customer.id,
    stripeSubscriptionId: subscriptionId || null,
    subscriptionStatus,
    plan: subscriptionStatus === 'none' ? 'free' : 'pro',
    currentPeriodEnd
  });
}

module.exports = {
  getStripeClient,
  handleBillingCheckout,
  handleBillingPortal,
  syncCheckoutSession
};
