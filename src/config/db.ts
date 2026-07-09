import mongoose from 'mongoose';
import { env } from './env.js';

export async function connectDB(): Promise<void> {
  mongoose.connection.on('error', (err) => {
    console.error('MongoDB connection error:', err);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });

  await mongoose.connect(env.MONGO_URI);
  console.log(`MongoDB connected: ${mongoose.connection.host}`);
}

// Exported separately (not just left to process exit) so server.ts can close the connection
// deliberately, in order, during graceful shutdown — see Stage 11.
export async function disconnectDB(): Promise<void> {
  await mongoose.connection.close();
  console.log('MongoDB connection closed');
}