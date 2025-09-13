// Database Abstraction Layer for Symposium Demo
// Provides unified interface for local KV, Cloud SQL, and other databases

import { Client } from "postgres";
import { GCPProvisioner, ServiceEndpoints } from './gcp-provisioner.ts';

export interface DatabaseConfig {
  type: 'local' | 'cloudsql' | 'postgresql' | 'redis';
  connectionString?: string;
  endpoints?: ServiceEndpoints;
}

export interface CacheConfig {
  type: 'local' | 'memorystore' | 'redis';
  connectionString?: string;
  endpoints?: ServiceEndpoints;
}

export interface StorageConfig {
  type: 'local' | 'gcs';
  bucketName?: string;
  baseUrl?: string;
  endpoints?: ServiceEndpoints;
}

export class DatabaseManager {
  private kv: any = null;
  private sqlConnection: any = null;
  private redisConnection: any = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log(`🔌 Initializing ${this.config.type} database connection...`);

    try {
      switch (this.config.type) {
        case 'local':
          await this.initializeLocalKV();
          break;
        case 'cloudsql':
          await this.initializeCloudSQL();
          break;
        case 'postgresql':
          await this.initializePostgreSQL();
          break;
        default:
          throw new Error(`Unsupported database type: ${this.config.type}`);
      }
      console.log(`✅ Database connection established`);
    } catch (error) {
      console.error(`❌ Database initialization failed:`, error);
      throw error;
    }
  }

  private async initializeLocalKV(): Promise<void> {
    try {
      this.kv = await Deno.openKv();
      console.log('📦 Using local Deno KV storage');
    } catch (error) {
      console.error('Failed to initialize local KV:', error);
      throw error;
    }
  }

  private async initializeCloudSQL(): Promise<void> {
    if (!this.config.endpoints?.database.connectionString) {
      throw new Error('Cloud SQL connection string not provided');
    }

    try {
      // Parse connection string for Cloud SQL
      const connectionString = this.config.endpoints.database.connectionString;

      // Create PostgreSQL client for Cloud SQL
      this.sqlConnection = new Client(connectionString);

      // Connect to the database
      await this.sqlConnection.connect();

      console.log('🗄️  Connected to Cloud SQL PostgreSQL database');

      // Create tables if they don't exist
      await this.createTables();

    } catch (error) {
      console.error('Failed to connect to Cloud SQL:', error);
      console.log('Falling back to local KV storage');
      await this.initializeLocalKV();
    }
  }

  private async initializePostgreSQL(): Promise<void> {
    if (!this.config.connectionString) {
      throw new Error('PostgreSQL connection string not provided');
    }

    try {
      // Create PostgreSQL client
      this.sqlConnection = new Client(this.config.connectionString);

      // Connect to the database
      await this.sqlConnection.connect();

      console.log('🗄️  Connected to PostgreSQL database');

      // Create tables if they don't exist
      await this.createTables();

    } catch (error) {
      console.error('Failed to connect to PostgreSQL:', error);
      console.log('Falling back to local KV storage');
      await this.initializeLocalKV();
    }
  }

  private async createTables(): Promise<void> {
    if (!this.sqlConnection) return;

    try {
      // Create symposium_data table for key-value storage
      await this.sqlConnection.queryObject(`
        CREATE TABLE IF NOT EXISTS symposium_data (
          key TEXT PRIMARY KEY,
          value JSONB,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
        )
      `);

      // Create indexes for better performance
      await this.sqlConnection.queryObject(`
        CREATE INDEX IF NOT EXISTS idx_symposium_data_key ON symposium_data(key)
      `);

      console.log('✅ Database tables created/verified');
    } catch (error) {
      console.error('Failed to create tables:', error);
      throw error;
    }
  }

  async get(key: string): Promise<any> {
    try {
      if (this.kv) {
        const result = await this.kv.get([key]);
        return result.value;
      }
      return null;
    } catch (error) {
      console.error(`Database get error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any): Promise<boolean> {
    try {
      if (this.kv) {
        await this.kv.set([key], value);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Database set error for key ${key}:`, error);
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      if (this.kv) {
        await this.kv.delete([key]);
        return true;
      }
      return false;
    } catch (error) {
      console.error(`Database delete error for key ${key}:`, error);
      return false;
    }
  }

  async list(prefix: string[] = []): Promise<any[]> {
    try {
      if (this.kv) {
        const entries = this.kv.list({ prefix });
        const results = [];
        for await (const entry of entries) {
          results.push(entry);
        }
        return results;
      }
      return [];
    } catch (error) {
      console.error(`Database list error for prefix ${prefix}:`, error);
      return [];
    }
  }

  async close(): Promise<void> {
    console.log('🔌 Closing database connections...');

    try {
      if (this.sqlConnection) {
        // Close SQL connection
        await this.sqlConnection.close();
      }
      if (this.redisConnection) {
        // Close Redis connection
        await this.redisConnection.close();
      }
      // KV doesn't need explicit closing
      console.log('✅ Database connections closed');
    } catch (error) {
      console.error('Error closing database connections:', error);
    }
  }

  getConnectionInfo(): {
    type: string;
    status: 'connected' | 'disconnected' | 'error';
    details?: any;
  } {
    return {
      type: this.config.type,
      status: this.kv ? 'connected' : 'disconnected',
      details: {
        hasKV: !!this.kv,
        hasSQL: !!this.sqlConnection,
        hasRedis: !!this.redisConnection
      }
    };
  }
}

export class CacheManager {
  private redis: any = null;
  private localCache = new Map<string, any>();
  private config: CacheConfig;

  constructor(config: CacheConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log(`🔄 Initializing ${this.config.type} cache...`);

    try {
      switch (this.config.type) {
        case 'local':
          console.log('💾 Using local memory cache');
          break;
        case 'memorystore':
        case 'redis':
          await this.initializeRedis();
          break;
        default:
          throw new Error(`Unsupported cache type: ${this.config.type}`);
      }
      console.log(`✅ Cache initialized`);
    } catch (error) {
      console.error(`❌ Cache initialization failed:`, error);
      throw error;
    }
  }

  private async initializeRedis(): Promise<void> {
    if (!this.config.endpoints?.cache.connectionString) {
      throw new Error('Redis connection string not provided');
    }

    // TODO: Initialize Redis client
    console.log('🔄 Redis connection configured (implementation pending)');
    console.log(`Connection: ${this.config.endpoints.cache.connectionString}`);

    // For now, use local cache as fallback
    console.log('💾 Falling back to local memory cache');
  }

  async get(key: string): Promise<any> {
    try {
      if (this.redis) {
        // Redis get
        return null; // TODO: Implement Redis get
      } else {
        return this.localCache.get(key);
      }
    } catch (error) {
      console.error(`Cache get error for key ${key}:`, error);
      return null;
    }
  }

  async set(key: string, value: any, ttl?: number): Promise<boolean> {
    try {
      if (this.redis) {
        // Redis set with TTL
        return true; // TODO: Implement Redis set
      } else {
        this.localCache.set(key, value);
        if (ttl) {
          setTimeout(() => this.localCache.delete(key), ttl * 1000);
        }
        return true;
      }
    } catch (error) {
      console.error(`Cache set error for key ${key}:`, error);
      return false;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      if (this.redis) {
        // Redis delete
        return true; // TODO: Implement Redis delete
      } else {
        return this.localCache.delete(key);
      }
    } catch (error) {
      console.error(`Cache delete error for key ${key}:`, error);
      return false;
    }
  }

  async close(): Promise<void> {
    console.log('🔄 Closing cache connections...');

    try {
      if (this.redis) {
        // Close Redis connection
        await this.redis.close();
      }
      console.log('✅ Cache connections closed');
    } catch (error) {
      console.error('Error closing cache connections:', error);
    }
  }
}

export class StorageManager {
  private config: StorageConfig;
  private gcsClient: any = null;

  constructor(config: StorageConfig) {
    this.config = config;
  }

  async initialize(): Promise<void> {
    console.log(`📦 Initializing ${this.config.type} storage...`);

    try {
      switch (this.config.type) {
        case 'local':
          console.log('📁 Using local file storage');
          break;
        case 'gcs':
          await this.initializeGCS();
          break;
        default:
          throw new Error(`Unsupported storage type: ${this.config.type}`);
      }
      console.log(`✅ Storage initialized`);
    } catch (error) {
      console.error(`❌ Storage initialization failed:`, error);
      throw error;
    }
  }

  private async initializeGCS(): Promise<void> {
    if (!this.config.endpoints?.storage.bucketName) {
      throw new Error('GCS bucket name not provided');
    }

    // TODO: Initialize GCS client
    console.log('☁️  Cloud Storage configured (implementation pending)');
    console.log(`Bucket: ${this.config.endpoints.storage.bucketName}`);

    // For now, use local storage as fallback
    console.log('📁 Falling back to local file storage');
  }

  async uploadFile(fileName: string, content: Uint8Array): Promise<string> {
    try {
      if (this.gcsClient) {
        // GCS upload
        return `gs://${this.config.bucketName}/${fileName}`;
      } else {
        // Local file storage
        const localPath = `./storage/${fileName}`;
        await Deno.writeFile(localPath, content);
        return localPath;
      }
    } catch (error) {
      console.error(`Storage upload error for ${fileName}:`, error);
      throw error;
    }
  }

  async downloadFile(fileName: string): Promise<Uint8Array> {
    try {
      if (this.gcsClient) {
        // GCS download
        return new Uint8Array();
      } else {
        // Local file read
        const localPath = `./storage/${fileName}`;
        return await Deno.readFile(localPath);
      }
    } catch (error) {
      console.error(`Storage download error for ${fileName}:`, error);
      throw error;
    }
  }

  async deleteFile(fileName: string): Promise<boolean> {
    try {
      if (this.gcsClient) {
        // GCS delete
        return true;
      } else {
        // Local file delete
        const localPath = `./storage/${fileName}`;
        await Deno.remove(localPath);
        return true;
      }
    } catch (error) {
      console.error(`Storage delete error for ${fileName}:`, error);
      return false;
    }
  }
}

// Factory function to create service managers based on environment
export async function createServiceManagers(
  provisioner: GCPProvisioner,
  config: { projectId: string; region: string; environment: 'development' | 'staging' | 'production' }
): Promise<{
  database: DatabaseManager;
  cache: CacheManager;
  storage: StorageManager;
}> {
  console.log('🏭 Creating service managers...');

  // Always attempt GCP provisioning first when in auto mode
  // Only fall back to local services if GCP provisioning fails
  try {
    console.log('☁️  Attempting GCP service provisioning...');
    const endpoints = await provisioner.provisionServices(config);

    const database = new DatabaseManager({
      type: 'cloudsql',
      endpoints
    });
    const cache = new CacheManager({
      type: 'memorystore',
      endpoints
    });
    const storage = new StorageManager({
      type: 'gcs',
      endpoints
    });

    await Promise.all([
      database.initialize(),
      cache.initialize(),
      storage.initialize()
    ]);

    console.log('✅ GCP services provisioned and initialized successfully');
    return { database, cache, storage };

  } catch (error) {
    console.warn('❌ GCP provisioning failed, falling back to local services:', error);
    console.log('🏠 Using local services as fallback');

    // Fallback to local services
    const database = new DatabaseManager({ type: 'local' });
    const cache = new CacheManager({ type: 'local' });
    const storage = new StorageManager({ type: 'local' });

    await Promise.all([
      database.initialize(),
      cache.initialize(),
      storage.initialize()
    ]);

    return { database, cache, storage };
  }
}
