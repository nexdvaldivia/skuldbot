import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { LicenseService } from '../license/license.service';

/**
 * Marketplace Bot from Control-Plane catalog
 */
export interface CatalogBot {
  id: string;
  name: string;
  slug: string;
  description: string;
  longDescription?: string;
  tagline?: string;
  category: string;
  tags: string[];
  executionMode: 'cloud' | 'runner' | 'hybrid';
  pricingModel: 'free' | 'subscription' | 'usage' | 'hybrid';
  pricing: {
    monthlyBase?: number;
    usageMetrics?: { metric: string; pricePerUnit: number; description: string }[];
    minimumMonthly?: number;
    trialDays?: number;
  };
  publisher: {
    id: string;
    name: string;
    verified: boolean;
  };
  isSkuldBot: boolean;
  currentVersion: string;
  iconUrl?: string;
  screenshots: string[];
  heroImageUrl?: string;
  demoVideoUrl?: string;
  features?: { title: string; description: string; icon?: string }[];
  useCases?: { title: string; description: string; industry?: string }[];
  benefits?: { metric: string; value: string; description?: string }[];
  testimonials?: { quote: string; author: string; company: string; role?: string }[];
  faqs?: { question: string; answer: string }[];
  integrations?: { name: string; logoUrl: string }[];
  requirements?: {
    connections: string[];
    vaultSecrets: string[];
    permissions: string[];
  };
  stats: {
    installs: number;
    rating: number;
    reviews: number;
    totalRuns: number;
  };
  publishedAt: string;
}

/**
 * Catalog response from Control-Plane
 */
export interface CatalogResponse {
  data: CatalogBot[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}

/**
 * Catalog Service
 *
 * Fetches and caches the marketplace catalog from Control-Plane.
 *
 * Features:
 * - Fetches catalog from Control-Plane API
 * - Caches results locally (15 minutes)
 * - Handles offline mode gracefully
 * - Supports filtering and pagination
 */
@Injectable()
export class CatalogService {
  private readonly logger = new Logger(CatalogService.name);

  // Cache
  private catalogCache: CatalogResponse | null = null;
  private catalogCacheTime: Date | null = null;
  private readonly cacheDurationMs = 15 * 60 * 1000; // 15 minutes

  constructor(
    private readonly configService: ConfigService,
    private readonly licenseService: LicenseService,
  ) {}

  /**
   * Get catalog from Control-Plane
   */
  async getCatalog(options: {
    page?: number;
    limit?: number;
    category?: string;
    search?: string;
    sort?: 'popular' | 'newest' | 'rating' | 'name';
  } = {}): Promise<CatalogResponse> {
    const { page = 1, limit = 20, category, search, sort = 'popular' } = options;

    // Check cache for first page without filters
    if (page === 1 && !category && !search && sort === 'popular') {
      if (this.isCacheValid()) {
        return this.catalogCache!;
      }
    }

    const controlPlaneUrl = this.configService.get<string>('CONTROL_PLANE_URL');
    if (!controlPlaneUrl) {
      this.logger.warn('No CONTROL_PLANE_URL configured, returning empty catalog');
      return this.getEmptyCatalog();
    }

    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(limit),
        sort,
      });

      if (category) params.append('category', category);
      if (search) params.append('search', search);

      const response = await fetch(
        `${controlPlaneUrl}/api/marketplace/catalog?${params.toString()}`,
        {
          headers: this.getAuthHeaders(),
        },
      );

      if (!response.ok) {
        throw new Error(`Control-Plane returned ${response.status}`);
      }

      const catalog: CatalogResponse = await response.json();

      // Cache first page results
      if (page === 1 && !category && !search && sort === 'popular') {
        this.catalogCache = catalog;
        this.catalogCacheTime = new Date();
      }

      return catalog;
    } catch (error) {
      this.logger.error(`Failed to fetch catalog: ${error}`);

      // Return cached data if available
      if (this.catalogCache) {
        this.logger.warn('Returning stale cached catalog');
        return this.catalogCache;
      }

      return this.getEmptyCatalog();
    }
  }

  /**
   * Get bot details by slug
   */
  async getBotBySlug(slug: string): Promise<CatalogBot | null> {
    const controlPlaneUrl = this.configService.get<string>('CONTROL_PLANE_URL');
    if (!controlPlaneUrl) {
      return null;
    }

    try {
      const response = await fetch(
        `${controlPlaneUrl}/api/marketplace/catalog/${slug}`,
        {
          headers: this.getAuthHeaders(),
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Control-Plane returned ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`Failed to fetch bot ${slug}: ${error}`);
      return null;
    }
  }

  /**
   * Get bot details by ID
   */
  async getBotById(id: string): Promise<CatalogBot | null> {
    const controlPlaneUrl = this.configService.get<string>('CONTROL_PLANE_URL');
    if (!controlPlaneUrl) {
      return null;
    }

    try {
      const response = await fetch(
        `${controlPlaneUrl}/api/marketplace/bots/${id}`,
        {
          headers: this.getAuthHeaders(),
        },
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Control-Plane returned ${response.status}`);
      }

      return await response.json();
    } catch (error) {
      this.logger.error(`Failed to fetch bot ${id}: ${error}`);
      return null;
    }
  }

  /**
   * Get categories list
   */
  async getCategories(): Promise<{ id: string; name: string; count: number }[]> {
    // In production, this would fetch from Control-Plane
    // For now, return static list
    return [
      { id: 'email', name: 'Email Automation', count: 0 },
      { id: 'insurance', name: 'Insurance', count: 0 },
      { id: 'finance', name: 'Finance', count: 0 },
      { id: 'hr', name: 'Human Resources', count: 0 },
      { id: 'sales', name: 'Sales', count: 0 },
      { id: 'healthcare', name: 'Healthcare', count: 0 },
      { id: 'logistics', name: 'Logistics', count: 0 },
      { id: 'custom', name: 'Custom', count: 0 },
    ];
  }

  /**
   * Invalidate catalog cache
   */
  invalidateCache(): void {
    this.catalogCache = null;
    this.catalogCacheTime = null;
  }

  private isCacheValid(): boolean {
    if (!this.catalogCache || !this.catalogCacheTime) {
      return false;
    }

    const age = Date.now() - this.catalogCacheTime.getTime();
    return age < this.cacheDurationMs;
  }

  private getAuthHeaders(): Record<string, string> {
    const licenseKey = this.configService.get<string>('LICENSE_KEY', '');

    return {
      'Content-Type': 'application/json',
      'X-License-Key': licenseKey,
      'X-Tenant-Id': this.licenseService.getTenantId() || '',
    };
  }

  private getEmptyCatalog(): CatalogResponse {
    return {
      data: [],
      pagination: {
        page: 1,
        limit: 20,
        total: 0,
        totalPages: 0,
      },
    };
  }
}
