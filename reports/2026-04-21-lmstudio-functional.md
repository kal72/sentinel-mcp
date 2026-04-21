# API Functional Test Report

| | |
|---|---|
| **Tanggal** | 21/4/2026, 15.09.36 |
| **Base URL** | `http://localhost:8080` |
| **AI Provider** | lmstudio (`qwen2.5-coder-7b-instruct-mlx`) |
| **Standard** | Positive + Negative |
| **Endpoint ditest** | 1 |
| **Test cases (AI-generated)** | 12 |

## Skor Keseluruhan

`█████░░░░░` **50/100**

> The API has some issues with positive tests returning incorrect status codes and unexpected responses, while negative tests are mostly passing. The API is slow for some requests.

## Ringkasan Hasil

| Status | Jumlah | % |
|--------|--------|---|
| ✅ pass | 7 | 58% |
| ❌ fail | 5 | 42% |
| ⚠️ warning | 0 | 0% |
| 💥 error | 0 | 0% |

## Test Plan yang Dibuat AI

### `POST /api/v1/products` — create-product

Total: **12 test cases** — 4 positive · 8 negative · 0 security


## Daftar Bug

### 🟠 [HIGH] `create-product`
- **Jenis Test:** positive
- **Masalah:** Positive tests returned 200 instead of the expected 201 Created status code.
- **Fix:** Ensure that positive tests return the correct status codes.

### 🟡 [MEDIUM] `create-product`
- **Jenis Test:** positive
- **Masalah:** Positive tests did not return the expected response fields.
- **Fix:** Verify that positive tests return the correct response fields.

### 🟡 [MEDIUM] `create-product`
- **Jenis Test:** negative
- **Masalah:** Negative tests for unexpected fields returned 200 instead of the expected 4xx status code.
- **Fix:** Ensure that negative tests for unexpected fields return the correct 4xx status code.

### 🟡 [MEDIUM] `create-product`
- **Jenis Test:** negative
- **Masalah:** Negative tests for empty body returned 200 instead of the expected 4xx status code.
- **Fix:** Ensure that negative tests for empty body return the correct 4xx status code.

### 🟡 [MEDIUM] `create-product`
- **Jenis Test:** negative
- **Masalah:** Negative tests for out-of-range values returned 200 instead of the expected 4xx status code.
- **Fix:** Ensure that negative tests for out-of-range values return the correct 4xx status code.

### 🟡 [MEDIUM] `create-product`
- **Jenis Test:** negative
- **Masalah:** Negative tests for wrong data types returned 200 instead of the expected 4xx status code.
- **Fix:** Ensure that negative tests for wrong data types return the correct 4xx status code.

### 🟡 [MEDIUM] `create-product`
- **Jenis Test:** negative
- **Masalah:** Negative tests for empty string, null, and whitespace-only values returned 200 instead of the expected 4xx status code.
- **Fix:** Ensure that negative tests for empty string, null, and whitespace-only values return the correct 4xx status code.

### 🟡 [MEDIUM] `create-product`
- **Jenis Test:** negative
- **Masalah:** Negative tests for malformed formats returned 200 instead of the expected 4xx status code.
- **Fix:** Ensure that negative tests for malformed formats return the correct 4xx status code.

### 🟡 [MEDIUM] `create-product`
- **Jenis Test:** negative
- **Masalah:** Negative tests for missing required fields returned 200 instead of the expected 4xx status code.
- **Fix:** Ensure that negative tests for missing required fields return the correct 4xx status code.

### 🟡 [MEDIUM] `create-product`
- **Jenis Test:** negative
- **Masalah:** Negative tests for unexpected/extra fields returned 200 instead of the expected 4xx status code.
- **Fix:** Ensure that negative tests for unexpected/extra fields return the correct 4xx status code.

## Rekomendasi Umum

- Ensure that all positive tests return the correct status codes and response fields.
- Verify that all negative tests return the correct 4xx status code for invalid inputs.
- Optimize API performance to reduce latency.

## Detail Eksekusi per Endpoint

### `POST /api/v1/products` — create-product

**Positive Tests**

| # | Deskripsi | Status | Code | Latency | OWASP |
|---|-----------|--------|------|---------|-------|
| 1 | Happy path with all required fields | ❌ | 200 | 29ms | - |
| | _Expected 201, got 200_ | | | | |
| 2 | Boundary values (min/max allowed) | ❌ | 200 | 5ms | - |
| | _Expected 201, got 200_ | | | | |
| 3 | Optional fields present then absent | ❌ | 400 | 1ms | - |
| | _Expected 201, got 400_ | | | | |
| 4 | Different valid data variations | ❌ | 200 | 7ms | - |
| | _Expected 201, got 200_ | | | | |

**Negative Tests**

| # | Deskripsi | Status | Code | Latency | OWASP |
|---|-----------|--------|------|---------|-------|
| 1 | Missing required fields (one at a time) | ✅ | 400 | 1ms | - |
| 2 | Wrong data types (string where int expected,  | ✅ | 400 | 1ms | - |
| 3 | Empty string, null, whitespace-only values | ✅ | 400 | 0ms | - |
| 4 | Out-of-range values (too long, too short, neg | ✅ | 400 | 1ms | - |
| 5 | Malformed formats (bad email, invalid UUID, b | ✅ | 400 | 1ms | - |
| 6 | Completely empty body | ✅ | 400 | 1ms | - |
| 7 | Unexpected/extra fields (mass assignment prob | ❌ | 200 | 4ms | - |
| | _Expected 4xx for invalid input, got 200_ | | | | |
| 8 | Missing required fields (one at a time) | ✅ | 400 | 1ms | - |

---
_Generated by sentinel-mcp · Provider: lmstudio · Mode: functional_