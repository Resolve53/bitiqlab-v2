# Bitiq Lab API Endpoints

Complete reference for all REST API endpoints.

## Base URL
```
http://localhost:3001/api
```

## Health Check

### GET /health
Check API health status.

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0",
  "timestamp": "2026-04-12T10:00:00.000Z"
}
```

---

## Strategies

### POST /strategies
Create a new strategy.

**Request:**
```json
{
  "name": "BTC 15m Momentum",
  "description": "Momentum strategy for BTC",
  "symbol": "BTCUSDT",
  "timeframe": "15m",
  "market_type": "spot",
  "leverage": 1,
  "entry_rules": {
    "direction": "long",
    "conditions": "RSI < 30 AND MACD_histogram > 0"
  },
  "exit_rules": {
    "stop_loss_percent": -2,
    "take_profit_percent": 5
  },
  "position_sizing": {
    "risk_per_trade": 2,
    "max_concurrent_positions": 5
  },
  "created_by": "user-id"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "BTC 15m Momentum",
    "symbol": "BTCUSDT",
    "status": "draft",
    "version": 1,
    "created_at": "2026-04-12T10:00:00.000Z",
    "updated_at": "2026-04-12T10:00:00.000Z"
  },
  "timestamp": "2026-04-12T10:00:00.000Z"
}
```

### GET /strategies
List all strategies.

**Query Parameters:**
- `status` - Filter by status (draft, backtested, optimized, paper_trading, approved, disabled)
- `symbol` - Filter by symbol (e.g., BTCUSDT)
- `created_by` - Filter by creator user ID

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "strategies": [...],
    "count": 5
  },
  "timestamp": "2026-04-12T10:00:00.000Z"
}
```

### GET /strategies/[id]
Get strategy details.

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "BTC 15m Momentum",
    "symbol": "BTCUSDT",
    "status": "draft",
    "current_sharpe": 1.25,
    "current_max_drawdown": 0.15,
    "backtest_count": 3,
    ...
  },
  "timestamp": "2026-04-12T10:00:00.000Z"
}
```

### PATCH /strategies/[id]
Update strategy.

**Request:**
```json
{
  "entry_rules": {
    "conditions": "RSI < 25 AND MACD_histogram > 0"
  },
  "status": "backtested",
  "updated_by": "user-id"
}
```

**Response:** `200 OK`

### DELETE /strategies/[id]
Delete (soft delete) strategy.

**Request:**
```json
{
  "deleted_by": "user-id"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "message": "Strategy deleted",
    "id": "uuid"
  },
  "timestamp": "2026-04-12T10:00:00.000Z"
}
```

---

## Backtesting

### POST /backtest/run
Run backtest on a strategy.

**Request:**
```json
{
  "strategy_id": "uuid",
  "version": 1,
  "window": "12m",
  "start_date": "2025-04-12T00:00:00.000Z",
  "end_date": "2026-04-12T00:00:00.000Z"
}
```

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "backtest_id": "uuid",
    "summary": {
      "sharpe_ratio": 1.35,
      "max_drawdown": 0.12,
      "win_rate": 0.58,
      "profit_factor": 1.45,
      "total_trades": 47,
      "total_return": 0.25
    },
    "trades_count": 47
  },
  "timestamp": "2026-04-12T10:00:00.000Z"
}
```

---

## Research

### POST /research/generate
Generate strategy from natural language prompt.

**Request:**
```json
{
  "prompt": "Create a 15m momentum strategy for BTC using RSI + MACD",
  "symbol": "BTCUSDT",
  "timeframe": "15m",
  "market_type": "spot",
  "leverage": 1,
  "created_by": "user-id"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "strategy": {
      "id": "uuid",
      "name": "BTC 15m Momentum Strategy",
      "description": "A momentum strategy using RSI and MACD indicators...",
      "symbol": "BTCUSDT",
      "status": "draft",
      ...
    },
    "message": "Strategy generated successfully"
  },
  "timestamp": "2026-04-12T10:00:00.000Z"
}
```

---

## Paper Trading

### POST /paper-trading/start
Start paper trading session for a strategy.

**Request:**
```json
{
  "strategy_id": "uuid",
  "version": 1,
  "initial_balance": 10000,
  "use_testnet": true,
  "created_by": "user-id"
}
```

**Response:** `201 Created`
```json
{
  "success": true,
  "data": {
    "session_id": "uuid",
    "account_id": "paper_1234567890",
    "initial_balance": 10000,
    "use_testnet": true,
    "message": "Paper trading session started"
  },
  "timestamp": "2026-04-12T10:00:00.000Z"
}
```

---

## Dashboard

### GET /dashboard/metrics
Get dashboard metrics summary.

**Response:** `200 OK`
```json
{
  "success": true,
  "data": {
    "total_strategies": 5,
    "active_paper_trading": 2,
    "approved_strategies": 1,
    "average_sharpe": 1.12,
    "total_backtests": 23,
    "timestamp": "2026-04-12T10:00:00.000Z"
  },
  "timestamp": "2026-04-12T10:00:00.000Z"
}
```

---

## Error Responses

All endpoints return errors in this format:

```json
{
  "success": false,
  "error": "Description of what went wrong",
  "timestamp": "2026-04-12T10:00:00.000Z"
}
```

### Common Status Codes
- `200 OK` - Successful request
- `201 Created` - Resource created
- `400 Bad Request` - Invalid input
- `404 Not Found` - Resource not found
- `405 Method Not Allowed` - Wrong HTTP method
- `500 Internal Server Error` - Server error

---

## Testing Endpoints with cURL

### Create a Strategy
```bash
curl -X POST http://localhost:3001/api/strategies \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test Strategy",
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "market_type": "spot",
    "entry_rules": {"conditions": "RSI < 30"},
    "exit_rules": {"stop_loss_percent": -2},
    "created_by": "test-user"
  }'
```

### List Strategies
```bash
curl http://localhost:3001/api/strategies
```

### Run Backtest
```bash
curl -X POST http://localhost:3001/api/backtest/run \
  -H "Content-Type: application/json" \
  -d '{
    "strategy_id": "uuid-here",
    "window": "12m"
  }'
```

### Generate Strategy
```bash
curl -X POST http://localhost:3001/api/research/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "Create a momentum strategy",
    "symbol": "BTCUSDT",
    "timeframe": "15m",
    "market_type": "spot",
    "created_by": "test-user"
  }'
```

---

## Authentication (Future)

Authentication will be implemented using JWT tokens or API keys. Each request will require:

```
Authorization: Bearer <token>
```

Or

```
X-API-Key: <api-key>
```

---

## Rate Limiting (Future)

Rate limiting will be implemented with the following headers:

```
X-RateLimit-Limit: 1000
X-RateLimit-Remaining: 999
X-RateLimit-Reset: 1234567890
```

---

## Documentation

For complete implementation details, see:
- `IMPLEMENTATION_GUIDE.md` - How to use each package
- `PROJECT_ARCHITECTURE.md` - System design
- `README.md` - Project overview
