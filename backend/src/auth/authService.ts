import crypto from 'node:crypto';
import type { Context, Next } from 'hono';

const ZENBOX_PASSWORD = process.env.ZENBOX_PASSWORD || '';
const JWT_SECRET = process.env.ZENBOX_SECRET || crypto.randomBytes(32).toString('hex');

export class AuthService {
  /**
   * Whether global authentication is actively required
   */
  public static isAuthRequired(): boolean {
    return Boolean(ZENBOX_PASSWORD && ZENBOX_PASSWORD.trim().length > 0);
  }

  /**
   * Secure timing-safe password validation
   */
  public static validatePassword(inputPassword: string): boolean {
    if (!this.isAuthRequired()) return true;
    if (!inputPassword) return false;

    const inputBuffer = Buffer.from(inputPassword);
    const targetBuffer = Buffer.from(ZENBOX_PASSWORD);

    if (inputBuffer.length !== targetBuffer.length) {
      return false;
    }
    return crypto.timingSafeEqual(inputBuffer, targetBuffer);
  }

  /**
   * Generates a signed authentication token with expiration (7 days)
   */
  public static generateToken(): string {
    const payload = {
      role: 'admin',
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000
    };
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(encodedPayload)
      .digest('base64url');
    return `${encodedPayload}.${signature}`;
  }

  /**
   * Validates a signed authentication token
   */
  public static verifyToken(token: string): boolean {
    if (!this.isAuthRequired()) return true;
    if (!token) return false;

    const parts = token.split('.');
    if (parts.length !== 2) return false;

    const [encodedPayload, receivedSignature] = parts;
    const expectedSignature = crypto
      .createHmac('sha256', JWT_SECRET)
      .update(encodedPayload)
      .digest('base64url');

    if (receivedSignature !== expectedSignature) {
      return false;
    }

    try {
      const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf-8'));
      if (typeof payload.exp === 'number' && Date.now() > payload.exp) {
        return false;
      }
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Hono middleware for route authentication
   */
  public static middleware() {
    return async (c: Context, next: Next) => {
      if (!this.isAuthRequired()) {
        return next();
      }

      // Public endpoints that bypass authentication
      const path = c.req.path;
      if (
        path === '/api/auth/status' ||
        path === '/api/auth/login' ||
        path === '/api/health'
      ) {
        return next();
      }

      // Extract token from Bearer header or cookie
      const authHeader = c.req.header('authorization');
      let token = '';
      if (authHeader && authHeader.startsWith('Bearer ')) {
        token = authHeader.substring(7).trim();
      } else {
        const cookie = c.req.header('cookie');
        if (cookie) {
          const match = cookie.match(/zenbox_token=([^;]+)/);
          if (match) token = match[1];
        }
      }

      if (!token || !this.verifyToken(token)) {
        return c.json({ error: 'Unauthorized', message: '需要全局密碼驗證' }, 401);
      }

      return next();
    };
  }
}
