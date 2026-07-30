import React from 'react';
import { useLocation } from 'wouter';
import { Button } from '@/components/ui/button';
import { AlertCircle, ArrowLeft } from 'lucide-react';

export default function NotFound() {
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-destructive/10 text-destructive flex items-center justify-center mx-auto mb-6">
          <AlertCircle className="w-8 h-8" />
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2">404</h1>
        <h2 className="text-xl font-semibold mb-4 text-muted-foreground">Страница не найдена</h2>
        <p className="text-muted-foreground mb-8">
          Запрашиваемая страница не существует или была перемещена.
        </p>
        <Button onClick={() => setLocation('/dashboard')} className="w-full">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Вернуться на главную
        </Button>
      </div>
    </div>
  );
}
