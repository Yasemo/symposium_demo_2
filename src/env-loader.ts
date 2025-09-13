// Environment Variable Loader for Symposium Demo
// Automatically loads .env file and provides typed environment configuration

export interface EnvironmentConfig {
  // GCP Configuration
  gcpProjectId?: string;
  gcpRegion: string;
  gcpServiceAccountKey?: string;

  // Application Configuration
  environment: 'development' | 'staging' | 'production';
  provisioningMode: 'auto' | 'manual' | 'disabled';
  costLimit: number;
  port: number;

  // Gemini AI
  geminiApiKey?: string;

  // Manual Service Configuration
  cloudSqlConnectionString?: string;
  memorystoreConnectionString?: string;
  cloudStorageBucket?: string;

  // Development Overrides
  forceGcpServices: boolean;
  debugMode: boolean;

  // Security
  corsOrigins: string[];
  sessionSecret?: string;

  // Monitoring
  enablePrometheusMetrics: boolean;
  metricsInterval: number;
  memoryAlertThreshold: number;
  isolateAlertThreshold: number;
  cpuAlertThreshold: number;
}

class EnvironmentLoader {
  private config: EnvironmentConfig;
  private envFileLoaded: boolean = false;
  private initialized: boolean = false;

  constructor() {
    this.config = this.getDefaultConfig();
  }

  public async initialize(): Promise<void> {
    if (this.initialized) return;

    await this.loadEnvironmentFile();
    this.applyEnvironmentOverrides();
    this.initialized = true;
  }

  private getDefaultConfig(): EnvironmentConfig {
    return {
      gcpRegion: 'us-central1',
      environment: 'development',
      provisioningMode: 'auto',
      costLimit: 100,
      port: 8000,
      forceGcpServices: false,
      debugMode: false,
      corsOrigins: ['http://localhost:3000', 'http://localhost:8000'],
      enablePrometheusMetrics: false,
      metricsInterval: 10,
      memoryAlertThreshold: 500,
      isolateAlertThreshold: 8,
      cpuAlertThreshold: 70
    };
  }

  private async loadEnvironmentFile(): Promise<void> {
    try {
      const envContent = await Deno.readTextFile('.env');
      this.parseEnvFile(envContent);
      this.envFileLoaded = true;

      if (this.config.debugMode) {
        console.log('✅ Environment file loaded successfully');
      }
    } catch (error) {
      console.warn('⚠️  No .env file found or failed to load, using environment variables only');
      this.envFileLoaded = false;
    }
  }

  private parseEnvFile(content: string): void {
    const lines = content.split('\n');

    for (const line of lines) {
      const trimmedLine = line.trim();

      // Skip comments and empty lines
      if (trimmedLine.startsWith('#') || trimmedLine === '') {
        continue;
      }

      const [key, ...valueParts] = trimmedLine.split('=');
      const value = valueParts.join('=').trim();

      // Remove quotes if present
      const cleanValue = value.replace(/^["']|["']$/g, '');

      this.setConfigValue(key.trim(), cleanValue);
    }
  }

  private setConfigValue(key: string, value: string): void {
    switch (key) {
      case 'GCP_PROJECT_ID':
        this.config.gcpProjectId = value;
        break;
      case 'GCP_REGION':
        this.config.gcpRegion = value;
        break;
      case 'GCP_SERVICE_ACCOUNT_KEY':
        this.config.gcpServiceAccountKey = value;
        break;
      case 'ENVIRONMENT':
        this.config.environment = value as 'development' | 'staging' | 'production';
        break;
      case 'PROVISIONING_MODE':
        this.config.provisioningMode = value as 'auto' | 'manual' | 'disabled';
        break;
      case 'COST_LIMIT':
        this.config.costLimit = parseInt(value) || 100;
        break;
      case 'PORT':
        this.config.port = parseInt(value) || 8000;
        break;
      case 'GEMINI_API_KEY':
        this.config.geminiApiKey = value;
        break;
      case 'CLOUD_SQL_CONNECTION_STRING':
        this.config.cloudSqlConnectionString = value;
        break;
      case 'MEMORYSTORE_CONNECTION_STRING':
        this.config.memorystoreConnectionString = value;
        break;
      case 'CLOUD_STORAGE_BUCKET':
        this.config.cloudStorageBucket = value;
        break;
      case 'FORCE_GCP_SERVICES':
        this.config.forceGcpServices = value.toLowerCase() === 'true';
        break;
      case 'DEBUG_MODE':
        this.config.debugMode = value.toLowerCase() === 'true';
        break;
      case 'CORS_ORIGINS':
        this.config.corsOrigins = value.split(',').map(origin => origin.trim());
        break;
      case 'SESSION_SECRET':
        this.config.sessionSecret = value;
        break;
      case 'ENABLE_PROMETHEUS_METRICS':
        this.config.enablePrometheusMetrics = value.toLowerCase() === 'true';
        break;
      case 'METRICS_INTERVAL':
        this.config.metricsInterval = parseInt(value) || 10;
        break;
      case 'MEMORY_ALERT_THRESHOLD':
        this.config.memoryAlertThreshold = parseInt(value) || 500;
        break;
      case 'ISOLATE_ALERT_THRESHOLD':
        this.config.isolateAlertThreshold = parseInt(value) || 8;
        break;
      case 'CPU_ALERT_THRESHOLD':
        this.config.cpuAlertThreshold = parseInt(value) || 70;
        break;
    }
  }

  private applyEnvironmentOverrides(): void {
    // Environment variables override .env file values
    const envOverrides = {
      GCP_PROJECT_ID: 'gcpProjectId',
      GCP_REGION: 'gcpRegion',
      GCP_SERVICE_ACCOUNT_KEY: 'gcpServiceAccountKey',
      ENVIRONMENT: 'environment',
      PROVISIONING_MODE: 'provisioningMode',
      COST_LIMIT: 'costLimit',
      PORT: 'port',
      GEMINI_API_KEY: 'geminiApiKey',
      CLOUD_SQL_CONNECTION_STRING: 'cloudSqlConnectionString',
      MEMORYSTORE_CONNECTION_STRING: 'memorystoreConnectionString',
      CLOUD_STORAGE_BUCKET: 'cloudStorageBucket',
      FORCE_GCP_SERVICES: 'forceGcpServices',
      DEBUG_MODE: 'debugMode',
      CORS_ORIGINS: 'corsOrigins',
      SESSION_SECRET: 'sessionSecret',
      ENABLE_PROMETHEUS_METRICS: 'enablePrometheusMetrics',
      METRICS_INTERVAL: 'metricsInterval',
      MEMORY_ALERT_THRESHOLD: 'memoryAlertThreshold',
      ISOLATE_ALERT_THRESHOLD: 'isolateAlertThreshold',
      CPU_ALERT_THRESHOLD: 'cpuAlertThreshold'
    };

    for (const [envKey, configKey] of Object.entries(envOverrides)) {
      const envValue = Deno.env.get(envKey);
      if (envValue !== undefined) {
        this.setConfigValue(envKey, envValue);
      }
    }
  }

  public getConfig(): EnvironmentConfig {
    return { ...this.config };
  }

  public isEnvFileLoaded(): boolean {
    return this.envFileLoaded;
  }

  public getEnvStatus(): {
    envFileLoaded: boolean;
    gcpConfigured: boolean;
    servicesConfigured: boolean;
    debugMode: boolean;
  } {
    return {
      envFileLoaded: this.envFileLoaded,
      gcpConfigured: !!(this.config.gcpProjectId && this.config.gcpServiceAccountKey),
      servicesConfigured: !!(this.config.cloudSqlConnectionString || this.config.memorystoreConnectionString),
      debugMode: this.config.debugMode
    };
  }

  // Utility method to get connection details for different environments
  public getConnectionDetails(): {
    database: { type: string; connectionString?: string };
    cache: { type: string; connectionString?: string };
    storage: { type: string; bucket?: string };
  } {
    const isLocal = !this.config.forceGcpServices && !Deno.env.get('K_SERVICE');

    if (isLocal && this.config.provisioningMode === 'disabled') {
      return {
        database: { type: 'local' },
        cache: { type: 'local' },
        storage: { type: 'local' }
      };
    }

    // Use manual configuration if provided
    if (this.config.provisioningMode === 'manual') {
      return {
        database: {
          type: 'postgresql',
          connectionString: this.config.cloudSqlConnectionString
        },
        cache: {
          type: 'redis',
          connectionString: this.config.memorystoreConnectionString
        },
        storage: {
          type: 'gcs',
          bucket: this.config.cloudStorageBucket
        }
      };
    }

    // Auto-provisioning mode
    return {
      database: { type: 'cloudsql' },
      cache: { type: 'memorystore' },
      storage: { type: 'gcs' }
    };
  }
}

// Global instance - initialize asynchronously
let envLoader: EnvironmentLoader;
let initialized = false;

async function getEnvLoader(): Promise<EnvironmentLoader> {
  if (!initialized) {
    envLoader = new EnvironmentLoader();
    await envLoader.initialize();
    initialized = true;
  }
  return envLoader;
}

// For backward compatibility, create a synchronous instance
// but mark it as needing async initialization
const syncEnvLoader = new EnvironmentLoader();

// Export both sync and async versions
export { syncEnvLoader as envLoader };
export { getEnvLoader };
export default syncEnvLoader;
