/**
 * Vercel serverless entry for the Express API.
 * Do not set NODE_OPTIONS=--experimental-strip-types on Vercel; its build runtime rejects that flag.
 */
import app from "../server/server.js";

export default app;
