import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, RotateCw } from 'lucide-react';

interface ConflictResolutionProps {
  conflict: {
    type: 'tile_submittion' | 'simultaneous_action';
    message: string;
    affectedPlayers: string[];
  };
  isVisible: boolean;
  onResolve: () => void;
  onRetry?: () => void;
}

export function ConflictResolution({ 
  conflict, 
  isVisible, 
  onResolve, 
  onRetry 
}: ConflictResolutionProps) {
  if (!isVisible) return null;

  const getConflictIcon = () => {
    switch (conflict.type) {
      case 'tile_submittion':
        return <AlertTriangle className="h-5 w-5 text-yellow-500" />;
      case 'simultaneous_action':
        return <RotateCw className="h-5 w-5 text-orange-500 animate-spin-slow" />;
      default:
        return <AlertTriangle className="h-5 w-5 text-red-500" />;
    }
  };

  const getConflictColor = () => {
    switch (conflict.type) {
      case 'tile_submittion':
        return 'border-yellow-200 bg-yellow-50';
      case 'simultaneous_action':
        return 'border-orange-200 bg-orange-50';
      default:
        return 'border-red-200 bg-red-50';
    }
  };

  return (
    <div className="fixed inset-0 flex items-center justify-center z-50 bg-black/50 backdrop-blur-sm">
      <div className="animate-bounce-in">
        <Card className="w-full max-w-md mx-4">
          <CardContent className="p-6 space-y-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-yellow-100">
                {getConflictIcon()}
              </div>
              <div>
                <h3 className="text-lg font-semibold text-foreground">Action Conflict</h3>
                <Badge variant="secondary" className="mt-1">
                  {conflict.type.replace('_', ' ').toUpperCase()}
                </Badge>
              </div>
            </div>

            {/* Message */}
            <div className="text-center mb-4">
              <p className="text-muted-foreground">{conflict.message}</p>
            </div>

            {/* Affected Players */}
            {conflict.affectedPlayers.length > 0 && (
              <div className="mb-4">
                <p className="text-sm font-medium text-foreground mb-2">Affected Players:</p>
                <div className="flex flex-wrap gap-2 justify-center">
                  {conflict.affectedPlayers.map((player, index) => (
                    <Badge key={index} variant="outline" className="text-xs">
                      {player}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3">
              <Button 
                onClick={onResolve}
                className="flex-1 bg-primary text-primary-foreground hover:bg-primary/90"
              >
                Accept & Continue
              </Button>
              {onRetry && (
                <Button 
                  onClick={onRetry}
                  variant="outline"
                  className="flex-1"
                >
                  Retry Action
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}