const http = require("http");

const server = http.createServer((req, res) => {
  const method = req.method;
  const url = req.url.split("?")[0];

  // Helper to send JSON response
  function sendJSON(statusCode, body) {
    const payload = JSON.stringify(body, null, 2);
    res.writeHead(statusCode, {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    });
    res.end(payload);
  }

  // Handle CORS preflight
  if (method === "OPTIONS") {
    res.writeHead(204, {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, Accept",
    });
    res.end();
    return;
  }

  // Read request body helper
  function readBody(callback) {
    let body = "";
    req.on("data", (chunk) => { body += chunk.toString(); });
    req.on("end", () => {
      try { callback(JSON.parse(body)); }
      catch (e) { callback({}); }
    });
  }

  // Route: POST /transfers/fees — Calculate transfer fees
  // @endpoint POST /transfers/fees
  if (method === "POST" && url === "/transfers/fees") {
    readBody((body) => {
      const amount = body.amount || 1000;
      const type = body.type || "ach";
      const feeRates = { ach: 0.005, wire: 0.015, rtp: 0.01 };
      const rate = feeRates[type] || 0.01;
      sendJSON(200, {
        amount: amount,
        type: type,
        currency: body.currency || "USD",
        fee: parseFloat((amount * rate).toFixed(2)),
        feeBreakdown: {
          baseFee: parseFloat((amount * rate * 0.6).toFixed(2)),
          processingFee: parseFloat((amount * rate * 0.4).toFixed(2)),
        },
        estimatedDelivery: type === "rtp" ? "Instant" : type === "wire" ? "Same day" : "1-3 business days",
      });
    });
    return;
  }

  // Route: POST /transfers/rails-quote — Get quote for all payment rails
  // @endpoint POST /transfers/rails-quote
  if (method === "POST" && url === "/transfers/rails-quote") {
    readBody((body) => {
      const amount = parseFloat(body.amount) || 1000;
      sendJSON(200, {
        amount: amount,
        currency: body.currency || "USD",
        beneficiaryId: body.beneficiaryId || "BEN123456789",
        quotes: [
          {
            rail: "ach",
            fee: parseFloat((amount * 0.005).toFixed(2)),
            estimatedDelivery: "1-3 business days",
            available: true,
          },
          {
            rail: "wire",
            fee: parseFloat((amount * 0.015).toFixed(2)),
            estimatedDelivery: "Same day",
            available: true,
          },
          {
            rail: "rtp",
            fee: parseFloat((amount * 0.01).toFixed(2)),
            estimatedDelivery: "Instant",
            available: true,
          },
        ],
      });
    });
    return;
  }

  // Route: POST /transfers/validate — Validate transfer
  // @endpoint POST /transfers/validate
  if (method === "POST" && url === "/transfers/validate") {
    readBody((body) => {
      const errors = [];
      if (!body.sourceAccountId) errors.push({ field: "sourceAccountId", message: "Source account ID is required" });
      if (!body.beneficiaryId) errors.push({ field: "beneficiaryId", message: "Beneficiary ID is required" });
      if (!body.amount || body.amount <= 0) errors.push({ field: "amount", message: "Amount must be greater than 0" });
      if (!body.currency) errors.push({ field: "currency", message: "Currency is required" });

      if (errors.length > 0) {
        sendJSON(422, { valid: false, errors });
      } else {
        sendJSON(200, {
          valid: true,
          transferId: null,
          validatedAt: new Date().toISOString(),
          details: {
            sourceAccountId: body.sourceAccountId,
            beneficiaryId: body.beneficiaryId,
            amount: body.amount,
            currency: body.currency,
            type: body.type || "ach",
          },
        });
      }
    });
    return;
  }

  // Route: POST /transfers — Initiate transfer
  // @endpoint POST /transfers
  if (method === "POST" && url === "/transfers") {
    readBody((body) => {
      const transferId = "TXN" + Date.now();
      sendJSON(201, {
        transferId,
        status: "pending",
        sourceAccountId: body.sourceAccountId || "AC12345678901234",
        beneficiaryId: body.beneficiaryId || "BEN123456789",
        amount: body.amount || 1500,
        currency: body.currency || "USD",
        type: body.type || "rtp",
        memo: body.memo || "",
        scheduledDate: body.scheduledDate || new Date().toISOString().split("T")[0],
        createdAt: new Date().toISOString(),
        estimatedDelivery: body.type === "rtp" ? "Instant" : body.type === "wire" ? "Same day" : "1-3 business days",
        fee: parseFloat(((body.amount || 1500) * 0.01).toFixed(2)),
      });
    });
    return;
  }

  // Route: GET /transfers — List transfers
  // @endpoint GET /transfers
  if (method === "GET" && url === "/transfers") {
    sendJSON(200, {
      transfers: [
        {
          transferId: "TXN1001",
          status: "completed",
          sourceAccountId: "AC12345678901234",
          beneficiaryId: "BEN123456789",
          amount: 1500,
          currency: "USD",
          type: "rtp",
          createdAt: "2024-01-15T10:30:00Z",
          completedAt: "2024-01-15T10:30:05Z",
        },
        {
          transferId: "TXN1002",
          status: "pending",
          sourceAccountId: "AC12345678901234",
          beneficiaryId: "BEN987654321",
          amount: 5000,
          currency: "USD",
          type: "wire",
          createdAt: "2024-01-16T09:00:00Z",
          completedAt: null,
        },
        {
          transferId: "TXN1003",
          status: "completed",
          sourceAccountId: "AC12345678901234",
          beneficiaryId: "BEN555444333",
          amount: 250,
          currency: "USD",
          type: "ach",
          createdAt: "2024-01-14T14:00:00Z",
          completedAt: "2024-01-17T08:00:00Z",
        },
      ],
      total: 3,
      page: 1,
      pageSize: 20,
    });
    return;
  }

  // Route: GET /transfers/:transferId — Get transfer details
  // @endpoint GET /transfers/:transferId
  const transferDetailMatch = url.match(/^\/transfers\/([^/]+)$/);
  if (method === "GET" && transferDetailMatch) {
    const transferId = transferDetailMatch[1];
    sendJSON(200, {
      transferId,
      status: "completed",
      sourceAccountId: "AC12345678901234",
      beneficiaryId: "BEN123456789",
      amount: 1500,
      currency: "USD",
      type: "rtp",
      memo: "Invoice payment",
      scheduledDate: "2024-01-15",
      createdAt: "2024-01-15T10:30:00Z",
      completedAt: "2024-01-15T10:30:05Z",
      fee: 15.00,
      estimatedDelivery: "Instant",
    });
    return;
  }

  // Route: POST /transfers/:transferId/cancel — Cancel transfer
  // @endpoint POST /transfers/:transferId/cancel
  const cancelMatch = url.match(/^\/transfers\/([^/]+)\/cancel$/);
  if (method === "POST" && cancelMatch) {
    const transferId = cancelMatch[1];
    sendJSON(200, {
      transferId,
      status: "cancelled",
      cancelledAt: new Date().toISOString(),
      message: "Transfer has been successfully cancelled.",
    });
    return;
  }

  // 404 fallback
  sendJSON(404, {
    error: "Not Found",
    message: `No route matched: ${method} ${url}`,
  });
});

server.listen(process.env.PORT || 3000, () => {
  console.log(`Transfer API Mock server running on port ${process.env.PORT || 3000}`);
});
