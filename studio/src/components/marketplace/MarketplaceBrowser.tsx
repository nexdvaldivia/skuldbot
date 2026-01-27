import React, { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/tauri';
import {
  Search,
  Download,
  Star,
  DollarSign,
  Filter,
  Tag,
  Building2,
  CheckCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';

interface MarketplaceBot {
  id: string;
  name: string;
  description: string;
  category: string;
  industry: string[];
  version: string;
  rating: number;
  totalReviews: number;
  pricing: {
    model: string;
    price: number;
    currency: string;
  };
  publisher: {
    name: string;
    verified: boolean;
  };
  tags: string[];
  thumbnail?: string;
}

interface MarketplaceBrowserProps {
  onBotInstall?: (bot: MarketplaceBot) => void;
}

export const MarketplaceBrowser: React.FC<MarketplaceBrowserProps> = ({
  onBotInstall,
}) => {
  const [bots, setBots] = useState<MarketplaceBot[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedIndustry, setSelectedIndustry] = useState<string>('all');

  const categories = [
    'all',
    'claims',
    'billing',
    'data-entry',
    'reporting',
    'compliance',
  ];

  const industries = [
    'all',
    'insurance',
    'healthcare',
    'finance',
    'manufacturing',
  ];

  useEffect(() => {
    loadMarketplace();
  }, [searchQuery, selectedCategory, selectedIndustry]);

  const loadMarketplace = async () => {
    setLoading(true);
    setError(null);

    try {
      // Call MCP marketplace search via Tauri
      const filters: any = {};
      if (searchQuery) filters.searchQuery = searchQuery;
      if (selectedCategory !== 'all') filters.category = selectedCategory;
      if (selectedIndustry !== 'all') filters.industry = selectedIndustry;

      const result = await invoke<MarketplaceBot[]>('mcp_search_marketplace', {
        filters,
      });

      setBots(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load marketplace');
      console.error('Marketplace error:', err);
    } finally {
      setLoading(false);
    }
  };

  const handleInstall = async (bot: MarketplaceBot) => {
    try {
      setLoading(true);
      await invoke('mcp_subscribe_to_bot', {
        botId: bot.id,
      });

      // Notify parent
      onBotInstall?.(bot);

      // Show success notification
      alert(`Successfully subscribed to ${bot.name}`);
    } catch (err: any) {
      alert(`Failed to subscribe: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-50 dark:bg-gray-900">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 p-4">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Marketplace
        </h2>

        {/* Search and Filters */}
        <div className="flex flex-col md:flex-row gap-4">
          {/* Search */}
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search bots..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#35D399] focus:border-transparent"
            />
          </div>

          {/* Category Filter */}
          <div className="flex items-center gap-2">
            <Tag className="text-gray-400 w-5 h-5" />
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#35D399]"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
          </div>

          {/* Industry Filter */}
          <div className="flex items-center gap-2">
            <Building2 className="text-gray-400 w-5 h-5" />
            <select
              value={selectedIndustry}
              onChange={(e) => setSelectedIndustry(e.target.value)}
              className="px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-[#35D399]"
            >
              {industries.map((ind) => (
                <option key={ind} value={ind}>
                  {ind === 'all' ? 'All Industries' : ind}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-8 h-8 text-[#35D399] animate-spin" />
          </div>
        )}

        {error && (
          <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400" />
            <p className="text-red-600 dark:text-red-400">{error}</p>
          </div>
        )}

        {!loading && !error && bots.length === 0 && (
          <div className="text-center py-12">
            <p className="text-gray-500 dark:text-gray-400">No bots found</p>
          </div>
        )}

        {!loading && !error && bots.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {bots.map((bot) => (
              <div
                key={bot.id}
                className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg transition-shadow"
              >
                {/* Thumbnail */}
                {bot.thumbnail && (
                  <img
                    src={bot.thumbnail}
                    alt={bot.name}
                    className="w-full h-32 object-cover rounded-lg mb-3"
                  />
                )}

                {/* Bot Info */}
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-1">
                  {bot.name}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
                  {bot.description}
                </p>

                {/* Publisher */}
                <div className="flex items-center gap-2 mb-3">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    by {bot.publisher.name}
                  </span>
                  {bot.publisher.verified && (
                    <CheckCircle className="w-4 h-4 text-[#35D399]" />
                  )}
                </div>

                {/* Rating */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="flex items-center">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${
                          star <= bot.rating
                            ? 'text-yellow-400 fill-yellow-400'
                            : 'text-gray-300 dark:text-gray-600'
                        }`}
                      />
                    ))}
                  </div>
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    ({bot.totalReviews})
                  </span>
                </div>

                {/* Tags */}
                <div className="flex flex-wrap gap-2 mb-3">
                  {bot.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 text-xs rounded"
                    >
                      {tag}
                    </span>
                  ))}
                </div>

                {/* Pricing & Install */}
                <div className="flex items-center justify-between pt-3 border-t border-gray-200 dark:border-gray-700">
                  <div className="flex items-center gap-1 text-[#35D399] font-semibold">
                    <DollarSign className="w-4 h-4" />
                    <span>
                      {bot.pricing.price === 0
                        ? 'Free'
                        : `${bot.pricing.price}/${bot.pricing.model}`}
                    </span>
                  </div>
                  <button
                    onClick={() => handleInstall(bot)}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2 bg-[#35D399] hover:bg-[#2ab380] text-white rounded-lg transition-colors disabled:opacity-50"
                  >
                    <Download className="w-4 h-4" />
                    Install
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

