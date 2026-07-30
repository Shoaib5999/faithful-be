const { getStoreName } = require('../../config/store');

const storeName = () => getStoreName();

const formatOrderPaymentMethod = (order) =>
    order.paymentMode?.label ?? order.paymentMode?.code ?? order.paymentMethod ?? "N/A";

const baseLayout = (content) => `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <style>
    body { font-family: Georgia, 'Times New Roman', serif; background: #faf7f2; margin: 0; padding: 0; -webkit-text-size-adjust: 100%; }
    .container { max-width: 600px; margin: 30px auto; background: #ffffff; border-radius: 8px; overflow: hidden; border: 1px solid #d4b872; }
    .header { background: #ffffff; padding: 28px 32px 24px; text-align: center; border-bottom: 2px solid #c4a052; }
    .header h1 { margin: 0; font-size: 22px; font-weight: 600; letter-spacing: 3px; text-transform: uppercase; color: #9a7a3c; }
    .body { padding: 32px; color: #1a1a1a; line-height: 1.7; font-size: 15px; }
    .body h2 { margin: 0 0 16px; font-size: 20px; font-weight: 600; color: #1a1a1a; }
    .body p { margin: 0 0 14px; color: #1a1a1a; }
    .body strong { color: #1a1a1a; }
    .footer { background: #ffffff; padding: 18px 32px 24px; text-align: center; font-size: 12px; color: #5c5c5c; border-top: 1px solid #ede4d0; }
    .btn { display: inline-block; background: #c4a052; color: #1a1a1a !important; padding: 12px 28px; border-radius: 4px; text-decoration: none; font-weight: bold; margin-top: 16px; border: 1px solid #9a7a3c; }
    .order-box { background: #f7f0e4; border: 1px solid #d4b872; border-radius: 6px; padding: 16px 20px; margin: 20px 0; }
    .row { display: table; width: 100%; table-layout: fixed; border-bottom: 1px solid #ede4d0; }
    .row span { display: table-cell; padding: 8px 0; vertical-align: top; color: #1a1a1a; word-break: break-word; }
    .row span:last-child { text-align: right; white-space: nowrap; padding-left: 12px; }
    .row:last-child { border-bottom: none; font-weight: bold; }
    .badge { display: inline-block; background: #c4a052; color: #1a1a1a; padding: 4px 12px; border-radius: 20px; font-size: 13px; font-weight: 600; }
    .muted { margin-top: 20px; font-size: 13px; color: #5c5c5c; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${storeName()}</h1>
    </div>
    <div class="body">${content}</div>
    <div class="footer">
      &copy; ${new Date().getFullYear()} ${storeName()}. All rights reserved.<br/>
      ${process.env.STORE_EMAIL}
    </div>
  </div>
</body>
</html>
`;

const welcomeTemplate = ({ name }) =>
    baseLayout(`
    <h2>Welcome, ${name}</h2>
    <p>Thank you for creating an account at <strong>${storeName()}</strong>.</p>
    <p>Explore our exclusive collection of perfumes and attars crafted with passion.</p>
    <p>We look forward to serving you.</p>
  `);

const orderConfirmationTemplate = ({ name, order, orderNumber, trackUrl }) => {
    const publicOrderNumber =
        orderNumber ||
        String(order.id || '')
            .replace(/-/g, '')
            .slice(0, 8)
            .toUpperCase();

    const itemsHtml = order.items
        .map(
            (item) => `
      <div class="row">
        <span>${item.variant?.product?.name || 'Product'} (${item.variant?.weightGrams}g) × ${item.quantity}</span>
        <span>₹${(Number(item.priceAtPurchase) * item.quantity).toFixed(2)}</span>
      </div>`
        )
        .join('');

    const trackSection = trackUrl
        ? `<p style="margin-top:20px"><a href="${trackUrl}" class="btn">Track order</a></p>`
        : '';

    return baseLayout(`
    <h2>Order Confirmed</h2>
    <p>Hi ${name}, your order has been placed successfully.</p>
    <div class="order-box">
      <div class="row"><span>Order ID</span><span>#${publicOrderNumber}</span></div>
      <div class="row"><span>Payment Method</span><span>${formatOrderPaymentMethod(order)}</span></div>
      ${itemsHtml}
      <div class="row"><span>Subtotal</span><span>₹${order.subtotal}</span></div>
      ${Number(order.discount) > 0 ? `<div class="row"><span>Discount</span><span>-₹${order.discount}</span></div>` : ''}
      <div class="row"><span>Shipping</span><span>${Number(order.shippingCharge) === 0 ? 'Free' : '₹' + order.shippingCharge}</span></div>
      <div class="row"><span>Total</span><span>₹${order.total}</span></div>
    </div>
    <p>We'll notify you once your order is shipped.</p>
    ${trackSection}
  `);
};

const orderStatusTemplate = ({
    name,
    order,
    orderNumber,
    status,
    trackingUrl,
    storeTrackUrl,
    awbCode,
    courierName,
}) => {
    const publicOrderNumber =
        orderNumber ||
        String(order.id || '')
            .replace(/-/g, '')
            .slice(0, 8)
            .toUpperCase();

    const statusMessages = {
        CONFIRMED: { title: 'Order Confirmed', text: 'Your order has been confirmed and is being prepared.' },
        PROCESSING: { title: 'Order Processing', text: 'Your order is being processed and packed.' },
        SHIPPED: { title: 'Order Shipped', text: 'Your order has been shipped.' },
        DELIVERED: { title: 'Order Delivered', text: 'Your order has been delivered.' },
        CANCELLED: { title: 'Order Cancelled', text: 'Your order has been cancelled.' },
        RETURNED: { title: 'Return Initiated', text: 'Your return has been initiated.' },
    };

    const msg = statusMessages[status] || { title: 'Order Update', text: 'Your order status has been updated.' };

    const courierSection =
        status === 'SHIPPED' && trackingUrl
            ? `
      <div class="order-box">
        <p><strong>Courier:</strong> ${courierName || 'N/A'}</p>
        <p><strong>AWB Code:</strong> ${awbCode || 'N/A'}</p>
        <a href="${trackingUrl}" class="btn">Track shipment</a>
      </div>`
            : '';

    const storeTrackSection = storeTrackUrl
        ? `<p style="margin-top:16px"><a href="${storeTrackUrl}" class="btn">Track order</a></p>`
        : '';

    return baseLayout(`
    <h2>${msg.title}</h2>
    <p>Hi ${name},</p>
    <p>${msg.text}</p>
    <div class="order-box">
      <div class="row"><span>Order ID</span><span>#${publicOrderNumber}</span></div>
      <div class="row"><span>Status</span><span><span class="badge">${status}</span></span></div>
    </div>
    ${courierSection}
    ${storeTrackSection}
  `);
};

const passwordResetTemplate = ({ name, resetLink }) =>
    baseLayout(`
    <h2>Password Reset Request</h2>
    <p>Hi ${name}, we received a request to reset your password.</p>
    <p>Click the button below to reset it. This link expires in 1 hour.</p>
    <a href="${resetLink}" class="btn">Reset Password</a>
    <p class="muted">If you didn't request this, please ignore this email.</p>
  `);

const contactFormTemplate = ({ name, email, subject, message }) =>
    baseLayout(`
    <h2>New contact message</h2>
    <div class="order-box">
      <div class="row"><span>Name</span><span>${name}</span></div>
      <div class="row"><span>Email</span><span>${email}</span></div>
      <div class="row"><span>Subject</span><span>${subject}</span></div>
    </div>
    <p><strong>Message</strong></p>
    <p style="white-space: pre-wrap;">${message}</p>
  `);

const contactAutoReplyTemplate = ({ name }) =>
    baseLayout(`
    <h2>Thank you for contacting us</h2>
    <p>Hi ${name},</p>
    <p>We received your message and will get back to you within two working days.</p>
    <p>— ${storeName()}</p>
  `);

const newsletterWelcomeTemplate = ({ email }) =>
    baseLayout(`
    <h2>Welcome to our newsletter</h2>
    <p>Thank you for subscribing with <strong>${email}</strong>.</p>
    <p>You will be the first to hear about fresh cuts, offers, and stories from the shop.</p>
  `);

const refundProcessedTemplate = ({ name, order, amount, reason }) =>
    baseLayout(`
    <h2>Refund processed</h2>
    <p>Hi ${name},</p>
    <p>We have initiated a refund of <strong>₹${Number(amount).toLocaleString('en-IN')}</strong> for your order.</p>
    <div class="order-box">
      <div class="row"><span>Order ID</span><span>#${order.id.slice(0, 8).toUpperCase()}</span></div>
      <div class="row"><span>Reason</span><span>${reason || 'Order refund'}</span></div>
    </div>
    <p>The amount is usually credited back to your original payment method within 5–7 business days.</p>
  `);

const emailVerificationTemplate = ({ name, verifyLink }) =>
    baseLayout(`
    <h2>Verify your email</h2>
    <p>Hi ${name},</p>
    <p>Thanks for signing up at <strong>${storeName()}</strong>. Please confirm your email address to activate your account.</p>
    <a href="${verifyLink}" class="btn">Verify email</a>
    <p class="muted">This link expires in 24 hours. If you did not create an account, you can ignore this email.</p>
  `);

module.exports = {
    welcomeTemplate,
    emailVerificationTemplate,
    orderConfirmationTemplate,
    orderStatusTemplate,
    passwordResetTemplate,
    contactFormTemplate,
    contactAutoReplyTemplate,
    newsletterWelcomeTemplate,
    refundProcessedTemplate,
};