import * as React from 'react';
import { cn } from '@/lib/utils';
import { Check, AlertCircle } from 'lucide-react';

export interface ToastMessage {
  id: string;
  text: string;
  type?: 'success' | 'error' | 'default';
}

interface ToastContextType {
  toast: (text: string, type?: 'success' | 'error' | 'default') => void;
}

const ToastContext = React.createContext<ToastContextType | null>(null);

export const ToastProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [messages, setMessages] = React.useState<ToastMessage[]>([]);

  const toast = React.useCallback((text: string, type: 'success' | 'error' | 'default' = 'default') => {
    const id = Math.random().toString(36).substring(2, 9);
    setMessages((prev) => [...prev, { id, text, type }]);
    setTimeout(() => {
      setMessages((prev) => prev.filter((m) => m.id !== id));
    }, 2200);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {/* Toast Notification Container (Fixed bottom-right with Safe Area padding, Flat Design) */}
      <div className="fixed bottom-4 right-4 z-50 flex flex-col space-y-2 pointer-events-none font-mono text-xs">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'pointer-events-auto flex items-center space-x-2 px-3 py-2 rounded-sm border bg-card text-foreground shadow-none select-none transition-none',
              m.type === 'error'
                ? 'border-destructive text-destructive'
                : 'border-border text-foreground'
            )}
          >
            {m.type === 'error' ? (
              <AlertCircle className="h-3.5 w-3.5 shrink-0" />
            ) : (
              <Check className="h-3.5 w-3.5 shrink-0 text-white" />
            )}
            <span>{m.text}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
};

export const useToast = () => {
  const context = React.useContext(ToastContext);
  if (!context) {
    return {
      toast: (text: string) => {
        console.log(`[Toast] ${text}`);
      },
    };
  }
  return context;
};
