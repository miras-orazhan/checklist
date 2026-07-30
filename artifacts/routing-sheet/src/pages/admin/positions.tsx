import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { useAuth } from '@/components/auth/AuthContext';
import { useListPositions, useCreatePosition, useUpdatePosition, useDeletePosition, getListPositionsQueryKey } from '@workspace/api-client-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useToast } from '@/hooks/use-toast';
import { Plus, Pencil, Trash2, Stethoscope, Search, Shield } from 'lucide-react';

interface PosForm { name: string; isDoctor: boolean; }
const EMPTY: PosForm = { name: '', isDoctor: false };

export default function AdminPositions() {
  const { user } = useAuth();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [search, setSearch] = useState('');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState<PosForm>(EMPTY);

  const { data: positions = [], isLoading } = useListPositions();
  const createPos = useCreatePosition();
  const updatePos = useUpdatePosition();
  const deletePos = useDeletePosition();

  if (user?.role !== 'admin') {
    return <AppLayout title="Доступ запрещён"><div className="text-center py-16 text-muted-foreground"><Shield className="w-10 h-10 mx-auto mb-3 opacity-40" /><p>Только для администраторов</p></div></AppLayout>;
  }

  const filtered = positions.filter(p => p.name.toLowerCase().includes(search.toLowerCase()));

  const openCreate = () => { setEditId(null); setForm(EMPTY); setDialogOpen(true); };
  const openEdit = (p: typeof positions[0]) => { setEditId(p.id); setForm({ name: p.name, isDoctor: p.isDoctor }); setDialogOpen(true); };

  const handleSave = async () => {
    try {
      if (editId) {
        await updatePos.mutateAsync({ id: editId, data: form });
        toast({ title: 'Должность обновлена' });
      } else {
        await createPos.mutateAsync({ data: form });
        toast({ title: 'Должность создана' });
      }
      qc.invalidateQueries({ queryKey: getListPositionsQueryKey() });
      setDialogOpen(false);
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось сохранить должность', variant: 'destructive' });
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deletePos.mutateAsync({ id: deleteId });
      toast({ title: 'Должность удалена' });
      qc.invalidateQueries({ queryKey: getListPositionsQueryKey() });
    } catch {
      toast({ title: 'Ошибка', description: 'Не удалось удалить должность', variant: 'destructive' });
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <AppLayout title="Должности" actions={<Button size="sm" onClick={openCreate}><Plus className="w-4 h-4 mr-2" />Добавить</Button>}>
      <div className="mb-4 relative">
        <Search className="absolute left-3 top-2.5 w-4 h-4 text-muted-foreground" />
        <Input className="pl-9" placeholder="Поиск по названию…" value={search} onChange={e => setSearch(e.target.value)} />
      </div>
      {isLoading ? <div className="text-center py-12 text-muted-foreground">Загрузка…</div> : (
        <div className="border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                {['Название', 'Врач', ''].map(h => (
                  <th key={h} className="px-4 py-3 text-left font-medium text-muted-foreground">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(p => (
                <tr key={p.id} className="border-t hover:bg-muted/20">
                  <td className="px-4 py-3 font-medium">{p.name}</td>
                  <td className="px-4 py-3">
                    {p.isDoctor
                      ? <Badge variant="outline" className="text-xs gap-1"><Stethoscope className="w-3 h-3" />Врач</Badge>
                      : <span className="text-muted-foreground text-xs">—</span>}
                  </td>
                  <td className="px-4 py-3 text-right flex gap-1 justify-end">
                    <Button variant="ghost" size="sm" onClick={() => openEdit(p)}><Pencil className="w-4 h-4" /></Button>
                    <Button variant="ghost" size="sm" onClick={() => setDeleteId(p.id)} className="text-destructive hover:text-destructive"><Trash2 className="w-4 h-4" /></Button>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">Должности не найдены</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader><DialogTitle>{editId ? 'Редактировать должность' : 'Новая должность'}</DialogTitle></DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-1">
              <Label>Название</Label>
              <Input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} placeholder="Врач-терапевт" />
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={form.isDoctor} onCheckedChange={v => setForm(f => ({ ...f, isDoctor: v }))} />
              <Label>Медицинская должность (требует заполнения профиля врача)</Label>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>Отмена</Button>
            <Button onClick={handleSave} disabled={createPos.isPending || updatePos.isPending}>
              {editId ? 'Сохранить' : 'Создать'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteId !== null} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Удалить должность?</AlertDialogTitle>
            <AlertDialogDescription>Это действие нельзя отменить. Должность будет удалена из справочника.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Отмена</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">Удалить</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </AppLayout>
  );
}
