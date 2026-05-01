# TradingView MCP Pine Script Deployment Guide

## What Was Fixed

The system now properly deploys Pine Scripts to TradingView Desktop instead of just generating them. When you create a strategy:

1. **Generate**: Claude AI generates a Pine Script based on your entry/exit rules
2. **Deploy**: The script is automatically deployed to TradingView Desktop via MCP tools
3. **Compile**: The script is compiled and ready to trade
4. **Status**: You receive deployment status (generated, deployed, or error)

## Prerequisites

### On Your Machine (macOS/Linux)

1. **TradingView Desktop** - Running and configured
2. **Enable CDP (Chrome DevTools Protocol)**:
   ```bash
   # For macOS (using Homebrew):
   /Applications/TradingView.app/Contents/MacOS/TradingView --remote-debugging-port=9222
   
   # Or add to launch config:
   export TRADINGVIEW_ARGS="--remote-debugging-port=9222"
   ```

3. **Docker & Docker Compose** - For running the local MCP server
   ```bash
   docker --version
   docker-compose --version
   ```

### Environment Variables

1. **Local Setup** (`.env` in project root):
   ```bash
   ANTHROPIC_API_KEY=your_api_key
   NGROK_AUTHTOKEN=your_ngrok_token
   ```

2. **Automatic via docker-compose**:
   ```yaml
   environment:
     - CDP_PORT=9222
     - CDP_HOST=host.docker.internal  # macOS/Docker Desktop
   ```

## How to Test

### Step 1: Start TradingView Desktop with CDP

```bash
# macOS (ensure TradingView is running with debugging enabled)
# You'll see this in Terminal when CDP is active:
# DevTools listening on ws://localhost:9222/devtools/browser/...
```

### Step 2: Start Local MCP Server (Docker)

```bash
cd /home/user/bitiqlab-v2
docker-compose up -d tradingview-mcp-local
```

Check logs:
```bash
docker-compose logs -f tradingview-mcp-local
```

Expected output:
```
[MCP HTTP] TradingView MCP HTTP Server running on http://0.0.0.0:3000
[MCP] Connecting to TradingView at host.docker.internal:9222...
[MCP] ✓ Connected to TradingView Desktop via CDP
```

### Step 3: Start ngrok Tunnel

```bash
docker-compose up -d ngrok
```

Get your public URL:
```bash
curl http://localhost:4040/api/tunnels
# Look for: "public_url": "https://xxxxx.ngrok-free.dev"
```

### Step 4: Configure Railway Backend

Set the environment variable on Railway:
```
TRADINGVIEW_MCP_URL=https://xxxxx.ngrok-free.dev
```

### Step 5: Create a Strategy

Use the dashboard or API:

```bash
curl -X POST http://localhost:3001/api/paper-trading/start \
  -H "Content-Type: application/json" \
  -d '{
    "strategy_name": "Test Strategy",
    "symbol": "BTCUSDT",
    "timeframe": "1H",
    "initial_balance": 10000,
    "entry_rules": ["Price > SMA(20)", "RSI < 70"],
    "exit_rules": ["Price < SMA(20)", "RSI > 30"]
  }'
```

### Step 6: Monitor the Deployment

Check the MCP server logs:
```bash
docker-compose logs -f tradingview-mcp-local
```

Expected flow:
```
[MCP HTTP] Creating strategy: Test Strategy for BTCUSDT
[MCP HTTP] Generating Pine Script via Claude...
[MCP HTTP] ✓ Pine Script generated, deploying to TradingView...
[MCP HTTP] Setting chart symbol to BTCUSDT...
[MCP HTTP] ✓ Symbol set
[MCP HTTP] Deploying Pine Script to chart...
[MCP HTTP] ✓ Pine Script deployed
[MCP HTTP] Compiling Pine Script...
[MCP HTTP] ✓ Pine Script compiled successfully
```

### Step 7: Verify on TradingView Desktop

1. Open TradingView Desktop
2. Go to your chart for BTCUSDT, 1H timeframe
3. You should see:
   - A new Pine Script indicator added
   - The script status shows "OK" (compiled successfully)
   - The strategy is now live

## Troubleshooting

### Issue: "Failed to connect to TradingView Desktop"

**Cause**: CDP not enabled or wrong port

**Fix**:
```bash
# Check if TradingView is running with CDP
lsof -i :9222

# If nothing, restart TradingView with CDP enabled:
/Applications/TradingView.app/Contents/MacOS/TradingView --remote-debugging-port=9222
```

### Issue: "Symbol input not found" (Deployment Error)

**Cause**: TradingView UI selectors changed or app isn't responsive

**Fix**:
1. Make sure TradingView window is in focus
2. Try restarting TradingView
3. Check if the Pine Script editor is open

### Issue: "Pine Script editor not found"

**Cause**: Editor not visible or not initialized

**Fix**:
1. Open a chart on TradingView
2. Click the "Pine Script Editor" button
3. Make sure the editor pane is visible
4. Retry strategy creation

### Issue: Compilation errors in TradingView

**Cause**: Generated Pine Script has syntax errors

**Fix**:
1. Check the compilation error in TradingView
2. Modify the entry/exit rules to be simpler
3. Claude will generate corrected code on next attempt

## Architecture Overview

```
┌─────────────────────────┐
│   Railway Backend       │
│ (Next.js API routes)    │
└────────────┬────────────┘
             │
             │ (via ngrok tunnel)
             │
┌────────────▼─────────────────┐
│  Docker Container             │
│  (mcp-http-server.js)         │
│  - Generates Pine Script      │
│  - Deploys via CDP/MCP tools  │
└────────────┬─────────────────┘
             │
             │ (via CDP on port 9222)
             │
┌────────────▼──────────────────┐
│  TradingView Desktop           │
│  - Running with CDP enabled    │
│  - Receives Pine Script        │
│  - Compiles and deploys        │
└───────────────────────────────┘
```

## Key Files Modified

- `backend/mcp-http-server.js`: Main HTTP server with CDP/MCP tools
- `docker-compose.yml`: MCP server configuration with CDP env vars
- `backend/src/lib/tradingview-mcp-service.ts`: Service layer for strategy deployment

## What Happens Behind the Scenes

When you create a strategy:

1. **Generate** (in mcp-http-server.js):
   ```javascript
   // Claude generates Pine Script from rules
   const response = await client.messages.create({
     model: 'claude-opus-4-7',
     messages: [{ role: 'user', content: prompt }]
   });
   ```

2. **Deploy via CDP**:
   ```javascript
   // Set chart symbol
   await callMCPTool('chart_set_symbol', { symbol });
   
   // Deploy Pine Script source
   await callMCPTool('pine_set_source', { source: scriptContent });
   
   // Compile the script
   await callMCPTool('pine_smart_compile', {});
   ```

3. **Return Status**:
   - `deployed`: Success - script is live
   - `generated`: Script generated but deployment had issues
   - `error`: Complete failure

## Testing the Full Flow

```bash
# 1. Start everything
docker-compose up -d

# 2. Create a test strategy
curl -X POST http://localhost:3001/api/paper-trading/start \
  -H "Content-Type: application/json" \
  -d '{
    "strategy_name": "RSI Breakout",
    "symbol": "ETHUSD",
    "timeframe": "4H",
    "initial_balance": 5000,
    "entry_rules": ["RSI(14) < 30", "Close > Open"],
    "exit_rules": ["RSI(14) > 70"]
  }'

# 3. Check logs
docker-compose logs tradingview-mcp-local | grep -E "deployed|compiled|error"

# 4. Check TradingView - new indicator should appear!
```

## Next Steps

Once Pine Script deployment is working:

1. **Signals**: TradingView sends trade signals (buy/sell) to your backend
2. **Execution**: Signals trigger automated trades on Binance testnet
3. **Monitoring**: Results display in real-time dashboard
4. **Optimization**: Claude improves strategy based on results

See `TRADING_FLOW.md` for the complete signal-to-trade workflow.
