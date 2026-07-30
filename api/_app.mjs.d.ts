declare module './_app.mjs' {
  import type { VercelRequest, VercelResponse } from '@vercel/node';
  const app: (req: VercelRequest | any, res: VercelResponse | any) => any;
  export default app;
}
