import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import routes from './routes/index.js';
import webhookRoutes from "./routes/webhook.route.js";
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

// NOTE: the Stripe webhook route (built in Stage 6) MUST receive the raw request body to
// verify the signature — it needs to be mounted with express.raw() BEFORE this express.json()
// middleware runs, or signature verification will fail.
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(cookieParser());

if (env.NODE_ENV !== 'test') {
  app.use(morgan(env.NODE_ENV === 'development' ? 'dev' : 'combined'));
}

// --- Routes ---
app.use('/api/v1', routes);

// --- Error handling (must be last) ---
app.use(notFound);
app.use(errorHandler);

export default app;