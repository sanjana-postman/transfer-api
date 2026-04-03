const express = require('express');
const cors = require('cors');
const { faker } = require('@faker-js/faker');

const app = express();
const PORT = process.env.PORT || 8080;

// Enable CORS
app.use(cors());
app.use(express.json());

// Constants
const TRANSFER_TYPES = ['ach', 'wire', 'rtp'];
const TRANSFER_STATUSES = ['pending', 'processing', 'completed', 'failed', 'cancelled'];
const BANK_NAMES = ['Chase Bank', 'Bank of America', 'Wells Fargo', 'Citibank', 'PNC Bank', 'US Bank', 'TD Bank', 'Capital One', 'Ally Bank', 'First National Bank', 'Deutsche Bank', 'HSBC UK'];

// Helper functions to generate mock data
const generateTransferId = (type) => {
  const typePrefix = type ? type.toUpperCase() : faker.helpers.arrayElement(TRANSFER_TYPES).toUpperCase();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seq = faker.string.numeric(5).padStart(5, '0');
  return `TRF-${typePrefix}-${date}${seq}`;
};

const generateReference = (type) => {
  const typePrefix = type ? type.toUpperCase() : faker.helpers.arrayElement(TRANSFER_TYPES).toUpperCase();
  const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
  const seq = faker.string.numeric(3);
  return `REF-${typePrefix}-${date}-${seq}`;
};

const generateBeneficiaryId = (type) => {
  const typePrefix = type ? type.toUpperCase() : faker.helpers.arrayElement(TRANSFER_TYPES).toUpperCase();
  const seq = faker.string.numeric(5).padStart(5, '0');
  return `BEN-${typePrefix}-${seq}`;
};

const generateAccountId = () => {
  const seq = faker.string.numeric(10);
  const type = faker.helpers.arrayElement(['CHK', 'SAV', 'BUS']);
  return `AC-${seq}-${type}`;
};

const maskAccountNumber = () => `****${faker.string.numeric(4)}`;

// Generate a single transfer object
const generateTransfer = (options = {}) => {
  const type = options.type || faker.helpers.arrayElement(TRANSFER_TYPES);
  const status = options.status || faker.helpers.arrayElement(TRANSFER_STATUSES);
  const transferId = options.transferId || generateTransferId(type);

  // Fee structure based on type
  const fees = {
    ach: 0.00,
    wire: type === 'wire' ? (faker.datatype.boolean() ? 25.00 : 45.00) : 25.00,
    rtp: parseFloat(faker.helpers.arrayElement(['0.00', '0.50', '2.50']))
  };

  const createdAt = options.createdAt || faker.date.recent({ days: 30 }).toISOString();
  const baseDate = new Date(createdAt);

  const transfer = {
    transferId,
    type,
    status,
    amount: options.amount || parseFloat(faker.finance.amount({ min: 50, max: 75000, dec: 2 })),
    currency: options.currency || 'USD',
    fee: fees[type] || 0.00,
    sourceAccount: {
      accountId: options.sourceAccountId || generateAccountId(),
      accountNumber: maskAccountNumber()
    },
    destination: {
      beneficiaryId: options.beneficiaryId || generateBeneficiaryId(type),
      accountHolder: faker.company.name() || faker.person.fullName(),
      accountNumber: maskAccountNumber(),
      bankName: faker.helpers.arrayElement(BANK_NAMES)
    },
    memo: options.memo || faker.helpers.arrayElement([
      'Invoice payment',
      'Monthly rent payment',
      'Utility bill',
      'Insurance premium',
      'Vendor payment',
      'Equipment purchase',
      'Service fee',
      'Supplier payment'
    ]),
    reference: generateReference(type),
    createdAt
  };

  // Add scheduledDate for pending transfers
  if (status === 'pending' && faker.datatype.boolean()) {
    transfer.scheduledDate = faker.date.soon({ days: 14, refDate: baseDate }).toISOString().slice(0, 10);
  }

  // Add estimated arrival for processing/pending
  if (status === 'pending' || status === 'processing') {
    const daysToAdd = type === 'ach' ? 3 : type === 'wire' ? 2 : 0;
    const arrivalDate = new Date(baseDate);
    arrivalDate.setDate(arrivalDate.getDate() + daysToAdd);
    transfer.estimatedArrival = arrivalDate.toISOString().slice(0, 10);
  }

  // Add completedAt for completed transfers
  if (status === 'completed') {
    const completionTime = type === 'rtp' ? 2000 : faker.number.int({ min: 3600000, max: 259200000 }); // RTP: 2 seconds, others: 1 hour to 3 days
    transfer.completedAt = new Date(baseDate.getTime() + completionTime).toISOString();
    transfer.estimatedArrival = transfer.completedAt.slice(0, 10);

    // Add fedReference for completed wire transfers
    if (type === 'wire') {
      transfer.fedReference = faker.string.numeric(18);
    }
    // Add rtpMessageId for completed RTP transfers
    if (type === 'rtp') {
      transfer.rtpMessageId = `RTP${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${faker.string.numeric(12)}`;
    }
  }

  // Add failure info for failed transfers
  if (status === 'failed') {
    transfer.failedAt = new Date(baseDate.getTime() + faker.number.int({ min: 60000, max: 86400000 })).toISOString();
    const failureCodes = type === 'ach'
      ? [{ code: 'R03', message: 'No account/unable to locate account' }, { code: 'R04', message: 'Invalid account number' }, { code: 'R01', message: 'Insufficient funds' }]
      : [{ code: 'AC06', message: 'Account blocked or closed' }, { code: 'AC04', message: 'Account closed' }, { code: 'NARR', message: 'Narrative reason provided by bank' }];
    transfer.failureReason = faker.helpers.arrayElement(failureCodes);
  }

  // Add cancellation info for cancelled transfers
  if (status === 'cancelled') {
    transfer.cancelledAt = new Date(baseDate.getTime() + faker.number.int({ min: 60000, max: 3600000 })).toISOString();
    transfer.cancellationReason = 'Cancelled by customer request';
  }

  // Add SWIFT code and country for international wire transfers
  if (type === 'wire' && faker.datatype.boolean(0.3)) {
    transfer.destination.swiftCode = faker.string.alpha({ length: 8, casing: 'upper' });
    transfer.destination.country = faker.helpers.arrayElement(['Germany', 'UK', 'France', 'Japan', 'Canada']);
  }

  return transfer;
};

// Generate transfer list with pagination
const generateTransferList = (queryParams) => {
  const limit = Math.min(parseInt(queryParams.limit) || 20, 100);
  const offset = parseInt(queryParams.offset) || 0;
  const total = faker.number.int({ min: 10, max: 100 });
  const itemCount = Math.min(limit, Math.max(0, total - offset));

  const data = Array.from({ length: itemCount }, () => {
    const options = {};
    if (queryParams.status) options.status = queryParams.status;
    if (queryParams.type) options.type = queryParams.type;
    return generateTransfer(options);
  });

  // Sort by createdAt descending (most recent first)
  data.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  return {
    data,
    pagination: {
      total,
      limit,
      offset,
      hasMore: offset + limit < total
    }
  };
};

// Calculate estimated delivery based on transfer type
const calculateEstimatedDelivery = (type) => {
  const now = new Date();
  let deliveryDate = new Date(now);

  switch (type) {
    case 'rtp':
      // Instant - same day
      break;
    case 'wire':
      // Same day for domestic, 1-2 days for international
      deliveryDate.setDate(deliveryDate.getDate() + faker.helpers.arrayElement([0, 1, 2]));
      break;
    case 'ach':
    default:
      // 1-3 business days
      deliveryDate.setDate(deliveryDate.getDate() + faker.number.int({ min: 1, max: 3 }));
      break;
  }

  return deliveryDate.toISOString().slice(0, 10);
};

// Calculate fees based on transfer type and amount
const calculateTransferFees = (type, amount, destinationCountry) => {
  let transferFee = 0;
  let exchangeRate = null;
  let exchangeFee = null;
  let deliverySpeed = '';

  switch (type) {
    case 'ach':
      transferFee = 0.00;
      deliverySpeed = '1-3 business days';
      break;
    case 'wire':
      if (destinationCountry && destinationCountry !== 'US') {
        transferFee = 45.00;
        exchangeRate = faker.number.float({ min: 0.8, max: 1.2, fractionDigits: 2 });
        exchangeFee = 15.00;
        deliverySpeed = '1-2 business days';
      } else {
        transferFee = 25.00;
        deliverySpeed = 'Same business day';
      }
      break;
    case 'rtp':
      transferFee = amount > 1000 ? 2.50 : (amount > 0 ? 0.50 : 0.00);
      deliverySpeed = 'Instant (seconds)';
      break;
  }

  const totalFees = transferFee + (exchangeFee || 0);

  return {
    transferFee,
    exchangeRate,
    exchangeFee,
    totalFees,
    estimatedDelivery: calculateEstimatedDelivery(type),
    deliverySpeed
  };
};

// Mock authentication middleware (disabled for testing - accepts all requests)
const authMiddleware = (req, res, next) => {
  // Skip auth check for mock server - always allow requests
  next();
};

// =====================
// ROUTES
// =====================

// GET /transfers - List transfers
app.get('/transfers', authMiddleware, (req, res) => {
  const result = generateTransferList(req.query);
  res.json(result);
});

// POST /transfers - Initiate transfer
app.post('/transfers', authMiddleware, (req, res) => {
  const { sourceAccountId, beneficiaryId, amount, currency, type, memo, scheduledDate } = req.body;

  // Validate required fields
  if (!sourceAccountId || !beneficiaryId || !amount || !type) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Missing required fields',
      details: [
        !sourceAccountId && { field: 'sourceAccountId', reason: 'Source account ID is required' },
        !beneficiaryId && { field: 'beneficiaryId', reason: 'Beneficiary ID is required' },
        !amount && { field: 'amount', reason: 'Amount is required' },
        !type && { field: 'type', reason: 'Transfer type is required' }
      ].filter(Boolean)
    });
  }

  // Validate transfer type
  if (!TRANSFER_TYPES.includes(type)) {
    return res.status(400).json({
      code: 'INVALID_TRANSFER_TYPE',
      message: 'Invalid transfer type',
      details: [{ field: 'type', reason: `Transfer type must be one of: ${TRANSFER_TYPES.join(', ')}` }]
    });
  }

  const fees = calculateTransferFees(type, amount);
  const status = type === 'rtp' ? 'completed' : (scheduledDate ? 'pending' : 'processing');
  const createdAt = new Date().toISOString();

  const transfer = {
    transferId: generateTransferId(type),
    type,
    status,
    amount: parseFloat(amount),
    currency: currency || 'USD',
    fee: fees.transferFee,
    sourceAccount: {
      accountId: sourceAccountId,
      accountNumber: maskAccountNumber()
    },
    destination: {
      beneficiaryId,
      accountHolder: faker.company.name() || faker.person.fullName(),
      accountNumber: maskAccountNumber(),
      bankName: faker.helpers.arrayElement(BANK_NAMES)
    },
    memo: memo || '',
    reference: generateReference(type),
    createdAt,
    estimatedArrival: fees.estimatedDelivery
  };

  if (scheduledDate) {
    transfer.scheduledDate = scheduledDate;
  }

  if (status === 'completed') {
    transfer.completedAt = new Date(new Date(createdAt).getTime() + 2000).toISOString(); // 2 seconds for RTP
    if (type === 'rtp') {
      transfer.rtpMessageId = `RTP${new Date().toISOString().slice(0, 10).replace(/-/g, '')}${faker.string.numeric(12)}`;
    }
  }

  res.status(201).json(transfer);
});

// GET /transfers/:transferId - Get transfer details
app.get('/transfers/:transferId', authMiddleware, (req, res) => {
  const { transferId } = req.params;

  // Extract type from transferId if possible
  let type = 'ach';
  if (transferId.includes('-ACH-')) type = 'ach';
  else if (transferId.includes('-WIRE-')) type = 'wire';
  else if (transferId.includes('-RTP-')) type = 'rtp';

  const transfer = generateTransfer({ transferId, type });
  res.json(transfer);
});

// POST /transfers/:transferId/cancel - Cancel transfer
app.post('/transfers/:transferId/cancel', authMiddleware, (req, res) => {
  const { transferId } = req.params;

  // Extract type from transferId
  let type = 'ach';
  if (transferId.includes('-ACH-')) type = 'ach';
  else if (transferId.includes('-WIRE-')) type = 'wire';
  else if (transferId.includes('-RTP-')) type = 'rtp';

  // Always return success for mock server
  const cancelledAt = new Date().toISOString();
  const transfer = {
    transferId,
    type,
    status: 'cancelled',
    amount: parseFloat(faker.finance.amount({ min: 500, max: 25000, dec: 2 })),
    currency: 'USD',
    fee: 0.00,
    sourceAccount: {
      accountId: generateAccountId(),
      accountNumber: maskAccountNumber()
    },
    destination: {
      beneficiaryId: generateBeneficiaryId(type),
      accountHolder: faker.company.name(),
      accountNumber: maskAccountNumber(),
      bankName: faker.helpers.arrayElement(BANK_NAMES)
    },
    memo: faker.helpers.arrayElement(['Service payment - cancelled', 'Equipment purchase - cancelled', 'Annual subscription - cancelled']),
    reference: generateReference(type),
    createdAt: faker.date.recent({ days: 1 }).toISOString(),
    cancelledAt,
    cancellationReason: 'Cancelled by customer request'
  };
  return res.json(transfer);
});

// POST /transfers/validate - Validate transfer
app.post('/transfers/validate', authMiddleware, (req, res) => {
  const { sourceAccountId, beneficiaryId, amount, currency, type, memo } = req.body;

  const fees = calculateTransferFees(type || 'ach', amount || 0);

  // Always return valid for mock server
  return res.json({
    valid: true,
    errors: [],
    warnings: [],
    fees: {
      transferFee: fees.transferFee,
      totalFees: fees.totalFees
    },
    estimatedDelivery: fees.estimatedDelivery
  });
});

// POST /transfers/fees - Calculate transfer fees
app.post('/transfers/fees', authMiddleware, (req, res) => {
  const { amount, type, currency, destinationCountry } = req.body;

  // Validate required fields
  if (amount === undefined || !type) {
    return res.status(400).json({
      code: 'VALIDATION_ERROR',
      message: 'Missing required fields',
      details: [
        amount === undefined && { field: 'amount', reason: 'Amount is required' },
        !type && { field: 'type', reason: 'Transfer type is required' }
      ].filter(Boolean)
    });
  }

  if (!TRANSFER_TYPES.includes(type)) {
    return res.status(400).json({
      code: 'INVALID_TRANSFER_TYPE',
      message: 'Invalid transfer type',
      details: [{ field: 'type', reason: `Transfer type must be one of: ${TRANSFER_TYPES.join(', ')}` }]
    });
  }

  const fees = calculateTransferFees(type, amount, destinationCountry);

  const response = {
    transferFee: fees.transferFee,
    exchangeRate: fees.exchangeRate,
    exchangeFee: fees.exchangeFee,
    totalFees: fees.totalFees,
    estimatedDelivery: fees.estimatedDelivery,
    deliverySpeed: fees.deliverySpeed
  };

  // Add recipient receives info for international transfers
  if (destinationCountry && destinationCountry !== 'US' && fees.exchangeRate) {
    response.recipientReceives = {
      amount: parseFloat((amount * fees.exchangeRate).toFixed(2)),
      currency: faker.helpers.arrayElement(['EUR', 'GBP', 'JPY', 'CAD'])
    };
  }

  // Add note for large RTP amounts
  if (type === 'rtp' && amount > 1000) {
    response.note = 'Amounts over $1,000 incur higher RTP fees';
  }

  res.json(response);
});


// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    code: 'NOT_FOUND',
    message: 'The requested resource was not found'
  });
});

// Error handler
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: 'An internal server error occurred'
  });
});

// Export app for testing
module.exports = app;

// Only start server if this file is run directly Added the new endpoint here
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`🚀 Transfers API Mock Server running on http://localhost:${PORT}`);
    console.log(`\nAvailable endpoints:`);
    console.log(`  GET  /transfers                    - List transfers`);
    console.log(`  POST /transfers                    - Initiate transfer`);
    console.log(`  GET  /transfers/:transferId        - Get transfer details`);
    console.log(`  POST /transfers/:transferId/cancel - Cancel transfer`);
    console.log(`  POST /transfers/validate           - Validate transfer`);
    console.log(`  POST /transfers/fees               - Calculate transfer fees`);
    console.log(`  GET  /health                       - Health check`);
    console.log(`\nNote: All endpoints except /health require Bearer token authentication`);
  });
}
