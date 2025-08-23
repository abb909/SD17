import React, { useState, useEffect } from 'react';
import { FetchErrorHandler } from '@/utils/fetchErrorHandler';
import { firebaseCircuitBreaker } from '@/utils/circuitBreaker';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, CheckCircle, Activity, RefreshCw } from 'lucide-react';

export const ErrorMonitor: React.FC = () => {
  const [stats, setStats] = useState({
    errorCount: 0,
    lastErrorTime: 0,
    suppressionActive: true
  });
  const [circuitState, setCircuitState] = useState('CLOSED');
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const interval = setInterval(() => {
      setStats(FetchErrorHandler.getStats());
      setCircuitState(firebaseCircuitBreaker.getState());
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  // Only show in development or if there are errors
  const shouldShow = import.meta.env.DEV || stats.errorCount > 0;

  if (!shouldShow || !isVisible) {
    return null;
  }

  const getCircuitStateColor = (state: string) => {
    switch (state) {
      case 'CLOSED': return 'bg-green-100 text-green-800';
      case 'OPEN': return 'bg-red-100 text-red-800';
      case 'HALF_OPEN': return 'bg-yellow-100 text-yellow-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getCircuitStateIcon = (state: string) => {
    switch (state) {
      case 'CLOSED': return <CheckCircle className="h-4 w-4" />;
      case 'OPEN': return <AlertCircle className="h-4 w-4" />;
      case 'HALF_OPEN': return <RefreshCw className="h-4 w-4" />;
      default: return <Activity className="h-4 w-4" />;
    }
  };

  return (
    <Card className="fixed bottom-4 right-4 z-50 w-80 shadow-lg border">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          Error Monitor
          <Button
            onClick={() => setIsVisible(false)}
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0"
          >
            ×
          </Button>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Circuit Breaker:</span>
          <Badge className={getCircuitStateColor(circuitState)}>
            {getCircuitStateIcon(circuitState)}
            <span className="ml-1">{circuitState}</span>
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Suppressed Errors:</span>
          <Badge variant="secondary">
            {stats.errorCount}
          </Badge>
        </div>

        <div className="flex items-center justify-between">
          <span className="text-xs text-gray-600">Suppression Active:</span>
          <Badge className={stats.suppressionActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
            {stats.suppressionActive ? 'Active' : 'Disabled'}
          </Badge>
        </div>

        {stats.lastErrorTime > 0 && (
          <div className="text-xs text-gray-500">
            Last error: {new Date(stats.lastErrorTime).toLocaleTimeString()}
          </div>
        )}

        <Button
          onClick={() => {
            FetchErrorHandler.reset();
            setStats({ errorCount: 0, lastErrorTime: 0, suppressionActive: true });
          }}
          variant="outline"
          size="sm"
          className="w-full text-xs"
        >
          Reset Stats
        </Button>
      </CardContent>
    </Card>
  );
};
