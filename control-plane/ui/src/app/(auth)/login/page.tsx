'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { SkuldLogo } from '@/components/ui/skuld-logo';
import { authApi } from '@/lib/api';
import { toast } from '@/hooks/use-toast';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await authApi.login(email, password);
      toast({
        variant: 'success',
        title: 'Welcome back!',
        description: `Signed in as ${result.user.email}`,
      });
      router.push('/dashboard');
    } catch (err) {
      console.error('Login error:', err);
      const message = err instanceof Error ? err.message : 'Invalid email or password';

      // Check if it's a connection error
      if (message.includes('Load failed') || message.includes('fetch')) {
        toast({
          variant: 'error',
          title: 'Connection failed',
          description: 'Could not connect to the server. Make sure the API is running.',
        });
      } else {
        toast({
          variant: 'error',
          title: 'Login failed',
          description: message,
        });
      }
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left Panel - Dark branding */}
      <div
        className="hidden lg:flex lg:w-[480px] xl:w-[520px] flex-col justify-between p-10 xl:p-12"
        style={{ backgroundColor: '#211F22' }}
      >
        {/* Logo */}
        <div className="flex items-center gap-3">
          <SkuldLogo size={36} className="text-emerald-500" />
          <div className="flex flex-col">
            <span className="text-white font-semibold text-lg leading-tight">Skuld</span>
            <span className="text-zinc-500 text-xs font-medium">Control Plane</span>
          </div>
        </div>

        {/* Hero text */}
        <div>
          <h1 className="text-[2.5rem] xl:text-[2.75rem] font-bold text-white leading-[1.1] tracking-tight">
            Manage your
            <br />
            <span className="text-emerald-400">RPA infrastructure</span>
          </h1>
          <p className="mt-5 text-zinc-400 text-lg leading-relaxed max-w-sm">
            Central hub for clients, orchestrators, licenses and billing.
          </p>

          {/* Feature list - simple, no icons */}
          <ul className="mt-10 space-y-3">
            {[
              'Multi-tenant management',
              'License provisioning',
              'Usage analytics',
              'Enterprise security',
            ].map((feature) => (
              <li key={feature} className="flex items-center gap-3 text-zinc-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <span className="text-[15px]">{feature}</span>
              </li>
            ))}
          </ul>
        </div>

        {/* Footer */}
        <p className="text-zinc-600 text-sm">
          &copy; {new Date().getFullYear()} Skuld, LLC
        </p>
      </div>

      {/* Right Panel - Form */}
      <div className="flex-1 flex items-center justify-center px-6 py-12 bg-zinc-50">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex items-center gap-3 mb-10">
            <SkuldLogo size={36} className="text-emerald-500" />
            <div className="flex flex-col">
              <span className="text-zinc-900 font-semibold text-lg leading-tight">Skuld</span>
              <span className="text-zinc-400 text-xs font-medium">Control Plane</span>
            </div>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-zinc-900">Sign in to Control Plane</h2>
            <p className="mt-1 text-zinc-500 text-sm">Enter your credentials to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="email" className="block text-sm font-medium text-zinc-700 mb-1.5">
                Email
              </label>
              <input
                id="email"
                type="email"
                placeholder="you@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                className="w-full h-11 px-3 rounded-lg border border-zinc-200 bg-white text-zinc-900 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label htmlFor="password" className="block text-sm font-medium text-zinc-700">
                  Password
                </label>
                <Link
                  href="/forgot-password"
                  className="text-sm text-zinc-500 hover:text-zinc-700"
                >
                  Forgot?
                </Link>
              </div>
              <div className="relative">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  placeholder="Enter password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  autoComplete="current-password"
                  className="w-full h-11 px-3 pr-10 rounded-lg border border-zinc-200 bg-white text-zinc-900 text-sm placeholder:text-zinc-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-transparent transition-shadow"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-600"
                >
                  {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                id="remember"
                type="checkbox"
                className="h-4 w-4 rounded border-zinc-300 text-emerald-500 focus:ring-emerald-500 focus:ring-offset-0"
              />
              <label htmlFor="remember" className="text-sm text-zinc-600">
                Remember me
              </label>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-11 rounded-lg bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {isLoading ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Signing in...
                </span>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Divider */}
          <div className="relative my-6">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-zinc-200" />
            </div>
            <div className="relative flex justify-center">
              <span className="px-3 bg-zinc-50 text-zinc-400 text-xs uppercase tracking-wide">or</span>
            </div>
          </div>

          {/* Microsoft SSO */}
          <button
            type="button"
            className="w-full h-11 flex items-center justify-center gap-3 rounded-lg border border-zinc-200 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
          >
            <svg className="h-4 w-4" viewBox="0 0 21 21">
              <path fill="#f25022" d="M0 0h10v10H0z"/>
              <path fill="#00a4ef" d="M0 11h10v10H0z"/>
              <path fill="#7fba00" d="M11 0h10v10H11z"/>
              <path fill="#ffb900" d="M11 11h10v10H11z"/>
            </svg>
            Continue with Microsoft
          </button>

          {/* Support link */}
          <p className="mt-8 text-center text-sm text-zinc-500">
            Need help?{' '}
            <a href="mailto:support@skuldbot.com" className="text-zinc-700 hover:text-zinc-900 font-medium">
              Contact support
            </a>
          </p>
        </div>
      </div>
    </div>
  );
}
