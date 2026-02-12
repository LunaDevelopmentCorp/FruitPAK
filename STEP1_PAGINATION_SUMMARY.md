# Step 1: Pagination Implementation Summary

## Overview
Added pagination to all list endpoints in the FruitPAK backend API. All endpoints now return a consistent paginated response format with total count, limit, and offset information.

## Changes Made

### 1. New File: `backend/app/schemas/common.py`
Created a generic `PaginatedResponse` schema that can be used across all endpoints:

```python
class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int
    limit: int
    offset: int
```

### 2. Updated Routers

#### ✅ `backend/app/routers/batches.py`
- **Endpoint**: `GET /api/batches/`
- **Changes**:
  - Changed default limit from 100 to 50
  - Added total count query
  - Response model: `PaginatedResponse[BatchSummary]`
- **Query params**: `limit` (default: 50, max: 500), `offset` (default: 0)

#### ✅ `backend/app/routers/growers.py`
- **Endpoint**: `GET /api/growers/`
- **Changes**:
  - Added `limit` and `offset` query parameters
  - Added total count query
  - Added ordering by name
  - Response model: `PaginatedResponse[GrowerOut]`
- **Query params**: `limit` (default: 50, max: 500), `offset` (default: 0)

#### ✅ `backend/app/routers/packhouses.py`
- **Endpoint**: `GET /api/packhouses/`
- **Changes**:
  - Added `limit` and `offset` query parameters
  - Added total count query
  - Added ordering by name
  - Response model: `PaginatedResponse[PackhouseOut]`
- **Query params**: `limit` (default: 50, max: 500), `offset` (default: 0)

#### ✅ `backend/app/routers/payments.py`
- **Endpoint**: `GET /api/payments/grower`
- **Changes**:
  - Added `limit` and `offset` query parameters
  - Added total count query
  - Response model: `PaginatedResponse[GrowerPaymentOut]`
- **Query params**: `limit` (default: 50, max: 500), `offset` (default: 0)

#### ✅ `backend/app/routers/reconciliation.py`
- **Endpoint**: `GET /api/reconciliation/alerts`
- **Changes**:
  - Changed default limit from 100 to 50
  - Added total count query
  - Response model: `PaginatedResponse[AlertOut]`
- **Query params**: `limit` (default: 50, max: 500), `offset` (default: 0)

## Response Format

All paginated endpoints now return:

```json
{
  "items": [...],
  "total": 150,
  "limit": 50,
  "offset": 0
}
```

## Testing Instructions

### 1. Start the backend server
```bash
cd backend
source .venv/bin/activate  # or: . .venv/bin/activate
uvicorn app.main:app --reload
```

### 2. Test with curl (replace {access_token} with a valid JWT)

#### Test batches pagination
```bash
# Get first page (default: 50 items)
curl -H "Authorization: Bearer {access_token}" \
  http://localhost:8000/api/batches/

# Get second page
curl -H "Authorization: Bearer {access_token}" \
  "http://localhost:8000/api/batches/?limit=50&offset=50"

# Get smaller page size
curl -H "Authorization: Bearer {access_token}" \
  "http://localhost:8000/api/batches/?limit=10&offset=0"
```

#### Test growers pagination
```bash
curl -H "Authorization: Bearer {access_token}" \
  http://localhost:8000/api/growers/

curl -H "Authorization: Bearer {access_token}" \
  "http://localhost:8000/api/growers/?limit=20&offset=0"
```

#### Test packhouses pagination
```bash
curl -H "Authorization: Bearer {access_token}" \
  http://localhost:8000/api/packhouses/

curl -H "Authorization: Bearer {access_token}" \
  "http://localhost:8000/api/packhouses/?limit=20&offset=0"
```

#### Test payments pagination
```bash
curl -H "Authorization: Bearer {access_token}" \
  http://localhost:8000/api/payments/grower

curl -H "Authorization: Bearer {access_token}" \
  "http://localhost:8000/api/payments/grower?limit=25&offset=0"
```

#### Test reconciliation alerts pagination
```bash
curl -H "Authorization: Bearer {access_token}" \
  http://localhost:8000/api/reconciliation/alerts

curl -H "Authorization: Bearer {access_token}" \
  "http://localhost:8000/api/reconciliation/alerts?limit=30&offset=0"
```

### 3. Test with FastAPI Swagger UI
1. Navigate to `http://localhost:8000/docs`
2. Authenticate using the /api/auth/login endpoint
3. Click "Authorize" and paste your JWT token
4. Test each paginated endpoint with different `limit` and `offset` values

### 4. Verify Response Structure
Each response should contain:
- `items`: Array of results
- `total`: Total count of matching records
- `limit`: The limit parameter used
- `offset`: The offset parameter used

### 5. Test Edge Cases
```bash
# Test with limit = 1
curl -H "Authorization: Bearer {access_token}" \
  "http://localhost:8000/api/batches/?limit=1&offset=0"

# Test with offset beyond total
curl -H "Authorization: Bearer {access_token}" \
  "http://localhost:8000/api/batches/?limit=50&offset=9999"

# Test with maximum limit
curl -H "Authorization: Bearer {access_token}" \
  "http://localhost:8000/api/batches/?limit=500&offset=0"

# Test with filters + pagination (batches)
curl -H "Authorization: Bearer {access_token}" \
  "http://localhost:8000/api/batches/?status=pending&limit=10&offset=0"
```

## Dependencies
No new dependencies required. Uses existing:
- `sqlalchemy` for count queries
- `pydantic` for response models

## Backward Compatibility
⚠️ **Breaking Change**: Response format has changed from:
```json
[{...}, {...}]
```

to:
```json
{
  "items": [{...}, {...}],
  "total": 2,
  "limit": 50,
  "offset": 0
}
```

**Frontend Impact**: All API calls to these endpoints will need to be updated to access `response.items` instead of using the response directly as an array.

## Next Steps
✅ Step 1 complete. Frontend needs updating to handle new response format.

Ready for **Step 2: Add missing database indexes & TimescaleDB tuning**?
