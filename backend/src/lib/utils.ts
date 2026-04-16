/**
 * Utility functions for API
 */

import { NextApiResponse } from "next";

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: string;
}

/**
 * Enable CORS for API routes
 */
export function enableCORS(res: NextApiResponse, req?: any) {
  const origin = req?.headers?.origin || "*";
  const allowedOrigins = [
    "https://labbitiq.vercel.app",
    "https://bitiqlab-v2-production.up.railway.app",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:3006",
  ];

  // Allow if origin is in whitelist or if using *
  const corsOrigin = allowedOrigins.includes(origin) ? origin : "*";

  res.setHeader("Access-Control-Allow-Origin", corsOrigin);
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  res.setHeader("Access-Control-Max-Age", "86400");
}

/**
 * Handle CORS preflight requests
 */
export function handleCORSPreflight(req: any, res: NextApiResponse) {
  if (req.method === "OPTIONS") {
    enableCORS(res, req);
    res.status(200).end();
    return true;
  }
  return false;
}

/**
 * Send success response
 */
export function sendSuccess<T>(
  res: NextApiResponse<ApiResponse<T>>,
  data: T,
  statusCode: number = 200,
  req?: any
) {
  enableCORS(res, req);
  res.status(statusCode).json({
    success: true,
    data,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Send error response
 */
export function sendError(
  res: NextApiResponse<ApiResponse>,
  error: string | Error,
  statusCode: number = 500,
  req?: any
) {
  enableCORS(res, req);
  const message = typeof error === "string" ? error : error.message;

  res.status(statusCode).json({
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Validate required fields
 */
export function validateRequired(
  obj: Record<string, any>,
  fields: string[]
): { valid: boolean; missing: string[] } {
  const missing = fields.filter((field) => obj[field] == null);
  return {
    valid: missing.length === 0,
    missing,
  };
}

/**
 * Validate enum value
 */
export function validateEnum(value: any, enumValues: string[]): boolean {
  return enumValues.includes(value);
}

/**
 * Parse numeric query parameter
 */
export function parseNum(value: any, defaultValue: number = 0): number {
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse date query parameter
 */
export function parseDate(value: any): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Rate limiting helper (basic implementation)
 */
export class RateLimiter {
  private requests: Map<string, number[]> = new Map();
  private windowMs: number;
  private maxRequests: number;

  constructor(windowMs: number = 60000, maxRequests: number = 100) {
    this.windowMs = windowMs;
    this.maxRequests = maxRequests;
  }

  isAllowed(key: string): boolean {
    const now = Date.now();
    const requests = this.requests.get(key) || [];

    // Remove old requests outside the window
    const recentRequests = requests.filter((time) => now - time < this.windowMs);

    if (recentRequests.length >= this.maxRequests) {
      return false;
    }

    recentRequests.push(now);
    this.requests.set(key, recentRequests);
    return true;
  }
}

/**
 * Cache helper
 */
export class Cache<T> {
  private store: Map<string, { data: T; expiresAt: number }> = new Map();

  set(key: string, data: T, ttlMs: number = 3600000): void {
    this.store.set(key, {
      data,
      expiresAt: Date.now() + ttlMs,
    });
  }

  get(key: string): T | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return null;
    }

    return entry.data;
  }

  clear(): void {
    this.store.clear();
  }
}

/**
 * Async error wrapper for API routes
 */
export function asyncHandler(
  handler: (
    req: any,
    res: any
  ) => Promise<void> | void
): (req: any, res: any) => Promise<void> {
  return async (req, res) => {
    try {
      await handler(req, res);
    } catch (error) {
      console.error("API Error:", error);
      sendError(res, error as Error, 500, req);
    }
  };
}
