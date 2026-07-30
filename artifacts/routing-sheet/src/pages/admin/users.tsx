import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/components/auth/AuthContext';
import { useListUsers, useCreateUser, useUpdateUser, useListBranches, getListUsersQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { UserPlus, Pencil, Search, Shield } from 'lucide-react';

const ALL_ROLES = [
  { value: 'admin', label: 'Администратор' },
  { value: 'recruiter', label: 'Рекрутер' },
  { value: 'hr', label: 'HR' },
  { value: 'marketing', label: 'Маркетинг' },
  { value: 'tb', label: 'Охрана труда' },
  { value: 'it', label: 'IT' },
  { value: 'audit', label: 'Аудит' },
  { value: 'chief_physician', label: 'Главный врач' },
  { value: 'account_manager', label: 'Аккаунт-менеджер' },
  { value: 'accounting', label: 'Бухгалтерия' },
  { value: 'security', label: 'Служба безопасности' },
  { value: 'hr_adaptation', label: 'HR-адаптация' },
  { value: 'medical_engineer', label: 'Медтехник' },
];

interface UserForm { fullName: string; email: string; password: string; role: string; branchId: string; isActive: boolean; }
const EMPTY_FORM: UserForm = { fullName: '', email: '', password: '', role: 'recruiter', branchId: '', isActive: true };

export default function AdminUsers() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<UserForm>(EMPTY_FORM);

  const { data: users = [], isLoading } = useListUsers();
  const { data: branches = [] } = useListBranches();
  const createUser = useCreateUser();
  const updateUser = useUpdateUser();

  if (user?.role !== 'admin') {
    return <AppLayout title="Доступ запрещён"><div className="text-center py-16 text-muted-foreground"><Shield className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Только для администраторов</p></div></AppLayout>;
  }

  const filtered = users.filter(u =>
    u.fullName.toLowerCase().includes(search.toLowerCase()) ||
    u.email.toLowerCase().includes(search.toLowerCase())
  );

  const openCreate = () => { setEditId(null); setForm(EMPTY_FORM); setDialogOpen(true); };
  const openEdit = (u: typeof users[0]) => {
    setEditId(u.id);
    setForm({ fullName: u.fullName, email: u.email, password: '', role: u.role, branchId: String(u.branchId ?? ''), isActive: u.isActive });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const branchId = form.branchId ? Number(form.branchId) : undefined;
      if (editId) {
        const payload: any = { fullName: form.fullName, email: form.email, role: form.role as any, isActive: form.isActive, branchId };
        if (form.password) payload.password = form.password;
        await updateUser.mutateAsync({ id: editId, data: payload });
        toast({ title: 'Пользователь обновлён' });
      } else {
        await createUser.mutateAsync({ data: { fullName: form.fullName, email: form.email, password: form.password || 'changeme123', role: form.role as any, branchId } });
        toast({ title: 'Пользователь создан' });
      }
      qc.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setDialogOpen(false);
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось сохранить пользователя', variant: 'destructive' });
    }
  };

  const branchName = (id?: number | null) => branches.find(b => b.id === id)?.name ?? '—';
  const roleName = (r: string) => ALL_ROLES.find(x => x.value === r)?.label ?? r;

  return (
    <AppLayout title="Пользователи" actions={<Button size="sm" onClick={openCreate}><UserPlus className="w-4 h-4 mr-2" />Создать</Button>}>
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Поиск по имени или email…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {isLoading ? <div className="text-center py-12 text-muted-foreground">Загрузка…</div> : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['ФИО', 'Email', 'Роль', 'Филиал', 'Статус', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(u => (
                <tr key={u.id} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{u.fullName}</td>
                  <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                  <td className="px-4 py-3"><Badge variant="outline" className="text-xs">{roleName(u.role)}</Badge></td>
                  <td className="px-4 py-3 text-muted-foreground">{branchName(u.branchId)}</td>
                  <td className="px-4 py-3">
                    <Badge variant={u.isActive ? 'default' : 'secondary'} className="text-xs">
                      {u.isActive ? 'Активен' : 'Деактивирован'}
                    </Badge>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(u)}><Pencil className="w-4 h-4" /></Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-muted-foreground">Пользователи не найдены</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? 'Редактировать пользователя' : 'Новый пользователь'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>ФИО</Label>
              <Input value={form.fullName} onChange={e => setForm(f => ({ ...f, fullName: e.target.value }))} placeholder="Иванов Иван Иванович" />
            </div>
            <div className="space-y-1">
              <Label>Email</Label>
              <Input value={form.email} onChange={e => setForm(f => ({ ...f, email: e.target.value }))} placeholder="user@clinic.ru" />
            </div>
            <div className="space-y-1">
              <Label>{editId ? 'Новый пароль (оставьте пустым, чтобы не менять)' : 'Пароль'}</Label>
              <Input type="password" value={form.password} onChange={e => setForm(f => ({ ...f, password: e.target.value }))} placeholder={editId ? '••••••••' : 'Минимум 8 символов'} />
            </div>
            <div className="space-y-1">
              <Label>Роль</Label>
              <Select value={form.role} onValueChange={v => setForm(f => ({ ...f, role: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{ALL_ROLES.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Филиал</Label>
              <Select value={form.branchId || '__none'} onValueChange={v => setForm(f => ({ ...f, branchId: v === '__none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Не выбран" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Не выбран</SelectItem>
                  {branches.map(b => <SelectItem key={b.id} value={String(b.id)}>{b.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            {editId && (
              <div className="flex items-center gap-3">
                <Switch checked={form.isActive} onCheckedChange={v => setForm(f => ({ ...f, isActive: v }))} />
                <Label>Активен</Label>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={createUser.isPending || updateUser.isPending}>
              {editId ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
