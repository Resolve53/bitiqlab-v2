/**
 * Binance WebSocket Stream Manager
 * Maintains real-time price feeds for paper trading
 */

// eslint-disable-next-line global-require
const WS = require("ws");

export interface PriceTick {
  symbol: string;
  price: number;
  timestamp: number;
  high24h: number;
  low24h: number;
  volume24h: number;
}

type PriceTickCallback = (tick: PriceTick) => void;

export class BinanceWebSocketManager {
  private streams: Map<string, WebSocket> = new Map();
  private callbacks: Map<string, Set<PriceTickCallback>> = new Map();
  private baseUrl: string = "wss://stream.binance.com:9443/ws";
  private priceCache: Map<string, PriceTick> = new Map();
  private reconnectAttempts: Map<string, number> = new Map();
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 1000;

  /**
   * Subscribe to real-time price updates for a symbol
   */
  subscribe(symbol: string, callback: PriceTickCallback): void {
    const upperSymbol = symbol.toUpperCase();

    // Add callback to set
    if (!this.callbacks.has(upperSymbol)) {
      this.callbacks.set(upperSymbol, new Set());
    }
    this.callbacks.get(upperSymbol)!.add(callback);

    // If we already have a stream for this symbol, call the callback with cached data
    if (this.streams.has(upperSymbol)) {
      const cached = this.priceCache.get(upperSymbol);
      if (cached) {
        callback(cached);
      }
      return;
    }

    // Create new stream
    this.connectStream(upperSymbol);
  }

  /**
   * Unsubscribe from price updates
   */
  unsubscribe(symbol: string, callback: PriceTickCallback): void {
    const upperSymbol = symbol.toUpperCase();
    const callbacks = this.callbacks.get(upperSymbol);

    if (callbacks) {
      callbacks.delete(callback);

      // If no more callbacks, close the stream
      if (callbacks.size === 0) {
        this.disconnectStream(upperSymbol);
      }
    }
  }

  /**
   * Get latest price from cache
   */
  getPrice(symbol: string): number | null {
    const tick = this.priceCache.get(symbol.toUpperCase());
    return tick ? tick.price : null;
  }

  /**
   * Get cached price tick
   */
  getPriceTick(symbol: string): PriceTick | null {
    return this.priceCache.get(symbol.toUpperCase()) || null;
  }

  /**
   * Connect WebSocket stream for a symbol
   */
  private connectStream(symbol: string): void {
    try {
      const stream = symbol.toLowerCase() + "@ticker";
      const url = `${this.baseUrl}/${stream}`;

      const ws = new WS(url);

      ws.on("open", () => {
        console.log(`Connected to Binance stream for ${symbol}`);
        this.reconnectAttempts.set(symbol, 0);
      });

      ws.on("message", (data: string) => {
        try {
          const message = JSON.parse(data);
          const tick: PriceTick = {
            symbol,
            price: parseFloat(message.c),
            timestamp: message.E,
            high24h: parseFloat(message.h),
            low24h: parseFloat(message.l),
            volume24h: parseFloat(message.v),
          };

          // Cache the price tick
          this.priceCache.set(symbol, tick);

          // Call all callbacks for this symbol
          const callbacks = this.callbacks.get(symbol);
          if (callbacks) {
            callbacks.forEach((cb) => cb(tick));
          }
        } catch (error) {
          console.error(`Error parsing message for ${symbol}:`, error);
        }
      });

      ws.on("error", (error: Error) => {
        console.error(`WebSocket error for ${symbol}:`, error.message);
      });

      ws.on("close", () => {
        console.log(`Disconnected from Binance stream for ${symbol}`);
        this.streams.delete(symbol);

        // Attempt to reconnect if there are still subscribers
        const callbacks = this.callbacks.get(symbol);
        if (callbacks && callbacks.size > 0) {
          this.attemptReconnect(symbol);
        }
      });

      this.streams.set(symbol, ws);
    } catch (error) {
      console.error(`Failed to connect stream for ${symbol}:`, error);
    }
  }

  /**
   * Disconnect WebSocket stream for a symbol
   */
  private disconnectStream(symbol: string): void {
    const ws = this.streams.get(symbol);
    if (ws) {
      ws.close();
      this.streams.delete(symbol);
    }
    this.callbacks.delete(symbol);
    this.priceCache.delete(symbol);
  }

  /**
   * Attempt to reconnect with exponential backoff
   */
  private attemptReconnect(symbol: string): void {
    const attempts = this.reconnectAttempts.get(symbol) || 0;

    if (attempts >= this.maxReconnectAttempts) {
      console.error(
        `Max reconnection attempts reached for ${symbol}, giving up`
      );
      this.disconnectStream(symbol);
      return;
    }

    const delay = this.reconnectDelay * Math.pow(2, attempts);
    console.log(
      `Attempting to reconnect ${symbol} in ${delay}ms (attempt ${attempts + 1})`
    );

    setTimeout(() => {
      this.reconnectAttempts.set(symbol, attempts + 1);
      this.connectStream(symbol);
    }, delay);
  }

  /**
   * Close all streams
   */
  closeAll(): void {
    this.streams.forEach((ws) => {
      ws.close();
    });
    this.streams.clear();
    this.callbacks.clear();
    this.priceCache.clear();
    this.reconnectAttempts.clear();
  }
}

// Singleton instance
let wsManager: BinanceWebSocketManager | null = null;

export function getWebSocketManager(): BinanceWebSocketManager {
  if (!wsManager) {
    wsManager = new BinanceWebSocketManager();
  }
  return wsManager;
}
