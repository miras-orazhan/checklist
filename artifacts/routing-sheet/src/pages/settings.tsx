import React, { useState } from 'react';
import { AppLayout } from '@/components/layout/AppLayout';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  useListUsers, useListBranches, useListPositions, useListRoutingSheets, useGetRecentActivity, useHealthCheck,
  useCreateBranch, useCreatePosition, useCreateUser
} from '@workspace/api-client-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Loader2, Users, Building, Briefcase, FileText, Activity, Server, Plus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { format } from 'date-fns';
import { ru } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/hooks/use-toast';

export default function Settings() {
  const { toast } = useToast();
  const { data: users, isLoading: usersLoading, refetch: refetchUsers } = useListUsers();
  const { data: branches, isLoading: branchesLoading, refetch: refetchBranches } = useListBranches();
  const { data: positions, isLoading: posLoading, refetch: refetchPositions } = useListPositions();
  const { data: sheets, isLoading: sheetsLoading } = useListRoutingSheets();
  const { data: activity, isLoading: actLoading } = useGetRecentActivity();
  const { data: health } = useHealthCheck();

  const createBranch = useCreateBranch();
  const createPosition = useCreatePosition();

  const [newBranchName, setNewBranchName] = useState('');
  const [newPosName, setNewPosName] = useState('');
  const [newPosDoctor, setNewPosDoctor] = useState(false);

  const [openBranch, setOpenBranch] = useState(false);
  const [openPos, setOpenPos] = useState(false);

  const handleCreateBranch = () => {
    createBranch.mutate({ data: { name: newBranchName } }, {
      onSuccess: () => {
        toast({ title: 'Филиал создан' });
        setOpenBranch(false);
        setNewBranchName('');
        refetchBranches();
      }
    });
  };

  const handleCreatePosition = () => {
    createPosition.mutate({ data: { name: newPosName, isDoctor: newPosDoctor } }, {
      onSuccess: () => {
        toast({ title: 'Должность создана' });
        setOpenPos(false);
        setNewPosName('');
        setNewPosDoctor(false);
        refetchPositions();
      }
    });
  };

  return (
    <AppLayout title="Администрирование">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Настройки системы</h2>
          <p className="text-muted-foreground">Управление пользователями, филиалами и должностями</p>
        </div>
        {health && (
          <Badge variant="outline" className="bg-emerald-500/10 text-emerald-500 border-emerald-500/20 gap-2 py-1.5 px-3">
            <Server className="w-3.5 h-3.5" />
            API: {health.status}
          </Badge>
        )}
      </div>

      <Tabs defaultValue="users" className="w-full">
        <TabsList className="grid w-full grid-cols-5 h-12 items-center p-1 bg-muted/50 border border-border">
          <TabsTrigger value="users" className="h-full rounded-md"><Users className="w-4 h-4 mr-2" />Пользователи</TabsTrigger>
          <TabsTrigger value="branches" className="h-full rounded-md"><Building className="w-4 h-4 mr-2" />Филиалы</TabsTrigger>
          <TabsTrigger value="positions" className="h-full rounded-md"><Briefcase className="w-4 h-4 mr-2" />Должности</TabsTrigger>
          <TabsTrigger value="sheets" className="h-full rounded-md"><FileText className="w-4 h-4 mr-2" />Все листы</TabsTrigger>
          <TabsTrigger value="activity" className="h-full rounded-md"><Activity className="w-4 h-4 mr-2" />Журнал</TabsTrigger>
        </TabsList>
        
        <TabsContent value="users" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <div>
                <CardTitle>Пользователи</CardTitle>
                <CardDescription>Управление учетными записями сотрудников HR и руководителей.</CardDescription>
              </div>
              <Button disabled variant="outline"><Plus className="w-4 h-4 mr-2"/> Добавить пользователя</Button>
            </CardHeader>
            <CardContent>
              {usersLoading ? <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin" /></div> : (
                <div className="border rounded-md">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="px-4 py-3 font-medium">ФИО</th>
                        <th className="px-4 py-3 font-medium">Email</th>
                        <th className="px-4 py-3 font-medium">Роль</th>
                        <th className="px-4 py-3 font-medium">Статус</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {users?.map(u => (
                        <tr key={u.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3 font-medium">{u.fullName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{u.email}</td>
                          <td className="px-4 py-3"><Badge variant="outline">{u.role}</Badge></td>
                          <td className="px-4 py-3">
                            <Badge variant={u.isActive ? "default" : "secondary"}>{u.isActive ? "Активен" : "Заблокирован"}</Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="branches" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <div>
                <CardTitle>Филиалы</CardTitle>
                <CardDescription>Список доступных филиалов компании.</CardDescription>
              </div>
              <Dialog open={openBranch} onOpenChange={setOpenBranch}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="w-4 h-4 mr-2"/>Новый филиал</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Создание филиала</DialogTitle>
                  </DialogHeader>
                  <div className="py-4">
                    <label className="text-sm font-medium mb-1 block">Название филиала</label>
                    <Input value={newBranchName} onChange={e => setNewBranchName(e.target.value)} placeholder="Например: Клиника на Ленина" />
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpenBranch(false)}>Отмена</Button>
                    <Button onClick={handleCreateBranch} disabled={!newBranchName || createBranch.isPending}>
                      {createBranch.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Сохранить
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {branchesLoading ? <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin" /></div> : (
                <div className="border rounded-md">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="px-4 py-3 font-medium">ID</th>
                        <th className="px-4 py-3 font-medium">Название филиала</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {branches?.map(b => (
                        <tr key={b.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3 text-muted-foreground">#{b.id}</td>
                          <td className="px-4 py-3 font-medium">{b.name}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="positions" className="mt-6">
          <Card>
            <CardHeader className="flex flex-row justify-between items-center">
              <div>
                <CardTitle>Должности</CardTitle>
                <CardDescription>Справочник должностей. Маркер "Врач" добавляет этап заполнения профиля врача.</CardDescription>
              </div>
              <Dialog open={openPos} onOpenChange={setOpenPos}>
                <DialogTrigger asChild>
                  <Button size="sm"><Plus className="w-4 h-4 mr-2"/>Новая должность</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Создание должности</DialogTitle>
                  </DialogHeader>
                  <div className="py-4 space-y-4">
                    <div>
                      <label className="text-sm font-medium mb-1 block">Название</label>
                      <Input value={newPosName} onChange={e => setNewPosName(e.target.value)} placeholder="Например: Педиатр" />
                    </div>
                    <div className="flex items-center space-x-2">
                      <Checkbox id="isDoc" checked={newPosDoctor} onCheckedChange={(c) => setNewPosDoctor(c as boolean)} />
                      <label htmlFor="isDoc" className="text-sm font-medium">Это медицинский персонал (Врач)</label>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setOpenPos(false)}>Отмена</Button>
                    <Button onClick={handleCreatePosition} disabled={!newPosName || createPosition.isPending}>
                      {createPosition.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null} Сохранить
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </CardHeader>
            <CardContent>
              {posLoading ? <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin" /></div> : (
                <div className="border rounded-md">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="px-4 py-3 font-medium">Название</th>
                        <th className="px-4 py-3 font-medium">Медицинский персонал</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {positions?.map(p => (
                        <tr key={p.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3 font-medium">{p.name}</td>
                          <td className="px-4 py-3">
                            {p.isDoctor ? <Badge className="bg-blue-500 text-white hover:bg-blue-600">Врач</Badge> : <span className="text-muted-foreground">—</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="sheets" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Все обходные листы</CardTitle>
            </CardHeader>
            <CardContent>
              {sheetsLoading ? <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin" /></div> : (
                <div className="border rounded-md">
                  <table className="w-full text-sm text-left">
                    <thead className="bg-muted/50 border-b">
                      <tr>
                        <th className="px-4 py-3 font-medium">ID</th>
                        <th className="px-4 py-3 font-medium">Кандидат</th>
                        <th className="px-4 py-3 font-medium">Должность / Филиал</th>
                        <th className="px-4 py-3 font-medium">Статус</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {sheets?.map(s => (
                        <tr key={s.id} className="hover:bg-muted/20">
                          <td className="px-4 py-3 font-mono text-muted-foreground">#{s.id}</td>
                          <td className="px-4 py-3 font-medium">{s.candidateName}</td>
                          <td className="px-4 py-3 text-muted-foreground">{s.positionName} <br/> <span className="text-xs">{s.branchName}</span></td>
                          <td className="px-4 py-3"><Badge variant="outline">{s.status}</Badge></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="activity" className="mt-6">
          <Card>
            <CardHeader>
              <CardTitle>Журнал действий</CardTitle>
            </CardHeader>
            <CardContent>
              {actLoading ? <div className="flex justify-center p-4"><Loader2 className="w-6 h-6 animate-spin" /></div> : (
                <div className="space-y-4">
                  {activity?.map(a => (
                    <div key={a.id} className="flex gap-4 p-4 border rounded-lg bg-muted/5">
                      <div className="mt-1">
                        <div className="w-2 h-2 rounded-full bg-primary mt-1.5" />
                      </div>
                      <div className="flex-1">
                        <div className="flex justify-between">
                          <p className="text-sm font-medium">{a.actorName} <span className="font-normal text-muted-foreground">{a.action}</span></p>
                          <span className="text-xs text-muted-foreground">{format(new Date(a.createdAt), 'dd MMM HH:mm', { locale: ru })}</span>
                        </div>
                        <p className="text-sm text-muted-foreground mt-1">Объект: {a.objectType} #{a.objectId}</p>
                        {a.details && <p className="text-xs bg-muted/30 p-2 mt-2 rounded border border-border/50 font-mono text-muted-foreground">{a.details}</p>}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

      </Tabs>
    </AppLayout>
  );
}
