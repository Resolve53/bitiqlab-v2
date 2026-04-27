#!/bin/bash

# Paper Trading Debug & Test Script
# Tests: Strategy creation, session start, and manual trade execution

set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
API_URL="${API_URL:-http://localhost:3001}"
SYMBOL="BTCUSDT"
TIMEFRAME="1h"

echo -e "${BLUE}=== Paper Trading Debug Script ===${NC}\n"

# Function to print section headers
print_section() {
  echo -e "\n${BLUE}>>> $1${NC}"
}

# Function to check HTTP status
check_status() {
  local status=$1
  local endpoint=$2
  if [ "$status" -eq 200 ] || [ "$status" -eq 201 ]; then
    echo -e "${GREEN}✓ Success ($status)${NC} - $endpoint"
    return 0
  else
    echo -e "${RED}✗ Failed ($status)${NC} - $endpoint"
    return 1
  fi
}

# 1. Test API connectivity
print_section "Testing API Connectivity"
echo "API URL: $API_URL"

STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$API_URL/api/health" 2>/dev/null || echo "000")
if [ "$STATUS" -eq 200 ]; then
  echo -e "${GREEN}✓ API is reachable${NC}"
else
  echo -e "${RED}✗ API is not reachable (status: $STATUS)${NC}"
  echo "Try: export API_URL=https://your-backend-url"
  exit 1
fi

# 2. Create a test strategy
print_section "Creating Test Strategy"

STRATEGY_RESPONSE=$(curl -s -X POST "$API_URL/api/research/claude-generate" \
  -H "Content-Type: application/json" \
  -d "{
    \"symbol\": \"$SYMBOL\",
    \"timeframe\": \"$TIMEFRAME\",
    \"strategy_idea\": \"Buy when price bounces from oversold RSI\",
    \"market_type\": \"spot\",
    \"created_by\": \"test-debug\"
  }")

STRATEGY_ID=$(echo "$STRATEGY_RESPONSE" | grep -o '"id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$STRATEGY_ID" ]; then
  echo -e "${RED}✗ Failed to create strategy${NC}"
  echo "Response: $STRATEGY_RESPONSE"
  exit 1
else
  echo -e "${GREEN}✓ Strategy created${NC}"
  echo "Strategy ID: $STRATEGY_ID"
fi

# 3. Start paper trading session
print_section "Starting Paper Trading Session"

SESSION_RESPONSE=$(curl -s -X POST "$API_URL/api/paper-trading/start" \
  -H "Content-Type: application/json" \
  -d "{
    \"strategy_id\": \"$STRATEGY_ID\",
    \"initial_balance\": 10000,
    \"use_testnet\": true
  }")

SESSION_ID=$(echo "$SESSION_RESPONSE" | grep -o '"session_id":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$SESSION_ID" ]; then
  echo -e "${RED}✗ Failed to create session${NC}"
  echo "Response: $SESSION_RESPONSE"
  exit 1
else
  echo -e "${GREEN}✓ Session created${NC}"
  echo "Session ID: $SESSION_ID"
fi

# 4. Check initial session status
print_section "Checking Initial Session Status"

STATUS_RESPONSE=$(curl -s -X GET "$API_URL/api/paper-trading/$SESSION_ID/status" \
  -H "Content-Type: application/json")

BALANCE=$(echo "$STATUS_RESPONSE" | grep -o '"current_balance":[0-9]*' | cut -d':' -f2)
TRADES=$(echo "$STATUS_RESPONSE" | grep -o '"total_trades":[0-9]*' | cut -d':' -f2)

echo "Current Balance: \$$BALANCE"
echo "Total Trades: $TRADES"

# 5. Manual BUY signal execution (Test B)
print_section "Executing Manual BUY Signal (Test)"

BUY_RESPONSE=$(curl -s -X POST "$API_URL/api/paper-trading/execute-signal" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$SESSION_ID\",
    \"signal\": \"BUY\",
    \"symbol\": \"$SYMBOL\",
    \"reason\": \"Debug test buy signal\",
    \"risk_percentage\": 2
  }")

ORDER_ID=$(echo "$BUY_RESPONSE" | grep -o '"order_id":[0-9]*' | cut -d':' -f2)
BUY_STATUS=$(echo "$BUY_RESPONSE" | grep -o '"status":"[^"]*"' | head -1 | cut -d'"' -f4)

if [ -z "$ORDER_ID" ]; then
  echo -e "${RED}✗ BUY signal failed${NC}"
  echo "Response: $BUY_RESPONSE"
else
  echo -e "${GREEN}✓ BUY signal executed${NC}"
  echo "Order ID: $ORDER_ID"
  echo "Order Status: $BUY_STATUS"
fi

# 6. Check session status after BUY
print_section "Session Status After BUY"

STATUS_RESPONSE=$(curl -s -X GET "$API_URL/api/paper-trading/$SESSION_ID/status" \
  -H "Content-Type: application/json")

TRADES=$(echo "$STATUS_RESPONSE" | grep -o '"total_trades":[0-9]*' | cut -d':' -f2)
BALANCE=$(echo "$STATUS_RESPONSE" | grep -o '"current_balance":[0-9.]*' | cut -d':' -f2)

echo "Total Trades: $TRADES"
echo "Current Balance: \$$BALANCE"

# 7. Manual SELL signal execution
print_section "Executing Manual SELL Signal (Test)"

SELL_RESPONSE=$(curl -s -X POST "$API_URL/api/paper-trading/execute-signal" \
  -H "Content-Type: application/json" \
  -d "{
    \"session_id\": \"$SESSION_ID\",
    \"signal\": \"SELL\",
    \"symbol\": \"$SYMBOL\",
    \"reason\": \"Debug test sell signal\"
  }")

SELL_ORDER_ID=$(echo "$SELL_RESPONSE" | grep -o '"order_id":[0-9]*' | cut -d':' -f2)

if [ -z "$SELL_ORDER_ID" ]; then
  echo -e "${YELLOW}⚠ SELL signal may have failed (this is normal if no open position)${NC}"
  echo "Response: $SELL_RESPONSE"
else
  echo -e "${GREEN}✓ SELL signal executed${NC}"
  echo "Order ID: $SELL_ORDER_ID"
fi

# 8. Final status check
print_section "Final Session Status"

STATUS_RESPONSE=$(curl -s -X GET "$API_URL/api/paper-trading/$SESSION_ID/status" \
  -H "Content-Type: application/json")

TRADES=$(echo "$STATUS_RESPONSE" | grep -o '"total_trades":[0-9]*' | cut -d':' -f2)
PNL=$(echo "$STATUS_RESPONSE" | grep -o '"total_pl":[0-9.]*' | cut -d':' -f2)
BALANCE=$(echo "$STATUS_RESPONSE" | grep -o '"current_balance":[0-9.]*' | cut -d':' -f2)

echo "Total Trades: $TRADES"
echo "Total P&L: \$$PNL"
echo "Current Balance: \$$BALANCE"

# Summary
echo -e "\n${BLUE}=== Test Summary ===${NC}"
echo -e "Strategy ID: ${GREEN}$STRATEGY_ID${NC}"
echo -e "Session ID: ${GREEN}$SESSION_ID${NC}"
echo -e "Test Status: ${GREEN}✓ COMPLETE${NC}"
echo -e "\nNext steps:"
echo "1. Check Binance testnet account for orders: https://testnet.binance.vision/"
echo "2. View dashboard: Open paper trading for session $SESSION_ID"
echo "3. Monitor endpoint: curl -X POST $API_URL/api/paper-trading/monitor -H 'Content-Type: application/json' -d '{\"session_id\": \"$SESSION_ID\"}'"
