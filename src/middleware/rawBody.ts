import { Request, Response, NextFunction } from "express";

/**
 * Captures the raw request body as a Buffer before Express parses it.
 * Required for Stripe webhook signature verification.
 */
export function rawBodyMiddleware(
  req: Request,
  _res: Response,
  buf: Buffer,
  _encoding: string
): void {
  if (buf.length > 0) {
    (req as Request & { rawBody: Buffer }).rawBody = buf;
  }
}

export type RawBodyRequest = Request & { rawBody: Buffer };
