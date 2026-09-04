import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import mongoSanitize from 'express-mongo-sanitize';
import { env } from './config/env.js';
import routes from './routes/index.js';
import webhookRoutes from "./routes/webhook.route.js";
import docsRoutes from './routes/docs.routes.js';
import { globalLimiter } from './middleware/rateLimit.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const app = express();

// --- Security & parsing middleware ---
// Order matters here: helmet/cors before anything that touches the body or session.
app.use(helmet());
app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  })
);

// --- Stripe webhook: MUST be mounted before express.json(), with express.raw() instead ---
// This was flagged back in Stage 1 as a landmine to watch for, and this is that moment.
// Stripe signs the exact raw bytes of the request body; if express.json() parses the body
// into an object first, constructEvent() has nothing authentic left to verify against and
// signature verification fails. Mounting this route (and ONLY this route) with express.raw()
// here, ahead of the global express.json() below, is what makes verification possible.
// This is also why webhook.routes.ts is imported and mounted directly here instead of going
// through the shared routes/index.ts router — that router sits behind express.json().
app.use('/api/v1/webhooks', express.raw({ type: 'application/json' }), webhookRoutes);

// Middleware to set query property.
app.use((req, res, next) => {
    Object.defineProperty(req, 'query', {
        value: { ...req.query },
        writable: true,
        configurable: true,
        enumerable: true
    });
    next();
});

// NOTE: the Stripe webhook route (built in Stage 6) MUST receive the raw request body to
// verify the signature — it needs to be mounted with express.raw() BEFORE this express.json()
// middleware runs, or signature verification will fail.
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));
app.use(cookieParser());

// Strips any request key starting with '$' or containing '.' from body/params/query —
// defense-in-depth against NoSQL operator injection (e.g. a client sending
// { "email": { "$gt": "" } } instead of a plain string to bypass query logic). In practice,
// Zod already blocks this for every validated field in this codebase (z.string() rejects a
// plain object outright, and validate() overwrites req.body/query/params with the parsed,
// type-safe result before a controller ever sees it) — this is a deliberate belt-and-braces
// layer in case a future endpoint is ever added without validate() wired up correctly, not
// a fix for a found vulnerability.
app.use(mongoSanitize());

if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
}

// --- Routes ---
app.use('/api/v1', globalLimiter, routes);

// Mounted OUTSIDE /api/v1 deliberately — API documentation is meta-content about the API,
// not a versioned API resource itself, so it's exempt from globalLimiter too (appropriate
// for a docs page nobody should ever need to rate-limit).
app.use('/docs', docsRoutes);

// --- Error handling (must be last) ---
app.use(notFound);
app.use(errorHandler);

export default app;