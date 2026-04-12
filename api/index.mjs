/**
 * Vercel serverless entry for the Express API.
 * Requires Node with TypeScript-strip-types (set NODE_OPTIONS=--experimental-strip-types on Vercel) or Node 22+ with TS support.
 */
import app from "../server/server.js";

export default app;
