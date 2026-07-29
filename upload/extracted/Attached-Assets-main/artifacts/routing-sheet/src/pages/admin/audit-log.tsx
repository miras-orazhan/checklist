import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/components/auth/AuthContext';
import { useGetAuditLog, useListUsers } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ChevronLeft, ChevronRight, Search, Shield, Download } from 'lucide-react';
import { cn } from '@/lib/utils';

const OBJECT_TYPES = ['routing_sheet', 'routing_step', 'termination_sheet', 'termination_step', 'offer', 'candidate', 'user', 'email_template', 'integration_config'];
const PAGE_SIZE = 50;

const ACTION_BADGE_COLOR: Record<string, string> = {
  create: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  complete: 'bg-blue-50 text-blue-700 border-blue-200',
  approve: 'bg-blue-50 text-blue-700 border-blue-200',
  reject: 'bg-red-50 text-red-700 border-red-200',
  override: 'bg-amber-50 text-amber-700 border-amber-200',
  close: 'bg-gray-50 text-gray-700 border-gray-200',
  restore: 'bg-purple-50 text-purple-700 border-purple-200',
};

function actionColor(action: string): string {
  const key = Object.keys(ACTION_BADGE_COLOR).find(k => action.includes(k));
  return key ? ACTION_BADGE_COLOR[key] : 'bg-muted text-muted-foreground';
}

function formatDateTime(d: string) {
  return new Date(d).toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
}

export default function AdminAuditLog() {
  const { user } = useAuth();
  const [offset, setOffset] = useState(0);
  const [actorId, setActorId] = useState('');
  const [action, setAction] = useState('');
  const [objectType, setObjectType] = useState('');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const params: any = { limit: PAGE_SIZE, offset };
  if (actorId) params.actorId = Number(actorId);
  if (action) params.action = action;
  if (objectType) params.objectType = objectType;
  if (from) params.from = from;
  if (to) params.to = to;

  const { data, isLoading } = useGetAuditLog(params);
  const { data: users = [] } = useListUsers();

  if (user?.role !== 'admin') {
    return <AppLayout title="Доступ запрещён"><div className="text-center py-16 text-muted-foreground"><Shield className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Только для администраторов</p></div></AppLayout>;
  }

  const items = data?.items ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.floor(offset / PAGE_SIZE) + 1;

  const handleFilter = () => setOffset(0);

  const exportCsv = () => {
    const rows = [['ID', 'Дата', 'Пользователь', 'Действие', 'Объект', 'ID объекта', 'Детали']];
    items.forEach(e => rows.push([String(e.id), e.createdAt, e.actorName, e.action, e.objectType, String(e.objectId ?? ''), e.details ?? '']));
    const csv = rows.map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'audit_log.csv'; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout title="Журнал аудита" actions={
      <Button size="sm" variant="outline" onClick={exportCsv} disabled={items.length === 0}>
        <Download className="w-4 h-4 mr-2" />CSV
      </Button>
    }>
      {/* Filters */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 mb-4 p-4 bg-muted/30 rounded-lg border">
        <div className="space-y-1">
          <Label className="text-xs">Пользователь</Label>
          <Select value={actorId || '__all'} onValueChange={v => setActorId(v === '__all' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Все" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Все</SelectItem>
              {users.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Действие</Label>
          <Input className="h-8 text-xs" placeholder="create, approve…" value={action} onChange={e => setAction(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">Тип объекта</Label>
          <Select value={objectType || '__all'} onValueChange={v => setObjectType(v === '__all' ? '' : v)}>
            <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Все" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all">Все</SelectItem>
              {OBJECT_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">С даты</Label>
          <Input type="date" className="h-8 text-xs" value={from} onChange={e => setFrom(e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label className="text-xs">По дату</Label>
          <Input type="date" className="h-8 text-xs" value={to} onChange={e => setTo(e.target.value)} />
        </div>
        <div className="flex items-end">
          <Button size="sm" onClick={handleFilter} className="w-full h-8">
            <Search className="w-3 h-3 mr-1" />Применить
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? <div className="text-center py-12 text-muted-foreground">Загрузка…</div> : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['Дата', 'Пользователь', 'Действие', 'Объект', 'Детали'].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {items.map(e => (
                <tr key={e.id} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-2 text-xs text-muted-foreground whitespace-nowrap">{formatDateTime(e.createdAt)}</td>
                  <td className="px-4 py-2 font-medium text-sm">{e.actorName}</td>
                  <td className="px-4 py-2">
                    <span className={cn('text-xs px-2 py-0.5 rounded border', actionColor(e.action))}>{e.action}</span>
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">
                    {e.objectType}{e.objectId ? ` #${e.objectId}` : ''}
                  </td>
                  <td className="px-4 py-2 text-xs text-muted-foreground max-w-xs truncate">{e.details ?? '—'}</td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">Записи не найдены</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {total > PAGE_SIZE && (
        <div className="flex items-center justify-between mt-4 text-sm text-muted-foreground">
          <span>Записей: {total}, страница {currentPage} из {totalPages}</span>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button size="sm" variant="outline" disabled={offset + PAGE_SIZE >= total} onClick={() => setOffset(offset + PAGE_SIZE)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}
    </AppLayout>
  );
}
