# sentinel-mcp

MCP Server untuk AI-powered API testing — positive, negative, dan security testing langsung dari chat AI.

## Fitur

- **3 jenis testing**: positive (happy path), negative (edge case), security (SQLi, XSS, auth, dll)
- **Multi AI provider**: Ollama (local), Claude, OpenAI, Gemini — bisa switch per perintah
- **Auto report**: hasil analisis AI langsung disimpan sebagai Markdown
- **MCP native**: langsung dipakai dari Claude Desktop, Cursor, Windsurf, Cline

## Struktur Project

```
sentinel-mcp/
├── src/
│   ├── index.ts              # MCP server entry point
│   ├── types.ts              # Type definitions
│   ├── tools/
│   │   └── apiTest.ts        # MCP tool handlers
│   ├── runner/
│   │   ├── runner.ts         # HTTP test engine
│   │   └── loader.ts         # YAML config loader
│   ├── providers/
│   │   ├── factory.ts        # Provider resolver
│   │   ├── prompt.ts         # Shared prompt builder
│   │   ├── ollama.ts         # Ollama adapter
│   │   ├── claude.ts         # Claude adapter
│   │   ├── openai.ts         # OpenAI adapter
│   │   └── gemini.ts         # Gemini adapter
│   └── reports/
│       └── generator.ts      # Markdown report generator
├── tests/endpoints/
│   └── suite.yaml            # Definisi endpoint yang ditest
├── reports/                  # Output report (auto-created)
├── .env.example
└── claude_desktop_config.example.json
```

## Quick Start

### 1. Install dependencies

```bash
cd sentinel-mcp
npm install
```

### 2. Setup environment

```bash
cp .env.example .env
# Edit .env sesuai kebutuhanmu
```

### 3. Install Ollama (untuk local AI)

```bash
# macOS / Linux
curl -fsSL https://ollama.ai/install.sh | sh
ollama pull llama3
```

### 4. Definisikan endpoint di suite.yaml

Secara default, test config dimuat dari `suites/`, `tests/endpoints/suite.yaml`, atau lokasi default lainnya.
Edit file tersebut sesuai API kamu. Jika kamu memiliki test suite di luar project, kamu bisa memberikan _path_ langsung ke MCP via chat AI (mendukung single file config maupun satu directory khusus berisikan banyak konfigurasi).

### 5. Daftarkan ke Claude Desktop

Salin isi `claude_desktop_config.example.json` ke:
- macOS: `~/Library/Application Support/Claude/claude_desktop_config.json`
- Windows: `%APPDATA%\Claude\claude_desktop_config.json`

Ganti path absolut sesuai lokasi project kamu, lalu restart Claude Desktop.

## Cara Pakai di Chat (Contoh Prompt AI)

Kamu dapat menggunakan bahasa manusia secara natural di _AI client_ yang mendukung MCP (seperti Claude Desktop, Cline, Windsurf). Di balik layar, AI akan otomatis memilih tool yang relevan.

**1. Basic Testing (Menggunakan file config default):**
> "Tolong jalankan API test untuk semua endpoint saya"
> "Test endpoint login saja pakai gemini ya"
> "Coba run security test untuk sistem saya"

**2. Menggunakan File / Direktori Eksternal (`suite_dir` / `suite_file`):**
Jika konfigurasi test API kamu ada di folder project lain (di luar project Sentinel MCP), kamu tinggal beri tahu path-nya ke AI:
> "Test API saya menggunakan config di folder `/Users/nama/ProjectLain/api-suites/`"
> "Tolong jalankan security test berdasarkan file `/path/to/custom-project/suite.yaml`"

**3. Kombinasi:**
> "Bantu cek security untuk API payment saya yang ada di `/Users/dev/ecommerce/suites/`, gunakan provider klaude karena saya butuh analisa security tingkat tinggi."

**4. Mengatur Provider AI:**
> "Provider apa saja yang saat ini tersedia?"
> "Bisa switch ke openai untuk test endpoint register?"

## Security Testing yang Dilakukan

| Test | Deskripsi |
|------|-----------|
| No Auth | Akses endpoint tanpa Authorization header |
| SQL Injection | Payload `' OR 1=1--` dan variasinya |
| XSS | Payload `<script>alert(1)</script>` dan reflection check |
| Info Leak | Cek apakah error response bocorkan stack trace / SQL |
| Oversized Payload | Kirim 100KB payload untuk cek DoS resistance |

## Format Report

Report disimpan di folder `reports/` dengan nama `YYYY-MM-DD-[provider].md`.

Isi report:
- Skor keseluruhan (0-100)
- Ringkasan dari AI
- Daftar bug dengan severity dan rekomendasi fix
- Temuan keamanan dengan cara mitigasi
- Detail per endpoint (semua test case)

## Menambah Endpoint Baru

Edit `tests/endpoints/suite.yaml`:

```yaml
- name: nama-endpoint
  method: POST          # GET | POST | PUT | PATCH | DELETE
  path: /api/resource
  auth: true            # sertakan Authorization header?
  expectedStatus: 201
  body:
    field: value
  expectedFields:
    - id
    - name
```
