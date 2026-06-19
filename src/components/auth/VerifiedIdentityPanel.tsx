import { useState } from 'react';
import { BadgeCheck, LogOut, Mail, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { useUser } from '@/context/UserContext';

export function VerifiedIdentityPanel() {
  const { userSession, requestLoginCode, verifyLoginCode, logoutVerifiedUser } = useUser();
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [code, setCode] = useState('');
  const [codeRequested, setCodeRequested] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const verifiedUser = userSession.verifiedUser;

  const handleRequestCode = async () => {
    if (!email.trim()) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      await requestLoginCode(email.trim());
      setCodeRequested(true);
      setMessage('Check your email for a verification code.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not send verification code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!email.trim() || !code.trim()) return;
    setIsSubmitting(true);
    setMessage(null);
    try {
      await verifyLoginCode(email.trim(), code.trim(), displayName.trim() || undefined);
      setCode('');
      setCodeRequested(false);
      setMessage('Verified identity active.');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Could not verify code.');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (verifiedUser) {
    return (
      <Card className="border-green-500/30 bg-green-500/10">
        <CardContent className="flex items-center justify-between gap-3 p-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-sm font-semibold text-green-100">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span className="truncate">{verifiedUser.display_name}</span>
            </div>
            <p className="truncate text-xs text-green-100/70">Verified producer identity</p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={logoutVerifiedUser}
            className="shrink-0 border-green-500/40"
          >
            <LogOut className="h-4 w-4" />
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-card">
      <CardContent className="space-y-3 p-3">
        <div className="flex items-start gap-2">
          <BadgeCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">Verify your producer name</p>
            <p className="text-xs text-muted-foreground">
              Required for protected names and leaderboard credit.
            </p>
          </div>
        </div>

        <Input
          type="email"
          placeholder="email@example.com"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="h-10"
        />

        {codeRequested && (
          <>
            <Input
              type="text"
              inputMode="numeric"
              placeholder="6-digit code"
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))}
              className="h-10"
            />
            <Input
              type="text"
              placeholder="display name for new account"
              value={displayName}
              onChange={(event) => setDisplayName(event.target.value.slice(0, 50))}
              className="h-10"
            />
          </>
        )}

        {message && <p className="text-xs text-muted-foreground">{message}</p>}

        <Button
          type="button"
          variant="outline"
          onClick={codeRequested ? handleVerifyCode : handleRequestCode}
          disabled={isSubmitting || !email.trim() || (codeRequested && code.length !== 6)}
          className="w-full"
        >
          <Mail className="mr-2 h-4 w-4" />
          {codeRequested ? 'Verify Code' : 'Send Code'}
        </Button>
      </CardContent>
    </Card>
  );
}
