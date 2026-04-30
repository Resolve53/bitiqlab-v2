# Client Setup Guide - TradingView MCP Local Deployment

## Overview
Your strategy trading system runs in the cloud (Railway) but needs to connect to your TradingView Desktop. This guide sets up a local MCP server on your machine that creates a secure tunnel to the cloud backend.

**Cost: FREE** (Docker + ngrok free tier)

---

## Prerequisites

Before starting, ensure you have:

1. **TradingView Desktop** - Installed and running
2. **Docker Desktop** - Download from https://docker.com/products/docker-desktop
3. **Anthropic API Key** - Get from https://console.anthropic.com/
4. **ngrok Account** - Free account at https://ngrok.com/

---

## Step 1: Get Your API Keys

### Anthropic API Key
1. Go to https://console.anthropic.com/
2. Create account or log in
3. Go to API Keys section
4. Click "Create API Key"
5. Copy the key (starts with `sk-ant-`)

### ngrok Auth Token
1. Go to https://ngrok.com/
2. Sign up (free) or log in
3. Go to Dashboard → Your Authtoken
4. Copy the token

---

## Step 2: Clone and Setup Project

```bash
# 1. Get the project repository
git clone https://github.com/your-org/bitiqlab-v2.git
cd bitiqlab-v2

# 2. Create environment file
cp .env.client.example .env

# 3. Edit .env and add your keys
# - ANTHROPIC_API_KEY=sk-ant-xxx...
# - NGROK_AUTHTOKEN=xxx...
```

**Edit `.env` with your favorite text editor and add:**
```
ANTHROPIC_API_KEY=sk-ant-v1-YOUR_KEY_HERE
NGROK_AUTHTOKEN=YOUR_NGROK_TOKEN_HERE
```

---

## Step 3: Start Local MCP Server

```bash
# Start Docker containers
docker-compose up -d

# Check status
docker-compose ps

# View logs
docker-compose logs -f tradingview-mcp-local
```

Wait 30-60 seconds for the server to start.

---

## Step 4: Get Your Public URL

```bash
# Open ngrok dashboard
open http://localhost:4040

# Or in terminal, see the forwarding URL:
docker-compose logs ngrok
```

Look for output like:
```
Forwarding    https://1234-56-789-0.ngrok.io -> http://localhost:3000
```

Copy the `https://...` URL.

---

## Step 5: Configure Backend

Send your ngrok URL to your backend provider (or set it yourself if hosting):

**In Railway Dashboard:**
1. Go to your `bitiqlab-backend` service
2. Click **Variables**
3. Set: `TRADINGVIEW_MCP_URL=https://1234-56-789-0.ngrok.io`
4. Click **Save** and wait for redeploy (~2 min)

---

## Step 6: Verify Connection

```bash
# Test local MCP server
curl http://localhost:3000/health

# Should return:
# {"status":"ok","service":"tradingview-mcp"}

# Test from cloud (replace with your URL)
curl https://1234-56-789-0.ngrok.io/health
```

---

## How It Works

```
Your Dashboard (Cloud)
        ↓
Railway Backend (Cloud)
        ↓
ngrok Tunnel (Secure)
        ↓
Your Local MCP Server
        ↓
TradingView Desktop
        ↓
Binance Testnet (Paper Trading)
```

**Flow:**
1. You create a strategy in the cloud dashboard
2. Backend sends request to ngrok tunnel → your local MCP server
3. MCP generates Pine Script and deploys to your TradingView
4. TradingView sends signals → Backend executes trades on Binance testnet
5. Results appear in your dashboard

---

## Troubleshooting

### "Connection refused" error
```bash
# Make sure containers are running
docker-compose ps

# Should show both services as "Up"
# If not, restart
docker-compose restart
```

### ngrok keeps disconnecting
- Check internet connection
- Upgrade to ngrok paid plan if needed ($5/month)
- Restart containers: `docker-compose restart`

### MCP server not responding
```bash
# Check logs
docker-compose logs tradingview-mcp-local

# Restart
docker-compose restart tradingview-mcp-local
```

### TradingView not connecting
- Make sure TradingView Desktop is **running**
- Check firewall isn't blocking connections
- Restart Docker: `docker-compose down && docker-compose up -d`

---

## Keep It Running

To keep the local server running even after reboot:

### macOS / Linux
```bash
# Add to crontab
@reboot cd /path/to/bitiqlab-v2 && docker-compose up -d
```

### Windows
- Open Task Scheduler
- Create Basic Task
- Trigger: At startup
- Action: Run `docker-compose up -d` in project folder

---

## Support

If anything breaks:
1. Check logs: `docker-compose logs`
2. Restart: `docker-compose restart`
3. Nuclear option: `docker-compose down && docker-compose up -d`

---

## Costs

| Item | Cost |
|------|------|
| Docker | FREE |
| ngrok (free tier) | FREE |
| Anthropic API | Pay-as-you-go (~$0.01/strategy) |
| **Total** | **FREE + API usage** |

Upgrade to ngrok paid ($5-50/month) for production reliability if needed.

---

**Your system is now fully connected!** 🚀

Create a strategy in the dashboard and watch it auto-deploy to your TradingView.
