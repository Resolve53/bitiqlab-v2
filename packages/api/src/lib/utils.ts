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
 * Send success response
 */
export function sendSuccess<T>(
  res: NextApiResponse<ApiResponse<T>>,
  data: T,
  statusCode: number = 200
) {
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
  statusCode: number = 500
) {
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
      sendError(res, error as Error);
    }
  };
}
