import React, { useState } from 'react';
import { useLocation, Link } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { useListCandidates } from '@workspace/api-client-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus, Search, UserPlus, FileText } from 'lucide-react';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export default function Candidates() {
  const [location, setLocation] = useLocation();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  
  const { data: candidates = [], isLoading } = useListCandidates();

  const filteredCandidates = candidates.filter(c => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = c.fullName.toLowerCase().includes(q) ||
                          c.email.toLowerCase().includes(q) ||
                          c.phone.includes(searchTerm) ||
                          (c.iin || '').includes(searchTerm);
    const matchesStatus = statusFilter === 'all' || c.offerStatus === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const getStatusBadge = (status: string) => {
    switch(status) {
      case 'draft': return <Badge variant="outline" className="bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">Черновик</Badge>;
      case 'sent': return <Badge variant="outline" className="bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300">Отправлен</Badge>;
      case 'accepted': return <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300">Принят</Badge>;
      case 'expired': return <Badge variant="outline" className="bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300">Истек</Badge>;
      default: return <Badge variant="outline">{status}</Badge>;
    }
  };

  return (
    <AppLayout 
      title="Кандидаты" 
      actions={
        <Button onClick={() => setLocation('/candidates/new')} size="sm">
          <UserPlus className="w-4 h-4 mr-2" />
          Добавить кандидата
        </Button>
      }
    >
      <Card className="mb-6 bg-card border-border shadow-sm">
        <CardContent className="p-4 flex flex-col sm:flex-row gap-4 items-center">
          <div className="relative flex-1 w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
            <Input 
              placeholder="Поиск по ФИО, email, телефону, ИИН..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 bg-background w-full"
            />
          </div>
          <div className="w-full sm:w-48">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Статус оффера" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все статусы</SelectItem>
                <SelectItem value="draft">Черновик</SelectItem>
                <SelectItem value="sent">Отправлен</SelectItem>
                <SelectItem value="accepted">Принят</SelectItem>
                <SelectItem value="expired">Истек</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : filteredCandidates.length === 0 ? (
        <div className="text-center p-12 border border-dashed rounded-lg bg-card">
          <FileText className="w-12 h-12 text-muted-foreground mx-auto mb-4 opacity-50" />
          <h3 className="text-lg font-medium text-foreground">Кандидаты не найдены</h3>
          <p className="text-sm text-muted-foreground mt-1 mb-4">Попробуйте изменить параметры поиска или добавьте нового кандидата.</p>
          <Button onClick={() => setLocation('/candidates/new')} variant="outline">
            <UserPlus className="w-4 h-4 mr-2" />
            Добавить кандидата
          </Button>
        </div>
      ) : (
        <div className="border border-border rounded-lg bg-card overflow-hidden shadow-sm">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 border-b border-border">
              <tr>
                <th className="px-4 py-3 font-medium text-muted-foreground w-1/3">ФИО / Контакты</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Добавлен</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Статус оффера</th>
                <th className="px-4 py-3 font-medium text-muted-foreground">Обходной лист</th>
                <th className="px-4 py-3 font-medium text-muted-foreground text-right">Действия</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filteredCandidates.map((c) => (
                <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-medium text-foreground">{c.fullName}</div>
                    <div className="text-xs text-muted-foreground mt-0.5">{c.email} • {c.phone}</div>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">
                    {format(new Date(c.createdAt), 'dd MMM yyyy', { locale: ru })}
                  </td>
                  <td className="px-4 py-3">
                    {getStatusBadge(c.offerStatus)}
                  </td>
                  <td className="px-4 py-3">
                    {c.routingSheet ? (
                      <Badge variant="secondary" className="font-mono text-xs">#{c.routingSheet.id} ({c.routingSheet.status})</Badge>
                    ) : (
                      <span className="text-muted-foreground text-xs">—</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => setLocation(`/candidates/${c.id}`)}>
                      Открыть
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </AppLayout>
  );
}
