import React, { useState, useMemo } from 'react';
import { useLocation } from 'wouter';
import { AppLayout } from '@/components/layout/AppLayout';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Search, IdCard, Users, UserCheck, UserMinus, Filter, Download } from 'lucide-react';
import { customFetch } from '@workspace/api-client-react';
import { useToast } from '@/hooks/use-toast';

// ─── Types ───────────────────────────────────────────────────────────────────
interface EmployeeRow {
  id: number;
  personKind: 'hired' | 'terminated';
  sheetId: number;
  sheetStatus: string;
  employeeStatus: string;
  employeeStatusCode: string;
  lastName: string;
  firstName: string;
  middleName: string | null;
  fullName: string;
  email: string;
  phone: string;
  iin: string;
  birthDate: string | null;
  gender: string | null;
  branchId: number;
  branchName: string;
  positionId: number;
  positionName: string;
  isDoctor: boolean;
  hireDate: string | null;
  terminationDate: string | null;
  createdAt: string;
}

interface Branch { id: number; name: string; }
interface Position { id: number; name: string; isDoctor: boolean; }

// ─── Status helpers ─────────────────────────────────────────────────────────
const STATUS_STYLES: Record<string, { variant: 'default' | 'secondary' | 'outline' | 'destructive'; className: string }> = {
  onboarding:      { variant: 'outline',    className: 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300' },
  active:          { variant: 'outline',    className: 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300' },
  hire_cancelled:  { variant: 'outline',    className: 'bg-gray-100 text-gray-700 border-gray-200 dark:bg-gray-800 dark:text-gray-400' },
  terminating:     { variant: 'outline',    className: 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300' },
  terminated:      { variant: 'outline',    className: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300' },
  term_stopped:    { variant: 'outline',    className: 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/30 dark:text-red-300' },
};

const STATUS_FILTER_OPTIONS = [
  { value: 'all',          label: 'Все статусы' },
  { value: 'onboarding',   label: 'Оформляется' },
  { value: 'active',       label: 'Работает' },
  { value: 'terminating',  label: 'Увольняется' },
  { value: 'terminated',   label: 'Уволен' },
  { value: 'hire_cancelled', label: 'Найм отменён' },
  { value: 'term_stopped', label: 'Увольнение остановлено' },
];

const GENDER_LABELS: Record<string, string> = { male: 'М', female: 'Ж' };

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

// ─── Main page ───────────────────────────────────────────────────────────────
export default function Employees() {
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  const [rows, setRows] = useState<EmployeeRow[]>([]);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [positions, setPositions] = useState<Position[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [branchFilter, setBranchFilter] = useState<string>('all');
  const [positionFilter, setPositionFilter] = useState<string>('all');
  const [doctorFilter, setDoctorFilter] = useState<string>('all');

  // Load all data on mount
  React.useEffect(() => {
    const token = localStorage.getItem('auth_token');
    Promise.all([
      customFetch<EmployeeRow[]>('/api/employees', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      customFetch<Branch[]>('/api/branches', {
        headers: { Authorization: `Bearer ${token}` },
      }),
      customFetch<Position[]>('/api/positions', {
        headers: { Authorization: `Bearer ${token}` },
      }),
    ])
      .then(([emps, brs, pos]) => {
        setRows(emps);
        setBranches(brs);
        setPositions(pos);
      })
      .catch((err: any) => {
        setError(err?.message || 'Не удалось загрузить реестр');
        toast({
          variant: 'destructive',
          title: 'Ошибка загрузки',
          description: err?.message || 'Не удалось загрузить реестр сотрудников',
        });
      })
      .finally(() => setIsLoading(false));
  }, [toast]);

  // Apply filters client-side (data volume is small)
  const filteredRows = useMemo(() => {
    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.employeeStatusCode !== statusFilter) return false;
      if (branchFilter !== 'all' && r.branchId !== Number(branchFilter)) return false;
      if (positionFilter !== 'all' && r.positionId !== Number(positionFilter)) return false;
      if (doctorFilter === 'true' && !r.isDoctor) return false;
      if (doctorFilter === 'false' && r.isDoctor) return false;
      if (searchTerm) {
        const q = searchTerm.toLowerCase();
        const matches =
          r.fullName.toLowerCase().includes(q) ||
          r.email.toLowerCase().includes(q) ||
          r.iin.includes(searchTerm) ||
          r.phone.includes(searchTerm);
        if (!matches) return false;
      }
      return true;
    });
  }, [rows, statusFilter, branchFilter, positionFilter, doctorFilter, searchTerm]);

  // Summary stats
  const stats = useMemo(() => {
    const s = {
      total: rows.length,
      active: 0,
      onboarding: 0,
      terminating: 0,
      terminated: 0,
    };
    for (const r of rows) {
      if (r.employeeStatusCode === 'active') s.active++;
      else if (r.employeeStatusCode === 'onboarding') s.onboarding++;
      else if (r.employeeStatusCode === 'terminating') s.terminating++;
      else if (r.employeeStatusCode === 'terminated') s.terminated++;
    }
    return s;
  }, [rows]);

  // CSV export
  const handleExportCsv = () => {
    const headers = [
      'ФИО', 'ИИН', 'Дата рождения', 'Пол', 'Email', 'Телефон',
      'Филиал', 'Должность', 'Врач', 'Статус', 'Дата найма', 'Дата увольнения',
    ];
    const lines = [headers.join(',')];
    for (const r of filteredRows) {
      const cells = [
        r.fullName,
        r.iin,
        r.birthDate ? formatDate(r.birthDate) : '',
        r.gender ? GENDER_LABELS[r.gender] ?? r.gender : '',
        r.email,
        r.phone,
        r.branchName,
        r.positionName,
        r.isDoctor ? 'Да' : 'Нет',
        r.employeeStatus,
        r.hireDate ? formatDate(r.hireDate) : '',
        r.terminationDate ? formatDate(r.terminationDate) : '',
      ].map((c) => {
        const s = String(c ?? '');
        if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
        return s;
      });
      lines.push(cells.join(','));
    }
    const csv = '\uFEFF' + lines.join('\n'); // BOM for Excel
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `employees-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppLayout
      title="Реестр сотрудников"
      actions={
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={filteredRows.length === 0}>
          <Download className="w-4 h-4 mr-2" />
          Экспорт CSV
        </Button>
      }
    >
      {/* Summary stats */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <IdCard className="w-4 h-4 text-primary" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Всего</div>
                <div className="text-xl font-bold">{stats.total}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-emerald-100 flex items-center justify-center">
                <UserCheck className="w-4 h-4 text-emerald-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Работает</div>
                <div className="text-xl font-bold text-emerald-700">{stats.active}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-amber-100 flex items-center justify-center">
                <Users className="w-4 h-4 text-amber-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Оформляется</div>
                <div className="text-xl font-bold text-amber-700">{stats.onboarding}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-orange-100 flex items-center justify-center">
                <UserMinus className="w-4 h-4 text-orange-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Увольняется</div>
                <div className="text-xl font-bold text-orange-700">{stats.terminating}</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-sm">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <div className="w-9 h-9 rounded-lg bg-red-100 flex items-center justify-center">
                <UserMinus className="w-4 h-4 text-red-600" />
              </div>
              <div>
                <div className="text-xs text-muted-foreground uppercase tracking-wide">Уволен</div>
                <div className="text-xl font-bold text-red-700">{stats.terminated}</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="mb-6 shadow-sm">
        <CardContent className="p-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            <div className="md:col-span-2 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground w-4 h-4" />
              <Input
                placeholder="Поиск по ФИО, ИИН, email, телефону..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Статус" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_FILTER_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={branchFilter} onValueChange={setBranchFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Филиал" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все филиалы</SelectItem>
                {branches.map((b) => (
                  <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={positionFilter} onValueChange={setPositionFilter}>
              <SelectTrigger>
                <SelectValue placeholder="Должность" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все должности</SelectItem>
                {positions.map((p) => (
                  <SelectItem key={p.id} value={String(p.id)}>
                    {p.name}{p.isDoctor ? ' (врач)' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2 mt-3">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs text-muted-foreground mr-2">Врач:</span>
            <Select value={doctorFilter} onValueChange={setDoctorFilter}>
              <SelectTrigger className="w-40 h-8 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Все</SelectItem>
                <SelectItem value="true">Только врачи</SelectItem>
                <SelectItem value="false">Только не-врачи</SelectItem>
              </SelectContent>
            </Select>
            <div className="flex-1" />
            <span className="text-xs text-muted-foreground">
              Найдено: <strong className="text-foreground">{filteredRows.length}</strong> из {rows.length}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* Table */}
      {isLoading ? (
        <div className="flex justify-center p-12">
          <Loader2 className="w-8 h-8 animate-spin text-primary" />
        </div>
      ) : error ? (
        <Card className="border-destructive">
          <CardContent className="p-6 text-center text-destructive">
            {error}
          </CardContent>
        </Card>
      ) : filteredRows.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground">
            <IdCard className="w-12 h-12 mx-auto mb-4 opacity-40" />
            <p>Сотрудники не найдены. Измените параметры фильтра.</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted/50 border-b">
                <tr>
                  <th className="px-3 py-3 font-medium text-muted-foreground">ФИО / Контакты</th>
                  <th className="px-3 py-3 font-medium text-muted-foreground">ИИН</th>
                  <th className="px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">Рождение</th>
                  <th className="px-3 py-3 font-medium text-muted-foreground">Филиал / Должность</th>
                  <th className="px-3 py-3 font-medium text-muted-foreground">Статус</th>
                  <th className="px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">Найм</th>
                  <th className="px-3 py-3 font-medium text-muted-foreground whitespace-nowrap">Увольнение</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filteredRows.map((r) => {
                  const styleInfo = STATUS_STYLES[r.employeeStatusCode] ?? STATUS_STYLES.active;
                  return (
                    <tr
                      key={r.id}
                      className="hover:bg-muted/30 transition-colors cursor-pointer"
                      onClick={() => {
                        if (r.personKind === 'hired') {
                          // Navigate to candidates list — admin can click through to detail
                          setLocation('/candidates');
                        } else {
                          setLocation(`/termination/${r.sheetId}`);
                        }
                      }}
                    >
                      <td className="px-3 py-3">
                        <div className="font-medium text-foreground flex items-center gap-2">
                          {r.fullName}
                          {r.isDoctor && (
                            <Badge variant="outline" className="text-[10px] py-0 h-4 bg-blue-50 text-blue-700 border-blue-200">
                              Врач
                            </Badge>
                          )}
                        </div>
                        {r.email && (
                          <div className="text-xs text-muted-foreground mt-0.5">{r.email}</div>
                        )}
                        {r.phone && (
                          <div className="text-xs text-muted-foreground">{r.phone}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <span className="font-mono text-xs">{r.iin || '—'}</span>
                      </td>
                      <td className="px-3 py-3 whitespace-nowrap">
                        <div className="text-xs">{formatDate(r.birthDate)}</div>
                        {r.gender && (
                          <div className="text-xs text-muted-foreground">{GENDER_LABELS[r.gender] ?? r.gender}</div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="text-sm">{r.branchName || '—'}</div>
                        <div className="text-xs text-muted-foreground">{r.positionName || '—'}</div>
                      </td>
                      <td className="px-3 py-3">
                        <Badge variant={styleInfo.variant} className={`text-xs ${styleInfo.className}`}>
                          {r.employeeStatus}
                        </Badge>
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(r.hireDate)}
                      </td>
                      <td className="px-3 py-3 text-xs text-muted-foreground whitespace-nowrap">
                        {formatDate(r.terminationDate)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </AppLayout>
  );
}
