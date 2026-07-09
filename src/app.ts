import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import cookieParser from 'cookie-parser';
import { env } from './config/env.js';
import routes from './routes/index.js';
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