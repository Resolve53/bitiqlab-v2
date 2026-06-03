/**
 * Binance Trading Client for Spot and USD-M Futures (testnet + live)
 */

import crypto from "crypto";
import axios, { AxiosInstance } from "axios";
import type { TradingMarketType } from "./trading-market-resolver";

export type { TradingMarketType };

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

const SPOT_TESTNET_BASE = "https://testnet.binance.vision/api";
const SPOT_LIVE_BASE = "https://api.binance.com/api";
const FUTURES_TESTNET_BASE =
  process.env.BINANCE_FUTURES_TESTNET_BASE_URL ||
  "https://demo-fapi.binance.com";
const FUTURES_LIVE_BASE = "https://fapi.binance.com";

export class BinanceTradingClient {
  private apiKey: string;
  private apiSecret: string;
  private baseUrl: string;
  private client: AxiosInstance;
  readonly marketType: TradingMarketType;
  readonly useTestnet: boolean;
  private quantityStepCache = new Map<string, number>();
  private leverageSetForSymbol = new Set<string>();

  constructor(
    apiKey?: string,
    apiSecret?: string,
    useTestnet: boolean = true,
    marketType: TradingMarketType = "spot"
  ) {
    this.marketType = marketType;
    this.useTestnet = useTestnet;

    if (marketType === "futures") {
      this.apiKey =
        apiKey ||
        process.env.BINANCE_FUTURES_TESTNET_API_KEY ||
        process.env.BINANCE_TESTNET_API_KEY ||
        "";
      this.apiSecret =
        apiSecret ||
        process.env.BINANCE_FUTURES_TESTNET_API_SECRET ||
        process.env.BINANCE_TESTNET_API_SECRET ||
        "";
      this.baseUrl = useTestnet ? FUTURES_TESTNET_BASE : FUTURES_LIVE_BASE;
    } else {
      this.apiKey = apiKey || process.env.BINANCE_TESTNET_API_KEY || "";
      this.apiSecret =
        apiSecret || process.env.BINANCE_TESTNET_API_SECRET || "";
      this.baseUrl = useTestnet ? SPOT_TESTNET_BASE : SPOT_LIVE_BASE;
    }

    this.client = axios.create({
      baseURL: this.baseUrl,
      timeout: 15000,
    });
  }

  private getSignature(queryString: string): string {
    return crypto
      .createHmac("sha256", this.apiSecret)
      .update(queryString)
      .digest("hex");
  }

  private async authenticatedRequest<T>(
    method: string,
    endpoint: string,
    params: Record<string, string | number> = {}
  ): Promise<T> {
    try {
      const timestamp = Date.now();
      const queryParams: Record<string, string | number> = {
        ...params,
        timestamp,
      };

      const queryString = Object.entries(queryParams)
        .map(([key, value]) => `${key}=${encodeURIComponent(String(value))}`)
        .join("&");

      const signature = this.getSignature(queryString);
      const url = `${endpoint}?${queryString}&signature=${signature}`;

      const response = await this.client.request<T>({
        method: method.toLowerCase(),
        url,
        headers: {
          "X-MBX-APIKEY": this.apiKey,
        },
      });

      return response.data;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        const msg =
          error.response?.data?.msg ||
          error.response?.data?.message ||
          error.message;
        throw new Error(
          `Binance ${this.marketType} API Error: ${error.response?.status} ${msg}`
        );
      }
      throw error;
    }
  }

  private accountEndpoint(): string {
    return this.marketType === "futures" ? "/fapi/v2/account" : "/v3/account";
  }

  private orderEndpoint(): string {
    return this.marketType === "futures" ? "/fapi/v1/order" : "/v3/order";
  }

  private openOrdersEndpoint(): string {
    return this.marketType === "futures"
      ? "/fapi/v1/openOrders"
      : "/v3/openOrders";
  }

  private tickerPriceEndpoint(): string {
    return this.marketType === "futures"
      ? "/fapi/v1/ticker/price"
      : "/v3/ticker/price";
  }

  async ping(): Promise<boolean> {
    try {
      const path =
        this.marketType === "futures" ? "/fapi/v1/ping" : "/v3/ping";
      await this.client.get(path);
      return true;
    } catch {
      return false;
    }
  }

  async getAccountInfo(): Promise<{
    balances: AccountBalance[];
    makerCommission: number;
    takerCommission: number;
  }> {
    const result = await this.authenticatedRequest<any>(
      "GET",
      this.accountEndpoint()
    );

    if (this.marketType === "futures") {
      const balances: AccountBalance[] = (result.assets || []).map(
        (a: { asset: string; availableBalance: string; walletBalance: string }) => ({
          asset: a.asset,
          free: parseFloat(a.availableBalance || "0"),
          locked: Math.max(
            0,
            parseFloat(a.walletBalance || "0") -
              parseFloat(a.availableBalance || "0")
          ),
        })
      );
      return {
        balances,
        makerCommission: result.feeTier ?? 0,
        takerCommission: result.feeTier ?? 0,
      };
    }

    return result;
  }

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

  async getLongPositionQuantity(symbol: string): Promise<number> {
    if (this.marketType !== "futures") {
      return 0;
    }

    try {
      const rows = await this.authenticatedRequest<
        Array<{ symbol: string; positionAmt: string }>
      >("GET", "/fapi/v2/positionRisk", { symbol: symbol.toUpperCase() });

      const row = Array.isArray(rows)
        ? rows.find((r) => r.symbol === symbol.toUpperCase())
        : undefined;
      const amt = parseFloat(row?.positionAmt || "0");
      return amt > 0 ? amt : 0;
    } catch (error) {
      console.error("Error fetching futures position:", error);
      return 0;
    }
  }

  async setLeverage(symbol: string, leverage: number): Promise<void> {
    if (this.marketType !== "futures") return;

    const key = `${symbol.toUpperCase()}:${leverage}`;
    if (this.leverageSetForSymbol.has(key)) return;

    const clamped = Math.min(125, Math.max(1, Math.floor(leverage)));
    await this.authenticatedRequest("POST", "/fapi/v1/leverage", {
      symbol: symbol.toUpperCase(),
      leverage: clamped,
    });
    this.leverageSetForSymbol.add(key);
  }

  async formatQuantity(symbol: string, quantity: number): Promise<number> {
    const step = await this.getQuantityStep(symbol);
    if (step <= 0) {
      return Math.round(quantity * 10000) / 10000;
    }
    const rounded = Math.floor(quantity / step) * step;
    const decimals = Math.max(0, Math.ceil(-Math.log10(step)));
    return parseFloat(rounded.toFixed(decimals));
  }

  private async getQuantityStep(symbol: string): Promise<number> {
    const sym = symbol.toUpperCase();
    if (this.quantityStepCache.has(sym)) {
      return this.quantityStepCache.get(sym)!;
    }

    try {
      const path =
        this.marketType === "futures"
          ? "/fapi/v1/exchangeInfo"
          : "/v3/exchangeInfo";
      const response = await this.client.get(path);
      const info = response.data.symbols?.find(
        (s: { symbol: string }) => s.symbol === sym
      );
      const lot = info?.filters?.find(
        (f: { filterType: string }) => f.filterType === "LOT_SIZE"
      );
      const step = parseFloat(lot?.stepSize || "0.001");
      this.quantityStepCache.set(sym, step);
      return step;
    } catch {
      return 0.001;
    }
  }

  async marketOrder(
    symbol: string,
    side: "BUY" | "SELL",
    quantity: number,
    options?: { leverage?: number }
  ): Promise<TradeResult> {
    const formattedQty = await this.formatQuantity(symbol, quantity);
    if (formattedQty <= 0) {
      throw new Error(`Invalid order quantity for ${symbol}`);
    }

    if (this.marketType === "futures" && options?.leverage) {
      await this.setLeverage(symbol, options.leverage);
    }

    const params: Record<string, string | number> = {
      symbol: symbol.toUpperCase(),
      side: side.toUpperCase(),
      type: "MARKET",
      quantity: formattedQty.toString(),
    };

    const result = await this.authenticatedRequest<Order>(
      "POST",
      this.orderEndpoint(),
      params
    );

    return {
      symbol: result.symbol,
      orderId: result.orderId,
      clientOrderId: result.clientOrderId,
      executedQty: result.executedQty,
      cummulativeQuoteAssetTransacted: result.cummulativeQuoteAssetTransacted,
      status: result.status,
    };
  }

  async limitOrder(
    symbol: string,
    side: "BUY" | "SELL",
    quantity: number,
    price: number
  ): Promise<TradeResult> {
    const formattedQty = await this.formatQuantity(symbol, quantity);

    const params: Record<string, string | number> = {
      symbol: symbol.toUpperCase(),
      side: side.toUpperCase(),
      type: "LIMIT",
      timeInForce: "GTC",
      quantity: formattedQty.toString(),
      price: price.toString(),
    };

    const result = await this.authenticatedRequest<Order>(
      "POST",
      this.orderEndpoint(),
      params
    );

    return {
      symbol: result.symbol,
      orderId: result.orderId,
      clientOrderId: result.clientOrderId,
      executedQty: result.executedQty,
      cummulativeQuoteAssetTransacted: result.cummulativeQuoteAssetTransacted,
      status: result.status,
      price: result.price,
    };
  }

  async cancelOrder(symbol: string, orderId: number): Promise<void> {
    await this.authenticatedRequest("DELETE", this.orderEndpoint(), {
      symbol: symbol.toUpperCase(),
      orderId,
    });
  }

  async getOrderStatus(
    symbol: string,
    orderId: number
  ): Promise<{
    symbol: string;
    status: string;
    executedQty: number;
    origQty: number;
  }> {
    const result = await this.authenticatedRequest<any>(
      "GET",
      this.orderEndpoint(),
      {
        symbol: symbol.toUpperCase(),
        orderId,
      }
    );

    return {
      symbol: result.symbol,
      status: result.status,
      executedQty: parseFloat(result.executedQty),
      origQty: parseFloat(result.origQty),
    };
  }

  async getOpenOrders(symbol?: string): Promise<OpenOrder[]> {
    const params: Record<string, string | number> = {};
    if (symbol) {
      params.symbol = symbol.toUpperCase();
    }

    return this.authenticatedRequest<OpenOrder[]>(
      "GET",
      this.openOrdersEndpoint(),
      params
    );
  }

  async getPrice(symbol: string): Promise<number> {
    const response = await this.client.get(this.tickerPriceEndpoint(), {
      params: { symbol: symbol.toUpperCase() },
    });
    return parseFloat(response.data.price);
  }

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
    const path =
      this.marketType === "futures" ? "/fapi/v1/trades" : "/v3/trades";
    const response = await this.client.get(path, {
      params: { symbol: symbol.toUpperCase(), limit },
    });
    return response.data.map((trade: any) => ({
      id: trade.id,
      price: parseFloat(trade.price),
      qty: parseFloat(trade.qty),
      time: trade.time,
      isBuyerMaker: trade.isBuyerMaker,
    }));
  }

  async getOrderBook(
    symbol: string,
    limit: number = 20
  ): Promise<{
    bids: [string, string][];
    asks: [string, string][];
  } | null> {
    try {
      const path =
        this.marketType === "futures" ? "/fapi/v1/depth" : "/v3/depth";
      const response = await this.client.get(path, {
        params: { symbol: symbol.toUpperCase(), limit },
      });
      return {
        bids: response.data.bids || [],
        asks: response.data.asks || [],
      };
    } catch {
      return null;
    }
  }

  async resolveSellQuantity(
    symbol: string,
    fallbackQuantity: number
  ): Promise<number> {
    if (this.marketType === "futures") {
      const pos = await this.getLongPositionQuantity(symbol);
      if (pos > 0) return pos;
      return fallbackQuantity;
    }

    const openOrders = await this.getOpenOrders(symbol);
    const buyOrders = openOrders.filter((o) => o.side === "BUY");
    if (buyOrders.length > 0) {
      return parseFloat(buyOrders[buyOrders.length - 1].origQty);
    }
    return fallbackQuantity;
  }
}

const tradingClients = new Map<string, BinanceTradingClient>();

export function getTradingClient(
  useTestnet: boolean = true,
  marketType: TradingMarketType = "spot"
): BinanceTradingClient {
  const key = `${useTestnet ? "testnet" : "live"}:${marketType}`;
  let client = tradingClients.get(key);
  if (!client) {
    client = new BinanceTradingClient(
      undefined,
      undefined,
      useTestnet,
      marketType
    );
    tradingClients.set(key, client);
  }
  return client;
}
