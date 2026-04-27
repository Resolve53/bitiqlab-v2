#!/bin/bash

# Paper Trading Diagnostic & Test Script
# For use with deployed systems

set -e

GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Paper Trading Diagnostic Script      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}\n"

# Get API URL from user if not set
if [ -z "$API_URL" ]; then
  echo "What is your backend API URL?"
  echo "Examples:"
  echo "  - http://localhost:3001 (local development)"
  echo "  - https://your-app.railway.app (Railway production)"
  echo "  - https://your-app.vercel.app (Vercel production)"
  read -p "Enter API URL: " API_URL
fi

echo -e "\n${BLUE}Configuration:${NC}"
echo "API URL: $API_URL"

# Test 1: Check API Health
echo -e "\n${BLUE}[Test 1] Checking API Health${NC}"
HEALTH=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health" 2>/dev/null || echo "000")

if [ "$HEALTH" -eq 200 ]; then
  echo -e "${GREEN}✓ API is reachable${NC}\n"
else
  echo -e "${RED}✗ API not responding (status: $HEALTH)${NC}"
  echo -e "Check:"
  echo -e "  1. API URL is correct"
  echo -e "  2. Backend is deployed and running"
  echo -e "  3. Network/firewall allows connections"
  exit 1
fi

# Test 2: Get Backend Info (to verify it's our backend)
echo -e "${BLUE}[Test 2] Verifying Backend Type${NC}"
MARKETS=$(curl -s "$API_URL/api/market/prices?symbols=BTCUSDT" 2>/dev/null | jq '.' 2>/dev/null || echo "error")

if echo "$MARKETS" | grep -q "success\|prices\|symbol"; then
  echo -e "${GREEN}✓ Confirmed: Bitiq Lab Backend${NC}\n"
else
  echo -e "${YELLOW}⚠ Warning: Unexpected response format${NC}"
fi

# Test 3: Check CORS
echo -e "${BLUE}[Test 3] Checking CORS Headers${NC}"
CORS=$(curl -s -i -X OPTIONS "$API_URL/api/paper-trading/start" \
  -H "Origin: http://localhost:3000" \
  -H "Access-Control-Request-Method: POST" 2>/dev/null | grep -i "access-control-allow" || echo "none")

if echo "$CORS" | grep -q "access-control"; then
  echo -e "${GREEN}✓ CORS headers present${NC}"
  echo "$CORS" | head -3
else
  echo -e "${YELLOW}⚠ No CORS headers detected${NC}"
fi

# Test 4: Create Test Strategy
echo -e "\n${BLUE}[Test 4] Creating Test Strategy${NC}"
STRATEGY=$(curl -s -X POST "$API_URL/api/research/claude-generate" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "BTCUSDT",
    "timeframe": "1h",
    "strategy_idea": "Buy when RSI oversold below 30",
    "created_by": "debug-test"
  }' 2>/dev/null)

STRATEGY_ID=$(echo "$STRATEGY" | jq -r '.data.id // empty' 2>/dev/null || echo "")

if [ -n "$STRATEGY_ID" ] && [ "$STRATEGY_ID" != "null" ]; then
  echo -e "${GREEN}✓ Strategy created: $STRATEGY_ID${NC}\n"
else
  echo -e "${RED}✗ Strategy creation failed${NC}"
  echo "Response: $STRATEGY" | head -5
  exit 1
fi

# Test 5: Start Paper Trading Session
echo -e "${BLUE}[Test 5] Starting Paper Trading Session${NC}"
SESSION=$(curl -s -X POST "$API_URL/api/paper-trading/start" \
  -H "Content-Type: application/json" \
  -d "{
    \"strategy_id\": \"$STRATEGY_ID\",
    \"initial_balance\": 10000,
    \"use_testnet\": true
  }" 2>/dev/null)

SESSION_ID=$(echo "$SESSION" | jq -r '.data.session_id // empty' 2>/dev/null || echo "")

if [ -n "$SESSION_ID" ] && [ "$SESSION_ID" != "null" ]; then
  echo -e "${GREEN}✓ Session created: $SESSION_ID${NC}\n"
else
  echo -e "${RED}✗ Session creation failed${NC}"
  echo "Response: $SESSION" | head -5
  exit 1
fi

# Test 6: Check Session Status
echo -e "${BLUE}[Test 6] Checking Session Status${NC}"
STATUS=$(curl -s -X GET "$API_URL/api/paper-trading/$SESSION_ID/status" \
  -H "Content-Type: application/json" 2>/dev/null)

BALANCE=$(echo "$STATUS" | jq -r '.data.current_balance // "error"' 2>/dev/null)
TRADES=$(echo "$STATUS" | jq -r '.data.total_trades // "error"' 2>/dev/null)
IS_TESTNET=$(echo "$STATUS" | jq -r '.data.is_testnet // "error"' 2>/dev/null)

echo "Initial Balance: \$$BALANCE"
echo "Trades: $TRADES"
echo "Using Testnet: $IS_TESTNET"
echo ""

# Test 7: Manual BUY Trade
echo -e "${BLUE}[Test 7] Executing Manual BUY Trade${NC}"
echo -e "${YELLOW}⚠ This will place an actual order on Binance testnet${NC}\n"

read -p "Continue with test BUY order? (y/n): " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  BUY=$(curl -s -X POST "$API_URL/api/paper-trading/execute-signal" \
    -H "Content-Type: application/json" \
    -d "{
      \"session_id\": \"$SESSION_ID\",
      \"signal\": \"BUY\",
      \"symbol\": \"BTCUSDT\",
      \"reason\": \"Automated test\",
      \"risk_percentage\": 2
    }" 2>/dev/null)

  BUY_STATUS=$(echo "$BUY" | jq -r '.data.status // .error // "unknown"' 2>/dev/null)
  ORDER_ID=$(echo "$BUY" | jq -r '.data.order_id // empty' 2>/dev/null)

  if [ -n "$ORDER_ID" ] || echo "$BUY_STATUS" | grep -qi "success\|filled"; then
    echo -e "${GREEN}✓ BUY order executed${NC}"
    echo "Order ID: $ORDER_ID"
    echo "Status: $BUY_STATUS"
  else
    echo -e "${YELLOW}⚠ Order response unclear${NC}"
    echo "$BUY" | jq '.' 2>/dev/null || echo "$BUY" | head -3
  fi

  # Test 8: Check Updated Status
  echo -e "\n${BLUE}[Test 8] Checking Updated Session Status${NC}"
  sleep 1
  STATUS=$(curl -s -X GET "$API_URL/api/paper-trading/$SESSION_ID/status" \
    -H "Content-Type: application/json" 2>/dev/null)

  TRADES=$(echo "$STATUS" | jq -r '.data.total_trades // "error"' 2>/dev/null)
  BALANCE=$(echo "$STATUS" | jq -r '.data.current_balance // "error"' 2>/dev/null)

  echo "Trades: $TRADES (should be 1)"
  echo "Balance: \$$BALANCE"

  if [ "$TRADES" == "1" ]; then
    echo -e "${GREEN}✓ Trade successfully recorded in database${NC}"
  else
    echo -e "${YELLOW}⚠ Trade count mismatch${NC}"
  fi
else
  echo "Skipped trade execution"
fi

# Summary
echo -e "\n${BLUE}════════════════════════════════════════${NC}"
echo -e "${GREEN}✓ Diagnostic Complete${NC}\n"
echo "Test Details:"
echo "  Strategy: $STRATEGY_ID"
echo "  Session: $SESSION_ID"
echo ""
echo "Next Steps:"
echo "1. Check Binance testnet account:"
echo "   https://testnet.binance.vision/trade/BTCUSDT"
echo ""
echo "2. View paper trading dashboard:"
echo "   $API_URL/paper-trading/$SESSION_ID/dashboard"
echo ""
echo "3. Check logs for errors:"
echo "   Backend should show: 'Signal evaluated', 'Order placed', 'Trade logged'"
echo ""
echo "4. Verify Binance credentials are set:"
echo "   BINANCE_TESTNET_API_KEY"
echo "   BINANCE_TESTNET_API_SECRET"
