const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// Financial & Regulatory Parameters
const GRID_BUY_RATE = 8.00;      // TANGEDCO Retail Grid Tariff (₹/kWh)
const GRID_FEEDIN_RATE = 3.00;   // Government Solar Export Feed-in Tariff (₹/kWh)
const PLATFORM_FEE_PCT = 0.05;   // 5% Convenience Fee

let openOrders = [];
let tradeHistory = [];

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(JSON.stringify(data));
        }
    });
}

function matchOrders() {
    let sells = openOrders.filter(o => o.type === 'SELLER');
    let buys = openOrders.filter(o => o.type === 'BUYER');

    for (let sell of sells) {
        for (let buy of buys) {
            const sellPrice = Number(sell.price);
            const buyPrice = Number(buy.price);

            if (buyPrice >= sellPrice) {
                const matchedQty = Math.min(Number(sell.qty), Number(buy.qty));
                const clearingPrice = (sellPrice + buyPrice) / 2;
                const grossValue = matchedQty * clearingPrice;

                // Convenience Fee
                const sellerFee = grossValue * PLATFORM_FEE_PCT;
                const buyerFee = grossValue * PLATFORM_FEE_PCT;

                const sellerPayout = grossValue - sellerFee;
                const buyerTotal = grossValue + buyerFee;

                // Profit vs Government Grid Benchmarks
                // Seller benchmark: Exporting to Gov Grid earns GRID_FEEDIN_RATE (₹3.00/kWh)
                const govSellerEarning = matchedQty * GRID_FEEDIN_RATE;
                const sellerGainVsGov = sellerPayout - govSellerEarning;

                // Buyer benchmark: Buying from Gov Grid costs GRID_BUY_RATE (₹8.00/kWh)
                const govBuyerCost = matchedQty * GRID_BUY_RATE;
                const buyerSavingsVsGov = govBuyerCost - buyerTotal;

                const trade = {
                    tradeId: 'TXN-' + Math.floor(100000 + Math.random() * 900000),
                    seller: sell.userId,
                    buyer: buy.userId,
                    qty: matchedQty.toFixed(2),
                    clearingPrice: clearingPrice.toFixed(2),
                    grossValue: grossValue.toFixed(2),
                    sellerFee: sellerFee.toFixed(2),
                    buyerFee: buyerFee.toFixed(2),
                    sellerPayout: sellerPayout.toFixed(2),
                    buyerTotal: buyerTotal.toFixed(2),
                    sellerGainVsGov: sellerGainVsGov.toFixed(2),
                    buyerSavingsVsGov: buyerSavingsVsGov.toFixed(2),
                    timestamp: new Date().toLocaleTimeString()
                };

                tradeHistory.push(trade);

                // Update or clear matched orders
                sell.qty = (Number(sell.qty) - matchedQty).toFixed(2);
                buy.qty = (Number(buy.qty) - matchedQty).toFixed(2);
                openOrders = openOrders.filter(o => Number(o.qty) > 0);

                broadcast({ type: 'TRADE_MATCHED', data: trade });
                return;
            }
        }
    }
}

app.post('/api/order', (req, res) => {
    const { userId, type, qty, price } = req.body;
    if (!userId || !type || !qty || !price) {
        return res.status(400).json({ success: false, message: 'Missing order details.' });
    }

    openOrders.push({
        id: 'ORD-' + Math.floor(10000 + Math.random() * 9000),
        userId,
        type: type.toUpperCase(),
        qty: Number(qty).toFixed(2),
        price: Number(price).toFixed(2)
    });

    matchOrders();
    res.json({ success: true, message: 'Order submitted successfully.' });
});

server.listen(3000, () => {
    console.log('⚡ ShareEnergy.Co server active at http://localhost:3000');
});