/** Validates environment variables once at startup and exposes typed config. */
const isProd = process.env.NODE_ENV === 'production';

function loadConfig() {
  const missing = ['MONGO_URI', 'JWT_SECRET'].filter((k) => !process.env[k]);
  if (missing.length) {
    throw new Error(`Missing required environment variable(s): ${missing.join(', ')}. See backend/.env.example`);
  }
  const secret = process.env.JWT_SECRET;
  if (isProd && (secret.length < 32 || /replace|change.?me|secret$/i.test(secret))) {
    throw new Error('JWT_SECRET must be a long random string (32+ chars) in production.');
  }
  if (!isProd && secret.length < 32) {
    console.warn('[config] JWT_SECRET is short. Generate one with: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"');
  }
  return {
    isProd,
    port: parseInt(process.env.PORT, 10) || 5000,
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    corsOrigins: (process.env.CORS_ORIGIN || '').split(',').map((s) => s.trim()).filter(Boolean),
    serveFrontend: process.env.SERVE_FRONTEND !== 'false',
    trustProxy: process.env.TRUST_PROXY ? Number(process.env.TRUST_PROXY) || process.env.TRUST_PROXY : 0,
  };
}

module.exports = loadConfig;
