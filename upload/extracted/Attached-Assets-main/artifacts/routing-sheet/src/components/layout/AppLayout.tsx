import React from 'react';
import { Link, useLocation } from 'wouter';
import { useAuth } from '@/components/auth/AuthContext';
import {
  LayoutDashboard, Users, CheckSquare, LogOut, FileText, Settings,
  User as UserIcon, UserMinus, ClipboardList, ShieldCheck,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const ROLES_RU: Record<string, string> = {
  admin: 'Администратор',
  recruiter: 'Рекрутер',
  hr: 'HR',
  marketing: 'Маркетинг',
  tb: 'Охрана труда',
  it: 'IT',
  audit: 'Аудит',
  chief_physician: 'Главный врач',
  account_manager: 'Аккаунт-менеджер',
  accounting: 'Бухгалтерия',
  security: 'Служба безопасности',
  hr_adaptation: 'HR-адаптация',
  medical_engineer: 'Медтехник',
};

// Roles that participate in offboarding workflows
const OFFBOARDING_ROLES = [
  'admin', 'hr', 'recruiter',
  'chief_physician', 'it', 'marketing', 'accounting', 'security',
  'hr_adaptation', 'medical_engineer', 'account_manager',
];

// Roles that can manage candidates / create offers
const HIRING_ROLES = ['admin', 'hr', 'recruiter'];

// Roles that can see the full candidates list
const CANDIDATES_ROLES = [
  'admin', 'hr', 'recruiter', 'chief_physician', 'account_manager',
];

interface AppLayoutProps {
  children: React.ReactNode;
  title: string;
  actions?: React.ReactNode;
}

export function AppLayout({ children, title, actions }: AppLayoutProps) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const role = user?.role ?? '';

  const handleLogout = () => {
    logout();
    setLocation('/login');
  };

  const isAdminSection = location.startsWith('/admin');

  const navItems = [
    { href: '/dashboard', label: 'Сводка', icon: LayoutDashboard, show: true },
    { href: '/my-tasks', label: 'Мои задачи (найм)', icon: CheckSquare, show: true },
    { href: '/termination-tasks', label: 'Мои задачи (увольнение)', icon: ClipboardList, show: OFFBOARDING_ROLES.includes(role) },
    { href: '/candidates', label: 'Кандидаты', icon: Users, show: CANDIDATES_ROLES.includes(role) },
    { href: '/termination', label: 'Увольнения', icon: UserMinus, show: HIRING_ROLES.includes(role) || role === 'admin' },
    { href: '/admin', label: 'Администрирование', icon: ShieldCheck, show: role === 'admin' },
  ].filter(item => item.show);

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden selection:bg-primary/20">
      {/* Sidebar */}
      <aside className="w-64 flex flex-col border-r border-border bg-sidebar text-sidebar-foreground">
        <div className="h-14 flex items-center px-4 border-b border-sidebar-border bg-sidebar-accent/30 font-semibold tracking-tight">
          <div className="w-6 h-6 rounded bg-primary text-primary-foreground flex items-center justify-center mr-2 shadow-sm">
            <FileText className="w-4 h-4" />
          </div>
          <span className="text-sm">Цифровой обходной лист</span>
        </div>

        <nav className="flex-1 overflow-y-auto py-4 px-3 space-y-1">
          {navItems.map((item) => {
            const isActive = location === item.href || location.startsWith(item.href + '/');
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-3 py-2 text-sm font-medium rounded-md transition-colors",
                  isActive
                    ? "bg-primary text-primary-foreground shadow-sm"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                )}
              >
                <item.icon className="w-4 h-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        {/* User context */}
        <div className="p-4 border-t border-sidebar-border">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button className="flex w-full items-center gap-3 px-2 py-2 rounded-md hover:bg-sidebar-accent text-left transition-colors">
                <div className="w-8 h-8 rounded-full bg-primary/20 flex items-center justify-center text-primary flex-shrink-0">
                  <UserIcon className="w-4 h-4" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium truncate">{user?.fullName}</div>
                  <div className="text-xs text-sidebar-foreground/50 truncate">
                    {user?.role ? (ROLES_RU[user.role] ?? user.role) : 'Загрузка...'}
                  </div>
                </div>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuLabel>
                <div className="font-normal">
                  <div className="font-medium text-sm text-foreground">{user?.fullName}</div>
                  <div className="text-xs text-muted-foreground">{user?.email}</div>
                </div>
              </DropdownMenuLabel>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={handleLogout} className="text-destructive focus:bg-destructive focus:text-destructive-foreground cursor-pointer">
                <LogOut className="mr-2 h-4 w-4" />
                <span>Выйти</span>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-14 flex items-center justify-between px-6 border-b border-border bg-card shadow-sm z-10">
          <h1 className="text-lg font-semibold tracking-tight">{title}</h1>
          <div className="flex items-center gap-3">
            {actions}
          </div>
        </header>

        <div className="flex-1 overflow-y-auto bg-background p-6">
          <div className="max-w-6xl mx-auto">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
