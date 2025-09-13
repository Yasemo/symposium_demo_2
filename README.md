# Symposium Demo - Auto-Provisioning Cloud Application

A Deno-based web application with secure content execution in isolates, featuring automatic GCP service provisioning and comprehensive resource monitoring.

## 🚀 Features

- **Secure Content Execution**: Run user-generated HTML/CSS/JS in isolated Web Workers
- **Auto-Provisioning**: Automatically creates GCP services (Cloud SQL, Memorystore, Cloud Storage)
- **Resource Monitoring**: Real-time tracking of CPU, memory, and isolate usage
- **Multi-Environment**: Works locally and in Cloud Run with automatic service detection
- **Database Abstraction**: Unified interface for local KV and cloud databases
- **Cost Controls**: Built-in cost estimation and limits

## 📊 Resource Monitoring

The application provides comprehensive resource monitoring:

```json
{
  "system": {
    "memory": {
      "heapUsed": 45.2,
      "heapTotal": 128.0,
      "rss": 89.1
    },
    "cpu": {
      "count": 4,
      "loadAverage": [1.2, 1.1, 1.0]
    }
  },
  "isolates": {
    "activeIsolates": 3,
    "totalMemoryUsed": 6.59,
    "resourceAlerts": []
  }
}
```

## 🏗️ Architecture

```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   Web Client    │◄──►│  Deno Server     │◄──►│  GCP Services    │
│                 │    │  - WebSocket     │    │  - Cloud SQL     │
│ - HTML/CSS/JS   │    │  - REST API      │    │  - Memorystore    │
│ - Real-time     │    │  - Auto-provision│    │  - Cloud Storage │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                              ▲
                              │
                       ┌──────────────────┐
                       │   Isolates       │
                       │  - Secure exec   │
                       │  - Resource mon  │
                       │  - Sandboxed     │
                       └──────────────────┘
```

## 🚀 Quick Start

### Local Development

1. **Clone and setup:**
   ```bash
   git clone <repository-url>
   cd symposium-demo
   ```

2. **Configure environment (recommended):**
   ```bash
   # Option A: Interactive setup (recommended)
   ./setup.sh

   # Option B: Quick setup
   ./setup.sh --quick

   # Option C: Manual setup
   cp .env.example .env
   # Edit the .env file with your settings
   # nano .env  # or your preferred editor
   ```

3. **Run locally:**
   ```bash
   # Option A: Use .env file (recommended)
   deno run --allow-all --unstable-kv main.ts

   # Option B: Use environment variables
   export GCP_PROJECT_ID="your-project"
   export GCP_SERVICE_ACCOUNT_KEY="base64-key"
   deno run --allow-all --unstable-kv main.ts

   # Option C: Use local services only (no GCP)
   export PROVISIONING_MODE=disabled
   deno run --allow-all --unstable-kv main.ts
   ```

4. **Access the application:**
   - Open http://localhost:8000
   - Check metrics at http://localhost:8000/api/metrics
   - View environment status in console logs

### Cloud Run Deployment

1. **Set environment variables:**
   ```bash
   export GCP_PROJECT_ID="your-project-id"
   export GCP_REGION="us-central1"
   ```

2. **Deploy with auto-provisioning:**
   ```bash
   # Full deployment (first time)
   ./deploy-cloud-run.sh

   # Update existing deployment
   ./deploy-cloud-run.sh --update
   ```

3. **Access your deployed application:**
   - The script will output the service URL
   - Visit the URL to access your application

## 🔧 Configuration

### Environment Variables

| Variable | Description | Default | Required |
|----------|-------------|---------|----------|
| `GCP_PROJECT_ID` | Google Cloud Project ID | - | For GCP deployment |
| `GCP_REGION` | GCP Region | `us-central1` | Optional |
| `GCP_SERVICE_ACCOUNT_KEY` | Base64 encoded service account key | - | For auto-provisioning |
| `ENVIRONMENT` | Environment (development/staging/production) | `development` | Optional |
| `PROVISIONING_MODE` | Auto-provisioning mode (auto/manual/disabled) | `auto` | Optional |
| `COST_LIMIT` | Monthly cost limit in USD | `100` | Optional |
| `PORT` | Server port | `8000` (local), `8080` (Cloud Run) | Optional |

### Service Account Setup

For auto-provisioning, create a service account with these roles:
- `roles/cloudsql.admin`
- `roles/redis.admin`
- `roles/storage.admin`
- `roles/monitoring.viewer`

## 📈 Monitoring & Metrics

### Real-time Metrics

Access metrics at `/api/metrics`:

```bash
curl https://your-service-url/api/metrics
```

### Resource Thresholds

- **Memory**: 128MB per isolate, 500MB system alert
- **CPU**: Monitored with 70% sustained usage alerts
- **Isolates**: Max 10 concurrent, 8 alert threshold
- **Cost**: Configurable monthly limits

### Isolate Monitoring

```bash
# Get specific isolate stats
curl "https://your-service-url/api/isolate-stats?id=block-123"
```

## 🗄️ Database Architecture

### Automatic Service Selection

The application automatically chooses the appropriate database:

| Environment | Database | Cache | Storage |
|-------------|----------|-------|---------|
| Local | Deno KV | Local Map | Local Files |
| Cloud Run | Cloud SQL | Memorystore | Cloud Storage |

### Database Abstraction

```typescript
// Unified interface works across all environments
const db = new DatabaseManager({ type: 'local' }); // or 'cloudsql'
await db.set('key', 'value');
const value = await db.get('key');
```

## 🐳 Docker Deployment

### Build Locally

```bash
# Build the Docker image
docker build -t symposium-demo .

# Run locally
docker run -p 8080:8080 \
  -e GCP_PROJECT_ID="your-project" \
  -e GCP_SERVICE_ACCOUNT_KEY="base64-key" \
  symposium-demo
```

### Cloud Run Deployment

The deployment script handles:
- Multi-stage Docker build
- Service account creation
- GCP API enablement
- Resource configuration
- Environment setup

## 🔒 Security Features

- **Isolated Execution**: User code runs in secure Web Workers
- **Resource Limits**: Memory, CPU, and execution time limits
- **Input Validation**: HTML, CSS, and JavaScript sanitization
- **API Rate Limiting**: Prevents abuse of external APIs
- **Minimal Permissions**: Service accounts with least privilege

## 📊 Performance Characteristics

Based on testing with 3 active isolates:

- **Memory Usage**: ~2.2MB per isolate
- **Startup Time**: <3 seconds (local), ~5 seconds (Cloud Run cold start)
- **Concurrent Users**: 50-100 per container instance
- **Response Time**: <2 seconds for content execution

## 🛠️ Development

### Project Structure

```
symposium-demo/
├── src/
│   ├── gcp-provisioner.ts    # Auto-provisioning logic
│   ├── database-manager.ts   # Database abstraction
│   ├── isolate-manager.ts    # Isolate lifecycle management
│   ├── content-executor.ts   # Content execution orchestration
│   └── isolate-runtime.ts    # Resource monitoring
├── isolate-sandbox/
│   └── runtime.js           # Isolate execution environment
├── static/                  # Web assets
├── main.ts                 # Application entry point
├── Dockerfile             # Container definition
└── deploy-cloud-run.sh   # Deployment automation
```

### Adding New Services

1. Extend `GCPProvisioner` for new GCP services
2. Update `DatabaseManager` for new database types
3. Add environment detection in `detectEnvironment()`
4. Update cost estimation logic

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Add tests for new functionality
4. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**Auto-provisioning fails:**
- Check service account permissions
- Verify GCP project billing is enabled
- Ensure APIs are enabled

**High memory usage:**
- Monitor `/api/metrics` for isolate usage
- Check for memory leaks in user content
- Adjust isolate limits if needed

**Slow performance:**
- Check Cloud Run instance sizing
- Monitor database query performance
- Review isolate execution times

### Support

- Check `/api/health` for service status
- Review logs in Cloud Run console
- Monitor metrics at `/api/metrics`

---

**🎉 Your application is now a self-provisioning, auto-scaling cloud-native service with comprehensive resource monitoring!**
