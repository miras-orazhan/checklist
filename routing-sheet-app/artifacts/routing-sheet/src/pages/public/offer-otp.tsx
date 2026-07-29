import React, { useState } from 'react';
import { useLocation, useParams } from 'wouter';
import { useGetOfferByToken, getGetOfferByTokenQueryKey, useVerifyOfferOtp } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Loader2, ShieldCheck, ArrowRight } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function OfferOtp() {
  const params = useParams();
  const token = params.token || '';
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [otp, setOtp] = useState('');

  // Load offer to get its numeric ID for the mutation
  const { data: offer } = useGetOfferByToken(token, {
    query: { queryKey: getGetOfferByTokenQueryKey(token), enabled: !!token }
  });
  
  const verifyMutation = useVerifyOfferOtp();

  const handleVerify = (e: React.FormEvent) => {
    e.preventDefault();
    if (otp.length < 6) {
      toast({ variant: 'destructive', title: 'Внимание', description: 'Введите 6-значный код' });
      return;
    }
    if (!offer) return;
    
    verifyMutation.mutate(
      { id: offer.id, data: { token, otp } },
      {
        onSuccess: (data) => {
          toast({ title: 'Успешно', description: 'Код подтвержден. Оффер принят!' });
          const statusToken = (data as any)?.statusToken;
          setLocation(`/status/${statusToken || token}`);
        },
        onError: (err: any) => {
          toast({ variant: 'destructive', title: 'Ошибка', description: err?.data?.error || 'Неверный код' });
        }
      }
    );
  };

  return (
    <div className="min-h-[100dvh] flex flex-col items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="w-full max-w-md space-y-6">
        
        <div className="text-center space-y-2 mb-8">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500 text-white flex items-center justify-center mx-auto mb-6 shadow-lg shadow-emerald-500/20">
            <ShieldCheck className="w-8 h-8" />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Подтверждение</h1>
          <p className="text-muted-foreground">Для подписания оффера необходимо ввести одноразовый код</p>
        </div>

        <Card className="border-border shadow-xl">
          <CardHeader>
            <CardTitle>Введите код из SMS/Email</CardTitle>
            <CardDescription>Мы отправили 6-значный код для подтверждения вашей личности.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleVerify} className="space-y-6">
              <Input 
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="text-center text-3xl tracking-[0.5em] font-mono h-16"
                maxLength={6}
                autoFocus
              />

              <Button 
                type="submit"
                className="w-full h-12 text-base font-medium shadow-md" 
                disabled={verifyMutation.isPending || otp.length < 6}
              >
                {verifyMutation.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : null}
                Подтвердить
                {!verifyMutation.isPending && <ArrowRight className="w-5 h-5 ml-2" />}
              </Button>
            </form>
            
            <p className="mt-6 text-center text-sm text-muted-foreground">
              Не получили код? Свяжитесь с вашим рекрутером.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
