# Money Transfer API 

A mock API server for money transfer operations supporting ACH, Wire, and Real-Time Payment (RTP) transfers. This server provides a realistic simulation of transfer operations for development and testing purposes.

## Features

- **Multiple Transfer Types**: Support for ACH, Wire, and RTP transfers
- **Transfer Management**: Create, list, view, and cancel transfers
- **Fee Calculation**: Calculate fees for different transfer types and amounts
- **Payment Rails Comparison**: Get quotes for all available payment rails
- **Transfer Validation**: Validate transfer requests before submission
- **Mock Data Generation**: Uses Faker.js to generate realistic transfer data
- **Status Tracking**: Track transfer statuses (pending, processing, completed, failed, cancelled)
- **International Support**: Handle international wire transfers with currency conversion

## Transfer Types

- **ACH**: Standard domestic transfers (1-3 business days, $0 fee)
- **Wire**: Same-day domestic ($25) and international ($45) transfers
- **RTP**: Real-time payments (instant, $0.50 for amounts ≤ $1,000, $2.50 for amounts > $1,000)

## Prerequisites

- Node.js 20.x or higher
- npm or yarn

## Installation

1. Clone the repository:
```bash
git clone https://github.com/sanjana-postman/transfer-api.git
cd transfer-api
```

2. Install dependencies:
```bash
npm install
```

## Usage

### Start the Server

```bash
npm start
```

The server will start on `http://localhost:8080` by default. You can change the port by setting the `PORT` environment variable:

```bash
PORT=3000 npm start
```

### Development Mode (with auto-reload)

```bash
npm run dev
```

## API Endpoints

### Health Check
- **GET** `/health` - Check server health status

### Transfers

- **GET** `/transfers` - List all transfers
  - Query parameters:
    - `limit` (optional): Number of results per page (default: 20, max: 100)
    - `offset` (optional): Pagination offset (default: 0)
    - `status` (optional): Filter by status (pending, processing, completed, failed, cancelled)
    - `type` (optional): Filter by type (ach, wire, rtp)

- **POST** `/transfers` - Initiate a new transfer
  - Request body:
    ```json
    {
      "sourceAccountId": "AC-1234567890-CHK",
      "beneficiaryId": "BEN-ACH-00123",
      "amount": 1000.00,
      "currency": "USD",
      "type": "ach",
      "memo": "Invoice payment",
      "scheduledDate": "2024-12-25" // optional
    }
    ```

- **GET** `/transfers/:transferId` - Get transfer details by ID

- **POST** `/transfers/:transferId/cancel` - Cancel a transfer

- **POST** `/transfers/validate` - Validate a transfer request
  - Request body:
    ```json
    {
      "sourceAccountId": "AC-1234567890-CHK",
      "beneficiaryId": "BEN-ACH-00123",
      "amount": 1000.00,
      "currency": "USD",
      "type": "ach"
    }
    ```

- **POST** `/transfers/fees` - Calculate transfer fees
  - Request body:
    ```json
    {
      "amount": 1000.00,
      "type": "ach",
      "currency": "USD",
      "destinationCountry": "US" // optional, for international transfers
    }
    ```

- **POST** `/transfers/rails-quote` - Get quotes for all payment rails
  - Request body:
    ```json
    {
      "amount": 1000.00,
      "currency": "USD",
      "beneficiaryId": "BEN-ACH-00123", // optional
      "destinationCountry": "US" // optional
    }
    ```

## Authentication

All endpoints except `/health` require Bearer token authentication. For this mock server, authentication is disabled for testing purposes - all requests are accepted.

## Testing

### Run Unit Tests

```bash
npm test
```

### Run Tests in Watch Mode

```bash
npm run test:watch
```

### Generate Coverage Report

```bash
npm run test:coverage
```

### Postman Collection Tests

This repository includes Postman collections for functional testing:

- **Transfers API**: Main API collection
- **Transfers API Functional Tests**: Comprehensive functional test suite

To run Postman tests:

1. Import the collections from `postman/collections/`
2. Import the environments from `postman/environments/`
3. Run the collections using Postman CLI or the Postman app

## Project Structure

```
.
├── server.js                 # Main Express server application
├── server.test.js            # Unit tests
├── jest.config.js            # Jest configuration
├── package.json              # Dependencies and scripts
├── postman/
│   ├── collections/          # Postman API collections
│   ├── environments/         # Postman environment files
│   └── specs/                # API specifications
├── .github/
│   └── workflows/            # CI/CD workflows
└── README.md                 # This file
```

## Development

### Code Style

The project uses Jest for testing with the following coverage thresholds:
- Branches: 70%
- Functions: 70%
- Lines: 70%
- Statements: 70%

### CI/CD

The repository includes GitHub Actions workflows for:
- **CI**: Linting and unit tests on pull requests
- **Functional Tests**: Postman collection tests
- **Deployment**: Environment-specific deployments

## Transfer Statuses

- `pending`: Transfer is scheduled or waiting to be processed
- `processing`: Transfer is currently being processed
- `completed`: Transfer has been successfully completed
- `failed`: Transfer failed due to an error
- `cancelled`: Transfer was cancelled by the user

## Error Responses

The API returns standard HTTP status codes:

- `200 OK`: Successful request
- `201 Created`: Resource created successfully
- `400 Bad Request`: Validation error or invalid input
- `404 Not Found`: Resource not found
- `500 Internal Server Error`: Server error

Error responses follow this format:
```json
{
  "code": "ERROR_CODE",
  "message": "Human-readable error message",
  "details": [
    {
      "field": "fieldName",
      "reason": "Specific reason for the error"
    }
  ]
}
```

## Mock Data

The server uses [Faker.js](https://fakerjs.dev/) to generate realistic mock data including:
- Transfer IDs (format: `TRF-{TYPE}-{DATE}{SEQ}`)
- Account numbers (masked for security)
- Bank names
- Beneficiary information
- Transfer amounts and fees
- Timestamps and dates

## License

ISC

## Support

For issues and questions:
- **Email**: api-support@financial.com
- **Issues**: [GitHub Issues](https://github.com/sanjana-postman/transfer-api/issues)

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Ensure all tests pass
6. Submit a pull request
