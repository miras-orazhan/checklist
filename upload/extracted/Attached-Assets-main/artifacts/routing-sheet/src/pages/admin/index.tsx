import React from 'react';
import { Link } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/components/auth/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Building2, Briefcase, Mail, Plug, BarChart3, ClipboardList, RotateCcw, Shield } from 'lucide-react';

const ADMIN_SECTIONS = [
  { href: '/admin/users', icon: Users, title: 'Пользователи', description: 'Создание, редактирование, деактивация учётных записей' },
  { href: '/admin/branches', icon: Building2, title: 'Филиалы', description: 'Структура филиалов, главные врачи, заместители' },
  { href: '/admin/positions', icon: Briefcase, title: 'Должности', description: 'Справочник должностей, признак врача' },
  { href: '/admin/email-templates', icon: Mail, title: 'Email-шаблоны', description: 'Редактирование текстов транзакционных писем' },
  { href: '/admin/integrations', icon: Plug, title: 'Интеграции и SLA', description: 'GAS, Bitrix24, пороги SLA по шагам' },
  { href: '/admin/audit-log', icon: BarChart3, title: 'Журнал аудита', description: 'Полная история действий с фильтрами' },
  { href: '/admin/notification-log', icon: ClipboardList, title: 'Журнал уведомлений', description: 'Лог отправленных email и сообщений' },
  { href: '/admin/termination-restore', icon: RotateCcw, title: 'Восстановление увольнений', description: 'Список остановленных процессов увольнения с кнопкой восстановления' },
];

export default function AdminHub() {
  const { user } = useAuth();

  if (user?.role !== 'admin') {
    return (
      <AppLayout title="Доступ запрещён">
        <div className="text-center py-16 text-muted-foreground">
          <Shield className="w-12 h-12 mx-auto mb-4 opacity-40" />
          <p>Этот раздел доступен только администраторам.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Администрирование">
      <div className="mb-6">
        <p className="text-muted-foreground text-sm">Управление системой, конфигурация и мониторинг</p>
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
        {ADMIN_SECTIONS.map(({ href, icon: Icon, title, description }) => (
          <Link key={href} href={href}>
            <Card className="h-full cursor-pointer hover:border-primary/50 hover:shadow-md transition-all group">
              <CardHeader className="pb-2">
                <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center mb-2 group-hover:bg-primary/20 transition-colors">
                  <Icon className="w-5 h-5 text-primary" />
                </div>
                <CardTitle className="text-base">{title}</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription className="text-xs">{description}</CardDescription>
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </AppLayout>
  );
}
