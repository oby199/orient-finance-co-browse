/**
 * Orient Finance Co-Browse — Brand & WebRTC Configuration
 * BASE_URL / CUSTOMER_APP_BASE_URL: Base URL for client links. Leave empty to use current origin.
 * CONNECT_PATH: Path for connect page (default /connect)
 * STUN_URLS: Array of STUN server URLs (default: Google STUN)
 * TURN_URLS, TURN_USER, TURN_PASS: Optional TURN config for NAT traversal
 */
window.OrientFinanceConfig = {
  BRAND_NAME: "Orient Finance Broker",
  PRODUCT_NAME: "Orient Finance Co-Browse",
  LOGO_PATH: "/static/orient-finance-logo.png",
  TAGLINE: "Secure screen sharing with your Sales Relationship Manager",
  BASE_URL: "",
  CUSTOMER_APP_BASE_URL: "",
  CONNECT_PATH: "/connect",
  STUN_URLS: ["stun:stun1.l.google.com:19302", "stun:stun2.l.google.com:19302"],
  TURN_URLS: [],
  TURN_USER: "",
  TURN_PASS: "",
};
