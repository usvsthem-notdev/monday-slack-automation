#!/bin/bash

# Test Script for Monday.com → Slack Automation
# This script tests the scheduled automation by triggering it manually

echo "🧪 Testing Monday.com → Slack Automation"
echo "=========================================="
echo ""

# Check if service is healthy
echo "1️⃣  Checking service health..."
HEALTH_RESPONSE=$(curl -s https://monday-slack-automation.onrender.com/health)
echo "$HEALTH_RESPONSE" | jq '.' 2>/dev/null || echo "$HEALTH_RESPONSE"

if echo "$HEALTH_RESPONSE" | grep -q '"status":"ok"'; then
    echo "✅ Service is healthy!"
else
    echo "❌ Service health check failed"
    exit 1
fi

echo ""
echo "2️⃣  Triggering automation..."
TRIGGER_RESPONSE=$(curl -s -X POST https://monday-slack-automation.onrender.com/trigger)
echo "$TRIGGER_RESPONSE" | jq '.' 2>/dev/null || echo "$TRIGGER_RESPONSE"

if echo "$TRIGGER_RESPONSE" | grep -q '"status":"triggered"'; then
    echo "✅ Automation triggered successfully!"
else
    echo "❌ Failed to trigger automation"
    exit 1
fi

echo ""
echo "3️⃣  Waiting 5 seconds for automation to complete..."
sleep 5

echo ""
echo "4️⃣  Checking metrics..."
METRICS_RESPONSE=$(curl -s https://monday-slack-automation.onrender.com/metrics)
echo "$METRICS_RESPONSE" | jq '.' 2>/dev/null || echo "$METRICS_RESPONSE"

echo ""
echo "=========================================="
echo "✅ Test completed!"
echo ""
echo "📬 Check Slack for the task summary message"
echo "📊 View logs at: https://dashboard.render.com"
echo "📈 View GitHub Actions at: https://github.com/usvsthem-notdev/monday-slack-automation/actions"
