// src/middleware/securityHeaders.ts
import { secureHeaders } from 'hono/secure-headers';

/**
 * Security headers middleware using Hono's built-in secureHeaders.
 *
 * Sets the following response headers:
 *  - X-Frame-Options: DENY
 *  - X-Content-Type-Options: nosniff
 *  - Strict-Transport-Security (HSTS) in production
 *  - X-XSS-Protection: 0 (modern CSP replaces this)
 *  - Referrer-Policy: strict-origin-when-cross-origin
 *  - X-Permitted-Cross-Domain-Policies: none
 *  - X-Download-Options: noopen
 *  - Content-Security-Policy: default-src 'self'
 *  - Permissions-Policy: camera=(), microphone=(), geolocation=()
 */
export const securityHeadersMiddleware = secureHeaders({
    xFrameOptions: 'DENY',
    xXssProtection: '0',
    xContentTypeOptions: 'nosniff',
    referrerPolicy: 'strict-origin-when-cross-origin',
    xPermittedCrossDomainPolicies: 'none',
    xDownloadOptions: 'noopen',
    strictTransportSecurity: 'max-age=63072000; includeSubDomains; preload',
    contentSecurityPolicy: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'"],
        imgSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameSrc: ["'none'"],
        baseUri: ["'self'"],
        formAction: ["'self'"],
    },
    permissionsPolicy: {
        camera: [],
        microphone: [],
        geolocation: [],
        payment: [],
    },
});
