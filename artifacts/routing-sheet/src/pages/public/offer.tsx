import React from 'react';
import { useLocation, useParams } from 'wouter';
import { useGetOfferByToken, getGetOfferByTokenQueryKey, useAcceptOffer } from '@workspace/api-client-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Loader2, Briefcase, CheckCircle2, Building } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

export default function OfferPublic() {
  const params = useParams();
  const token = params.token || '';
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const [consent, setConsent] = React.useState(false);

  const { data: offer, isLoading, error } = useGetOfferByToken(token, {
    query: { queryKey: getGetOfferByTokenQueryKey(token), enabled: !!token, retry: false }
  });

  const acceptMutation = useAcceptOffer();

  const handleAccept = () => {
    if (!consent) {
      toast({ variant: 'destructive', title: 'Необходимо согласие', description: 'Пожалуйста, подтвердите согласие на обработку персональных данных.' });
      return;
    }
    if (!offer) return;
    
    acceptMutation.mutate(
      { id: offer.id, data: { token, consentGiven: consent } },
      {
        onSuccess: () => {
          setLocation(`/offer/${token}/otp`);
        },
        onError: (err: any) => {
          toast({ variant: 'destructive', title: 'Ошибка', description: err?.data?.error || 'Не удалось принять оффер' });
        }
      }
    );
  };

  if (isLoading) {
    return <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 dark:bg-gray-900"><Loader2 className="w-8 h-8 animate-spin text-primary" /></div>;
  }

  if (error || !offer) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
        <Card className="w-full max-w-md shadow-xl border-destructive/20">
          <CardContent className="pt-6 text-center">
            <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-4">
              <Briefcase className="w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold mb-2">Оффер не найден или истек</h2>
            <p className="text-muted-foreground">Ссылка недействительна. Пожалуйста, свяжитесь с вашим рекрутером.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (offer.status === 'accepted') {
    setLocation(`/status/${token}`);
    return null;
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-gray-50 dark:bg-gray-900 selection:bg-primary/20">
      <div className="flex-1 flex flex-col items-center justify-center p-4">
        <div className="w-full max-w-md space-y-6">
          
          <div className="text-center space-y-2 mb-8">
            <div className="w-16 h-16 rounded-2xl bg-primary text-primary-foreground flex items-center justify-center mx-auto mb-6 shadow-lg shadow-primary/20">
              <Building className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">Предложение о работе</h1>
            <p className="text-muted-foreground">Уважаемый(ая) {offer.candidateName}, мы рады пригласить вас в команду!</p>
          </div>

          <Card className="border-border shadow-xl">
            <CardHeader className="bg-muted/30 border-b border-border pb-4">
              <CardTitle className="text-lg">Оффер о трудоустройстве</CardTitle>
            </CardHeader>
            <CardContent className="pt-6 space-y-6">
              {offer.message && (
                <div className="prose prose-sm dark:prose-invert max-w-none text-foreground/90 bg-muted/20 p-4 rounded-lg border border-border/50">
                  {offer.message.split('\n').map((paragraph, idx) => (
                    <p key={idx}>{paragraph}</p>
                  ))}
                </div>
              )}

              <div className="bg-primary/5 border border-primary/10 rounded-lg p-4 mt-6">
                <div className="flex items-start space-x-3">
                  <Checkbox 
                    id="consent" 
                    checked={consent} 
                    onCheckedChange={(checked) => setConsent(checked as boolean)}
                    className="mt-1"
                  />
                  <label htmlFor="consent" className="text-sm font-medium leading-none cursor-pointer text-foreground">
                    Я принимаю предложение о работе и даю согласие на обработку моих персональных данных в соответствии с политикой конфиденциальности.
                  </label>
                </div>
              </div>

              <Button 
                className="w-full h-12 text-base font-medium shadow-md hover:shadow-lg transition-all" 
                onClick={handleAccept}
                disabled={acceptMutation.isPending || !consent}
              >
                {acceptMutation.isPending ? <Loader2 className="w-5 h-5 mr-2 animate-spin" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
                Принять оффер
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
