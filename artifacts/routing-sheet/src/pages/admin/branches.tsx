import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/components/auth/AuthContext';
import { useListBranches, useCreateBranch, useUpdateBranch, useListUsers, getListBranchesQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Shield } from 'lucide-react';

interface BranchForm { name: string; chiefPhysicianId: string; deputyChiefPhysicianId: string; }
const EMPTY: BranchForm = { name: '', chiefPhysicianId: '', deputyChiefPhysicianId: '' };

export default function AdminBranches() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<BranchForm>(EMPTY);

  const { data: branches = [], isLoading } = useListBranches();
  const { data: users = [] } = useListUsers();
  const createBranch = useCreateBranch();
  const updateBranch = useUpdateBranch();

  if (user?.role !== 'admin') {
    return <AppLayout title="Доступ запрещён"><div className="text-center py-16 text-muted-foreground"><Shield className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Только для администраторов</p></div></AppLayout>;
  }

  const physicians = users.filter(u => u.role === 'chief_physician' && u.isActive);
  const userName = (id?: number | null) => users.find(u => u.id === id)?.fullName ?? '—';

  const openCreate = () => { setEditId(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (b: typeof branches[0]) => {
    setEditId(b.id);
    setForm({ name: b.name, chiefPhysicianId: String(b.chiefPhysicianId ?? ''), deputyChiefPhysicianId: String(b.deputyChiefPhysicianId ?? '') });
    setDialogOpen(true);
  };

  const handleSave = async () => {
    try {
      const payload = {
        name: form.name,
        chiefPhysicianId: form.chiefPhysicianId ? Number(form.chiefPhysicianId) : undefined,
        deputyChiefPhysicianId: form.deputyChiefPhysicianId ? Number(form.deputyChiefPhysicianId) : undefined,
      };
      if (editId) {
        await updateBranch.mutateAsync({ id: editId, data: payload });
        toast({ title: 'Филиал обновлён' });
      } else {
        await createBranch.mutateAsync({ data: payload });
        toast({ title: 'Филиал создан' });
      }
      qc.invalidateQueries({ queryKey: getListBranchesQueryKey() });
      setDialogOpen(false);
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось сохранить филиал', variant: 'destructive' });
    }
  };

  return (
    <AppLayout title="Филиалы" actions={<Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Добавить</Button>}>
      {isLoading ? <div className="text-center py-12 text-muted-foreground">Загрузка…</div> : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['Название', 'Главный врач', 'Заместитель', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {branches.map(b => (
                <tr key={b.id} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{b.name}</td>
                  <td className="px-4 py-3 text-muted-foreground">{userName(b.chiefPhysicianId)}</td>
                  <td className="px-4 py-3 text-muted-foreground">{userName(b.deputyChiefPhysicianId)}</td>
                  <td className="px-4 py-3 text-right">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(b)}><Pencil className="w-4 h-4" /></Button>
                  </td>
                </tr>
              ))}
              {branches.length === 0 && (
                <tr><td colSpan={4} className="px-4 py-8 text-center text-muted-foreground">Филиалы не добавлены</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>{editId ? 'Редактировать филиал' : 'Новый филиал'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Название филиала</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Клиника №1, г. Москва" />
            </div>
            <div className="space-y-1">
              <Label>Главный врач</Label>
              <Select value={form.chiefPhysicianId || '__none'} onValueChange={v => setForm(f => ({ ...f, chiefPhysicianId: v === '__none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Не выбран" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Не выбран</SelectItem>
                  {physicians.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Заместитель главного врача</Label>
              <Select value={form.deputyChiefPhysicianId || '__none'} onValueChange={v => setForm(f => ({ ...f, deputyChiefPhysicianId: v === '__none' ? '' : v }))}>
                <SelectTrigger><SelectValue placeholder="Не выбран" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none">Не выбран</SelectItem>
                  {physicians.map(u => <SelectItem key={u.id} value={String(u.id)}>{u.fullName}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={createBranch.isPending || updateBranch.isPending}>
              {editId ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}
