// Vercel entry point for the Express API.
// The server is pre-bundled during `npm run build` so Vercel does not need
// to trace the large Supabase/Express import graph from TypeScript source.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore - generated after the build step
import serverModule from '../dist/server.cjs';

const app = (serverModule && (serverModule.default || serverModule)) || serverModule;

export default app;
