# Session Persistence & Trade Analysis Guide

## Overview

Your trading application now has persistent session management that saves your settings, trades, and alerts even when you close the browser or navigate away from the page. This allows you to:

1. **Resume Previous Sessions** - See all your past trading sessions and resume monitoring from where you left off
2. **View Trade History** - Analyze all trades executed with detailed P&L calculations
3. **Track Alerts** - Receive notifications about new trades, signals, and monitoring events
4. **Export Trade Data** - Download trade history as CSV for external analysis

## Key Features

### 1. Session Recovery

When you visit the paper trading page, you'll see a "Resume Previous Sessions" card showing:
- All your saved trading sessions
- Initial balance and most recent update time
- One-click resume button
- Ability to remove sessions from history

**How it works:**
- When you create a strategy and launch paper trading, the session is automatically saved
- Your monitoring settings, symbols, and timeframes are preserved
- Click "Resume" to go directly back to your dashboard

**Location:** `/frontend/src/components/SessionRecovery.tsx`

### 2. Trade History & Analysis

Access the full trade history by clicking the **📊 Show History** button on the dashboard.

**Features:**
- Real-time trade list with all details (Symbol, Side, Quantity, Price, P&L)
- Filter by:
  - All Trades
  - Buy Orders
  - Sell Orders
  - Profit-only trades
  - Loss-only trades
- Click any trade to see detailed information
- Export trades to CSV format
- Quick stats: Win Rate, Total P&L, Average Win/Loss

**Location:** `/frontend/src/components/TradeHistoryAnalysis.tsx`

### 3. Automatic Alert Generation

Alerts are created automatically when:
- A new trade is executed
- A signal is generated
- A monitoring cycle completes
- An error occurs

**View Alerts:**
- Alerts appear in the Trade History section
- Unread alerts are highlighted
- Click to mark as read
- Sorted by most recent first

### 4. Settings Persistence

The system automatically saves:
- Strategy ID and name
- Trading pair (symbol)
- Timeframe
- Initial balance
- Auto-trade setting
- Monitoring status
- Monitored coins list
- Last update timestamp

**Storage:**
- Saved to browser localStorage (instant access)
- Also saved to database on each fetch
- Survives page reloads and browser restarts

## API Endpoints

### 1. Session Status
```
GET /api/paper-trading/[session_id]/status
```
Returns current session stats including all trades and open positions.

### 2. Session List
```
GET /api/paper-trading/sessions?strategy_id=XXX&limit=10
```
Lists all past sessions for a strategy.

### 3. Trade Analysis
```
GET /api/paper-trading/[session_id]/analysis
```
Calculates detailed trade statistics:
- Win rate
- Total profit/loss
- Largest win/loss
- Average win/loss
- Profit factor

## Local Storage Structure

The application uses localStorage to cache session data locally:

```javascript
// Session Settings
localStorage["bitiq_session_settings"] = {
  [session_id]: {
    session_id: string,
    strategy_id: string,
    symbol: string,
    timeframe: string,
    initial_balance: number,
    auto_trade: boolean,
    monitoring_enabled: boolean,
    monitored_coins: string[],
    created_at: number,
    last_updated: number
  }
}

// Alerts
localStorage["bitiq_session_alerts"] = [
  {
    id: string,
    session_id: string,
    type: "trade" | "alert" | "signal",
    title: string,
    message: string,
    timestamp: number,
    read: boolean,
    data: any
  }
]
```

## Usage Examples

### Resume a Previous Session

```typescript
import SessionRecovery from "@/components/SessionRecovery";

export default function Page() {
  const handleSessionSelect = (sessionId: string) => {
    router.push(`/paper-trading/${sessionId}/dashboard`);
  };

  return <SessionRecovery onSessionSelect={handleSessionSelect} />;
}
```

### Access Session Alerts Programmatically

```typescript
import { sessionStorageManager } from "@/lib/sessionStorage";

// Get all alerts for a session
const alerts = sessionStorageManager.getSessionAlerts(session_id);

// Add a new alert
sessionStorageManager.addAlert({
  id: "",
  session_id,
  type: "trade",
  title: "Trade Executed",
  message: "BUY 1 BTC @ $45000",
  timestamp: Date.now(),
  read: false,
  data: tradeData
});

// Mark alert as read
sessionStorageManager.markAlertAsRead(alert_id);
```

### Export Trade Data

```typescript
import TradeHistoryAnalysis from "@/components/TradeHistoryAnalysis";

<TradeHistoryAnalysis
  session_id={session_id}
  trades={stats.trades}
  onExportTrades={(trades) => {
    // Export to CSV
    const csv = trades.map(t => 
      `${t.symbol},${t.side},${t.quantity},${t.price},${t.pnl}`
    ).join("\n");
    // Download...
  }}
/>
```

## Data Persistence Flow

1. **User creates strategy and starts paper trading**
   - Dashboard renders and starts fetching stats every 5 seconds
   
2. **On each stats fetch**
   - Session settings are saved to localStorage
   - New trades are detected and alerts are created
   - Data is available immediately even if user navigates away

3. **User returns to page later**
   - Session Recovery component shows all saved sessions
   - Click "Resume" to go back to dashboard
   - All trades, settings, and alerts are loaded from database/localStorage

4. **User views Trade History**
   - All trades are displayed in chronological order
   - Alerts are shown separately
   - Can filter, sort, and export data

## Best Practices

1. **Regular Backups**: Export your trade data periodically for external analysis
2. **Session Cleanup**: Remove old sessions you no longer need to keep localStorage clean
3. **Alert Management**: Review unread alerts regularly to stay updated on your trades
4. **Historical Analysis**: Use the trade history to optimize your strategy

## Troubleshooting

### Alerts Not Appearing?
- Check browser console for errors
- Ensure localStorage is not disabled
- Try refreshing the page

### Session Not Saved?
- Check if you have localStorage enabled
- Ensure browser hasn't exceeded storage quota
- Try clearing old session data

### Trades Not Loading?
- Check API status endpoint: `/api/paper-trading/[session_id]/status`
- Verify session_id is correct
- Check browser network tab for failed requests

## File Structure

```
frontend/src/
├── components/
│   ├── SessionRecovery.tsx          # Resume previous sessions
│   └── TradeHistoryAnalysis.tsx     # View and analyze trades
├── lib/
│   └── sessionStorage.ts            # Storage utilities
└── pages/
    └── paper-trading/
        └── [session_id]/
            └── dashboard.tsx         # Main dashboard (updated)

backend/src/pages/api/paper-trading/
├── [session_id]/
│   ├── status.ts                    # Get session status (updated)
│   └── analysis.ts                  # New trade analysis endpoint
└── sessions.ts                      # List sessions (existing)
```

## Future Enhancements

Potential improvements to this system:

1. **Database Persistence**: Move alerts and analysis to database for permanent storage
2. **Real-time Notifications**: Browser push notifications for trade alerts
3. **Advanced Analytics**: Charts and graphs for performance visualization
4. **Strategy Comparison**: Compare multiple sessions side by side
5. **Risk Metrics**: Sharpe ratio, Sortino ratio, max drawdown tracking
6. **Performance Reports**: Automated weekly/monthly performance summaries
