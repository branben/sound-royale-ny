import React, { useState, useEffect } from 'react';
import { X, ArrowUp, Music, Vote } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface GameTutorialProps {
  isSpectator: boolean;
  onDismiss: () => void;
  isActive: boolean;
}

export const GameTutorial: React.FC<GameTutorialProps> = ({ isSpectator, onDismiss, isActive }) => {
  const [step, setStep] = useState(0);

  useEffect(() => {
    if (isActive) {
      setStep(0);
    }
  }, [isActive]);

  if (!isActive) return null;

  const steps = isSpectator
    ? [
        {
          title: 'Welcome, Spectator!',
          description: 'Watch the producers battle it out with their beats.',
          icon: Music,
          position: 'top-center',
        },
        {
          title: 'Vote for the Best',
          description: 'When voting opens, tap to vote for your favorite track.',
          icon: Vote,
          position: 'bottom-center',
        },
      ]
    : [
        {
          title: 'Your Turn!',
          description: 'Tap a tile to upload your beat for that genre.',
          icon: Music,
          position: 'top-center',
        },
        {
          title: 'Complete the Line',
          description: 'Fill 3 tiles in a row to win the round!',
          icon: ArrowUp,
          position: 'bottom-center',
        },
      ];

  const currentStep = steps[step];
  const Icon = currentStep.icon;

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      onDismiss();
    }
  };

  const getPositionClasses = () => {
    switch (currentStep.position) {
      case 'top-center':
        return 'top-4 left-1/2 -translate-x-1/2';
      case 'bottom-center':
        return 'bottom-20 left-1/2 -translate-x-1/2';
      default:
        return 'top-4 left-4';
    }
  };

  return (
    <div className={`fixed z-50 ${getPositionClasses()} max-w-sm`}>
      <div className="bg-background border border-border rounded-lg p-4 shadow-md">
        <button
          onClick={onDismiss}
          className="absolute top-2 right-2 text-gray-400 hover:text-white transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-3 mb-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 flex-shrink-0">
            <Icon className="h-5 w-5 text-primary" />
          </div>
          <div>
            <h3 className="font-semibold text-white mb-1">{currentStep.title}</h3>
            <p className="text-sm text-gray-300">{currentStep.description}</p>
          </div>
        </div>

        <div className="flex items-center justify-between mt-4">
          <div className="flex gap-1">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-1.5 w-6 rounded-full transition-colors ${
                  i === step ? 'bg-primary' : 'bg-muted'
                }`}
              />
            ))}
          </div>
          <Button onClick={handleNext} size="sm" className="bg-primary hover:opacity-90">
            {step === steps.length - 1 ? 'Got it!' : 'Next'}
          </Button>
        </div>
      </div>
    </div>
  );
};
