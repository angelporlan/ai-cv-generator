const {
  updateBillingForStripeCustomer
} = require('../../../auth-store');
const { STRIPE_WEBHOOK_SECRET } = require('../config');
const { readRawRequestBody } = require('../http/request');
const { sendJson } = require('../http/response');
const {
  getStripeClient,
  syncCheckoutSession
} = require('./billing');

function getCurrentPeriodEnd(subscription) {
  const rawPeriodEnd = subscription.current_period_end;
  return rawPeriodEnd ? new Date(rawPeriodEnd * 1000).toISOString() : null;
}

async function syncSubscription(subscription) {
  const customerId = typeof subscription.customer === 'string'
    ? subscription.customer
    : subscription.customer?.id;

  if (!customerId) {
    return;
  }

  await updateBillingForStripeCustomer(customerId, {
    stripeSubscriptionId: subscription.id,
    subscriptionStatus: subscription.status || 'none',
    plan: subscription.status === 'active' || subscription.status === 'trialing' ? 'pro' : 'free',
    currentPeriodEnd: getCurrentPeriodEnd(subscription)
  });
}

async function handleStripeWebhook(request, response) {
  const stripe = getStripeClient();

  if (!stripe || !STRIPE_WEBHOOK_SECRET) {
    return sendJson(response, 503, {
      ok: false,
      error: 'Stripe webhook is not configured'
    });
  }

  const signature = request.headers['stripe-signature'];
  const rawBody = await readRawRequestBody(request);
  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, STRIPE_WEBHOOK_SECRET);
  } catch (error) {
    return sendJson(response, 400, {
      ok: false,
      error: `Invalid Stripe webhook signature: ${error.message}`
    });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed':
        await syncCheckoutSession(event.data.object);
        break;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object);
        break;
      default:
        break;
    }

    return sendJson(response, 200, {
      ok: true,
      received: true
    });
  } catch (error) {
    return sendJson(response, 500, {
      ok: false,
      error: error.message || 'Could not process Stripe webhook'
    });
  }
}

module.exports = {
  handleStripeWebhook
};
