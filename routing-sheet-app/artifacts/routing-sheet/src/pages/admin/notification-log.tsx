import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/components/auth/AuthContext';
import { useListNotificationLog } from '@workspace/api-client-react';
import { Badge } from '@/components/ui/badge';
import { Shield, CheckCircle2, XCircle, MinusCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

const STATUS_ICONS = {
  sent: <CheckCircle2 className="w-4 h-4 text-emerald-600" />,
  failed: <XCircle className="w-4 h-4 text-destructive" />,
  skipped: <MinusCircle className="w-4 h-4 text-muted-foreground" />,
};

export default function AdminNotificationLog() {
  const { user } = useAuth();
  const { data: entries = [], isLoading } = useListNotificationLog({ limit: 200 });

  if (user?.role !== 'admin') {
    return <AppLayout title="Доступ запрещён"><div className="text-center py-16 text-muted-foreground"><Shield className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Только для администраторов</p></div></AppLayout>;
  }

  return (
    <AppLayout title="Журнал уведомлений">
      <p className="text-sm text-muted-foreground mb-4">Последние 200 исходящих уведомлений (email, мессенджер, SMS)</p>
      {isLoading ? <div className="text-center py-12 text-muted-foreground">Загрузка…</div> : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['Дата', 'Канал', 'Получатель', 'Тема', 'Статус', 'Ошибка'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {entries.map(e => (
                <tr key={e.id} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                  <td className="px-4 py-2"><Badge variant="outline" className="text-xs">{e.channel}</Badge></td>
                  <td className="px-4 py-2 text-xs max-w-[150px] truncate">{e.recipient}</td>
                  <td className="px-4 py-2 text-xs max-w-xs truncate">{e.subject}</td>
                  <td className="px-4 py-2">
                    <div className="flex items-center gap-1">
                      {STATUS_ICONS[e.status as keyof typeof STATUS_ICONS] ?? null}
                      <span className="text-xs">{e.status}</span>
                    </div>
                  </td>
                  <td className="px-4 py-2 text-xs text-destructive max-w-xs truncate">{e.errorMessage ?? '—'}</td>
                </tr>
              ))}
              {entries.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Уведомлений нет</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
