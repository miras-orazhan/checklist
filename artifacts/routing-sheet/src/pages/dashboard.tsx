import React from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useGetDashboardSummary } from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Users, Loader2, PlayCircle, CheckCircle2, AlertCircle } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell } from 'recharts';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';

export default function Dashboard() {
  const { data: summary, isLoading, error } = useGetDashboardSummary();

  const COLORS = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  if (isLoading) {
    return (
      <AppLayout title="Сводка">
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      </AppLayout>
    );
  }

  if (error || !summary) {
    return (
      <AppLayout title="Сводка">
        <div className="text-destructive p-4 border border-destructive/20 rounded bg-destructive/10">
          Ошибка при загрузке данных
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout title="Сводка по обходным листам">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
        <Card className="hover-elevate transition-all">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Всего кандидатов</p>
              <h3 className="text-3xl font-bold tracking-tight text-foreground font-mono">{summary.totalCandidates}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-blue-500/10 flex items-center justify-center text-blue-500">
              <Users className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="hover-elevate transition-all">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">В процессе</p>
              <h3 className="text-3xl font-bold tracking-tight text-foreground font-mono">{summary.inProgress}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-amber-500/10 flex items-center justify-center text-amber-500">
              <PlayCircle className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
        
        <Card className="hover-elevate transition-all">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground mb-1">Завершено</p>
              <h3 className="text-3xl font-bold tracking-tight text-foreground font-mono">{summary.completed}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 flex items-center justify-center text-emerald-500">
              <CheckCircle2 className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>

        <Card className="hover-elevate transition-all border-primary/50 shadow-sm shadow-primary/10">
          <CardContent className="p-6 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-primary mb-1">Ожидает моего действия</p>
              <h3 className="text-3xl font-bold tracking-tight text-foreground font-mono">{summary.pendingMyAction || 0}</h3>
            </div>
            <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary">
              <AlertCircle className="w-6 h-6" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Кандидаты по филиалам</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full">
              {summary.byBranch.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={summary.byBranch} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" fontSize={12} tickLine={false} axisLine={false} />
                    <YAxis fontSize={12} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip 
                      cursor={{ fill: 'hsl(var(--muted))' }}
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    />
                    <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} maxBarSize={50} />
                  </BarChart>
                </ResponsiveContainer>
              ) : (
                <div className="h-full flex items-center justify-center text-muted-foreground text-sm">Нет данных</div>
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Статусы обходных листов</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-64 w-full flex items-center">
              {summary.byStatus.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={summary.byStatus}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={2}
                      dataKey="count"
                      nameKey="label"
                    >
                      {summary.byStatus.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip 
                      contentStyle={{ backgroundColor: 'hsl(var(--popover))', borderColor: 'hsl(var(--border))', borderRadius: '8px' }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-muted-foreground text-sm">Нет данных</div>
              )}
              {summary.byStatus.length > 0 && (
                <div className="w-1/2 pl-4 flex flex-col justify-center space-y-2">
                  {summary.byStatus.map((entry, index) => (
                    <div key={index} className="flex items-center text-sm">
                      <div className="w-3 h-3 rounded-full mr-2" style={{ backgroundColor: COLORS[index % COLORS.length] }}></div>
                      <span className="flex-1 truncate text-muted-foreground">{entry.label}</span>
                      <span className="font-mono font-medium">{entry.count}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {summary.recentlyCompleted && summary.recentlyCompleted.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-medium uppercase tracking-wider text-muted-foreground">Недавно завершенные (последние 5)</CardTitle>
          </CardHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-y border-border">
                <tr>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Кандидат</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Должность</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Филиал</th>
                  <th className="px-6 py-3 font-medium text-muted-foreground">Дата завершения</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {summary.recentlyCompleted.map((sheet) => (
                  <tr key={sheet.id} className="hover:bg-muted/30 transition-colors">
                    <td className="px-6 py-3 font-medium">{sheet.candidateName}</td>
                    <td className="px-6 py-3 text-muted-foreground">{sheet.positionName || '—'}</td>
                    <td className="px-6 py-3 text-muted-foreground">{sheet.branchName || '—'}</td>
                    <td className="px-6 py-3 text-muted-foreground">
                      {sheet.completedAt ? format(new Date(sheet.completedAt), 'dd MMM yyyy, HH:mm', { locale: ru }) : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppLayout>
  );
}
