const COD_PAYMENT_CODE = 'COD';
const CARD_PAYMENT_CODE = 'CARD';
const UPI_PAYMENT_CODE = 'UPI';
const LEGACY_RAZORPAY_PAYMENT_CODE = 'RAZORPAY';

const ONLINE_GATEWAY_PAYMENT_CODES = new Set([
    CARD_PAYMENT_CODE,
    UPI_PAYMENT_CODE,
    LEGACY_RAZORPAY_PAYMENT_CODE,
]);

const ONLINE_CHECKOUT_PAYMENT_CODES = new Set([
    CARD_PAYMENT_CODE,
    UPI_PAYMENT_CODE,
]);

const isOnlineGatewayPaymentCode = (code) =>
    ONLINE_GATEWAY_PAYMENT_CODES.has(String(code || '').toUpperCase());

const isOnlineCheckoutPaymentCode = (code) =>
    ONLINE_CHECKOUT_PAYMENT_CODES.has(String(code || '').toUpperCase());

module.exports = {
    COD_PAYMENT_CODE,
    CARD_PAYMENT_CODE,
    UPI_PAYMENT_CODE,
    LEGACY_RAZORPAY_PAYMENT_CODE,
    ONLINE_GATEWAY_PAYMENT_CODES,
    ONLINE_CHECKOUT_PAYMENT_CODES,
    isOnlineGatewayPaymentCode,
    isOnlineCheckoutPaymentCode,
};
