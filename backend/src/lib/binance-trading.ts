/**
 * Binance Trading Client for Testnet
 * Handles authentication, order placement, and position management
 */

import crypto from "crypto";
import axios, { AxiosInstance } from "axios";

export interface Order {
  orderId: number;
  clientOrderId: string;
  symbol: string;
  side: "BUY" | "SELL";
  orderType: string;
  timeInForce: string;
  origQty: number;
  price: number;
  executedQty: number;
  cummulativeQuoteAssetTransacted: number;
  status: string;
  transactTime: number;
}

export interface AccountBalance {
  asset: string;
  free: number;
  locked: number;
}

export interface OpenOrder {
  symbol: string;
  orderId: number;
  orderListId: number;
  clientOrderId: string;
  price: string;
  origQty: string;
  executedQty: string;
  cummulativeQuoteAssetTransacted: string;
  status: string;
  timeInForce: string;
  type: string;
  side: string;
  stopPrice: string;
  icebergQty: string;
  time: number;
  updateTime: number;
  isWorking: boolean;
  origQuoteOrderQty: string;
}

export interface TradeResult {
  symbol: string;
  orderId: number;
  clientOrderId: string;
  executedQty: number;
  cummulativeQuoteAssetTransacted: number;
  status: string;
  price?: number;
}

export class BinanceTradingClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string = "https://testnet.binance.vision/api";
  private client: AxiosInstance;

  constructor(apiKey?: string, apiSecret?: string, useTestnet: boolean = true) {
    // Try multiple env var names for compatibility
    this.apiKey = apiKey ||
      process.env.BINANCE_TESTNET_API_KEY ||
      process.env.BINANCE_TESTNET_KEY ||
      process.env.BINANCE_API_KEY ||
      "";
    this.apiSecret = apiSecret ||
      process.env.BINANCE_TESTNET_API_SECRET ||
      process.env.BINANCE_TESTNET_SECRET ||
      process.env.BINANCE_API_SECRET ||
      "";

    if (useTestnet) {
      this.baseUrl = "https://testnet.binance.vision/api";
    } else {
      this.baseUrl = "https://api.binance.com/api";
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 10000,
    });
  }

  /**
   * Generate signature for authenticated requests
   */
  private getSignature(queryString: string): string {
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(queryString)
      .digest("hex");
  }

  /**
   * Make authenticated API request
   */
  private async authenticatedRequest<T>(
    method: string,
    endpoint: string,
    params: Record<string, any> = {}
  ): Promise<T> {
    try {
      const timestamp = Date.now();
      const queryParams = {
        ...params,
        timestamp,
      };

      // Build query string
      const queryString = Object.entries(queryParams)
        .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
        .join("&");

      const signature = this.getSignature(queryString);
      const url = `${endpoint}?${queryString}&signature=${signature}`;

      const config = {
        method: method.toLowerCase(),
        url,
        headers: {
          "X-MBX-APIKEY": this.apiKey,
        },
      };

      const response = await this.client.request<T>(config);
      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        throw new Error(
          `Binance API Error: ${error.response?.status} ${error.response?.data?.msg || error.message}`
        );
      }
      throw error;
    }
  }

  /**
   * Get account information including balances
   */
  async getAccountInfo(): Promise<{
    balances: AccountBalance[];
    makerCommission: number;
    takerCommission: number;
  }> {
    const result = await this.authenticatedRequest(
      "GET",
      "/v3/account"
    );
    return result as any;
  }

  /**
   * Get balance for a specific asset
   */
  async getBalance(asset: string = "USDT"): Promise<number> {
    try {
      const account = await this.getAccountInfo();
      const balance = account.balances.find(
        (b) => b.asset.toUpperCase() === asset.toUpperCase()
      );
      return balance ? balance.free : 0;
    } catch (error) {
      console.error("Error fetching balance:", error);
      return 0;
    }
  }

  /**
   * Place a market order
   */
  async marketOrder(
    symbol: string,
    side: "BUY" | "SELL",
    quantity: number
  ): Promise<TradeResult> {
    try {
      const params = {
        symbol: symbol.toUpperCase(),
        side: side.toUpperCase(),
        type: "MARKET",
        quantity: quantity.toString(),
      };

      const result = await this.authenticatedRequest<Order>(
        "POST",
        "/v3/order",
        params
      );

      return {
        symbol: result.symbol,
        orderId: result.orderId,
        clientOrderId: result.clientOrderId,
        executedQty: result.executedQty,
        cummulativeQuoteAssetTransacted:
          result.cummulativeQuoteAssetTransacted,
        status: result.status,
      };
    } catch (error) {
      console.error("Market order error:", error);
      throw error;
    }
  }

  /**
   * Place a limit order
   */
  async limitOrder(
    symbol: string,
    side: "BUY" | "SELL",
    quantity: number,
    price: number
  ): Promise<TradeResult> {
    try {
      const params = {
        symbol: symbol.toUpperCase(),
        side: side.toUpperCase(),
        type: "LIMIT",
        timeInForce: "GTC",
        quantity: quantity.toString(),
        price: price.toString(),
      };

      const result = await this.authenticatedRequest<Order>(
        "POST",
        "/v3/order",
        params
      );

      return {
        symbol: result.symbol,
        orderId: result.orderId,
        clientOrderId: result.clientOrderId,
        executedQty: result.executedQty,
        cummulativeQuoteAssetTransacted:
          result.cummulativeQuoteAssetTransacted,
        status: result.status,
        price: result.price,
      };
    } catch (error) {
      console.error("Limit order error:", error);
      throw error;
    }
  }

  /**
   * Cancel an order
   */
  async cancelOrder(symbol: string, orderId: number): Promise<void> {
    try {
      const params = {
        symbol: symbol.toUpperCase(),
        orderId,
      };

      await this.authenticatedRequest("DELETE", "/v3/order", params);
    } catch (error) {
      console.error("Cancel order error:", error);
      throw error;
    }
  }

  /**
   * Get order status
   */
  async getOrderStatus(
    symbol: string,
    orderId: number
  ): Promise<{
    symbol: string;
    status: string;
    executedQty: number;
    origQty: number;
  }> {
    try {
      const params = {
        symbol: symbol.toUpperCase(),
        orderId,
      };

      const result = await this.authenticatedRequest<any>(
        "GET",
        "/v3/order",
        params
      );

      return {
        symbol: result.symbol,
        status: result.status,
        executedQty: parseFloat(result.executedQty),
        origQty: parseFloat(result.origQty),
      };
    } catch (error) {
      console.error("Get order status error:", error);
      throw error;
    }
  }

  /**
   * Get all open orders
   */
  async getOpenOrders(symbol?: string): Promise<OpenOrder[]> {
    try {
      const params: Record<string, any> = {};
      if (symbol) {
        params.symbol = symbol.toUpperCase();
      }

      const result = await this.authenticatedRequest<OpenOrder[]>(
        "GET",
        "/v3/openOrders",
        params
      );

      return result;
    } catch (error) {
      console.error("Get open orders error:", error);
      throw error;
    }
  }

  /**
   * Get current price for a symbol
   */
  async getPrice(symbol: string): Promise<number> {
    try {
      const response = await this.client.get("/v3/ticker/price", {
        params: { symbol: symbol.toUpperCase() },
      });
      return parseFloat(response.data.price);
    } catch (error) {
      console.error("Get price error:", error);
      throw error;
    }
  }

  /**
   * Get recent trades for a symbol
   */
  async getRecentTrades(
    symbol: string,
    limit: number = 5
  ): Promise<
    Array<{
      id: number;
      price: number;
      qty: number;
      time: number;
      isBuyerMaker: boolean;
    }>
  > {
    try {
      const response = await this.client.get("/v3/trades", {
        params: { symbol: symbol.toUpperCase(), limit },
      });
      return response.data.map((trade: any) => ({
        id: trade.id,
        price: parseFloat(trade.price),
        qty: parseFloat(trade.qty),
        time: trade.time,
        isBuyerMaker: trade.isBuyerMaker,
      }));
    } catch (error) {
      console.error("Get recent trades error:", error);
      throw error;
    }
  }
}

// Singleton instance for easy access
let tradingClient: BinanceTradingClient | null = null;

export function getTradingClient(
  useTestnet: boolean = true
): BinanceTradingClient {
  if (!tradingClient) {
    tradingClient = new BinanceTradingClient(undefined, undefined, useTestnet);
  }
  return tradingClient;
}
