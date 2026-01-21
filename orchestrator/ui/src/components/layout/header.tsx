'use client';

import { Bell, Search, User, ChevronDown, LogOut, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useState } from 'react';

export function Header() {
  const [showUserMenu, setShowUserMenu] = useState(false);

  return (
    <header className="h-16 bg-card border-b border-border flex items-center justify-between px-6">
      {/* Search */}
      <div className="flex items-center flex-1 max-w-md">
        <div className="relative w-full">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="text"
            placeholder="Search bots, runs, runners..."
            className="pl-10 bg-background"
          />
        </div>
      </div>

      {/* Right side */}
      <div className="flex items-center gap-2">
        {/* Notifications */}
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5 text-muted-foreground" />
          <span className="absolute top-2 right-2 h-2 w-2 bg-destructive rounded-full" />
        </Button>

        {/* User menu */}
        <div className="relative">
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="flex items-center gap-2 px-2 py-1.5 rounded-lg hover:bg-accent transition-colors"
          >
            <div className="h-8 w-8 bg-primary rounded-full flex items-center justify-center">
              <User className="h-4 w-4 text-primary-foreground" />
            </div>
            <span className="text-sm font-medium text-foreground">Admin</span>
            <ChevronDown className="h-4 w-4 text-muted-foreground" />
          </button>

          {showUserMenu && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setShowUserMenu(false)}
              />
              <div className="absolute right-0 mt-2 w-48 rounded-lg border border-border bg-card shadow-lg z-50 animate-scale-in">
                <div className="p-2">
                  <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent rounded-md transition-colors">
                    <User className="h-4 w-4" />
                    Profile
                  </button>
                  <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-foreground hover:bg-accent rounded-md transition-colors">
                    <Settings className="h-4 w-4" />
                    Settings
                  </button>
                  <div className="border-t border-border my-1" />
                  <button className="flex items-center gap-2 w-full px-3 py-2 text-sm text-destructive hover:bg-destructive/10 rounded-md transition-colors">
                    <LogOut className="h-4 w-4" />
                    Sign out
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
