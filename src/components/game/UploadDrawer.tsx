import { useRef, useState } from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from '@/components/ui/drawer';
import { Button } from '@/components/ui/button';
import { Upload, Music, X } from 'lucide-react';
import { Tile } from '@/types/game';
import { useToast } from '@/hooks/use-toast';
import { gameApi } from '@/services/api';
import { useUser } from '@/context/UserContext';

interface UploadDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tile: Tile | null;
  onUpload: (audioUrl: string) => void;
}

// Guardrail #104: MP3 / WAV / OGG only, max 10MB.
const MAX_FILE_SIZE = 10 * 1024 * 1024;
const ALLOWED_EXT = ['.mp3', '.wav', '.ogg'];
const ALLOWED_TYPE = ['audio/mpeg', 'audio/wav', 'audio/x-wav', 'audio/ogg'];

function isAllowedFile(file: File): string | null {
  if (!ALLOWED_TYPE.includes(file.type)) {
    const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase();
    if (!ALLOWED_EXT.includes(ext)) {
      return 'Only MP3, WAV, or OGG audio files are allowed';
    }
  }
  if (file.size > MAX_FILE_SIZE) {
    return `File is too large. Maximum size is ${MAX_FILE_SIZE / (1024 * 1024)}MB`;
  }
  return null;
}

export function UploadDrawer({ isOpen, onClose, tile, onUpload }: UploadDrawerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();
  const { userSession } = useUser();
  const abortRef = useRef<AbortController | null>(null);

  const reset = () => {
    setSelectedFile(null);
    setProgress(0);
    setError(null);
    setIsUploading(false);
  };

  const selectFile = (file: File | undefined) => {
    if (!file) return;
    const rejection = isAllowedFile(file);
    if (rejection) {
      toast({ variant: 'destructive', title: 'Invalid file', description: rejection });
      return;
    }
    setSelectedFile(file);
    setError(null);
    setProgress(0);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };
  const handleDragLeave = () => setIsDragging(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    selectFile(e.dataTransfer.files?.[0]);
  };
  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    selectFile(e.target.files?.[0]);
  };

  const findAudioUrl = (state: unknown): string => {
    try {
      const players = (state as { players?: Record<string, { tiles?: Tile[] }> }).players ?? {};
      for (const p of Object.values(players)) {
        const match = p.tiles?.find((t) => t.id === tile?.id);
        if (match?.audioUrl) return match.audioUrl;
      }
    } catch {
      /* fall through to empty string */
    }
    return '';
  };

  const startUpload = async () => {
    if (!selectedFile || !tile) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setIsUploading(true);
    setProgress(0);
    setError(null);

    try {
      const state = await gameApi.uploadTile(tile.id, selectedFile, userSession.playerId ?? '', {
        onProgress: setProgress,
        signal: controller.signal,
      });
      const audioUrl = findAudioUrl(state);
      onUpload(audioUrl);
      toast({ variant: 'default', title: 'Upload complete', description: `Uploaded "${selectedFile.name}"` });
      reset();
      onClose();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Upload failed';
      // Cancellation is user-initiated; don't surface as an error.
      if (message === 'Upload cancelled') {
        setIsUploading(false);
        return;
      }
      setError(message);
      toast({ variant: 'destructive', title: 'Upload failed', description: message });
      setIsUploading(false);
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancel = () => {
    if (isUploading) abortRef.current?.abort();
    reset();
    onClose();
  };

  return (
    <Drawer open={isOpen} onOpenChange={(open) => !open && handleCancel()}>
      <DrawerContent className="border-border bg-card">
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2 text-foreground">
              <Music className="h-5 w-5 text-primary" />
              Upload Audio for {tile?.genre}
            </DrawerTitle>
            <DrawerDescription className="text-muted-foreground">
              Drop your audio file or click to browse
            </DrawerDescription>
          </DrawerHeader>

          <div className="p-4">
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`
                relative flex min-h-[200px] cursor-pointer flex-col items-center justify-center
                rounded-lg border-2 border-dashed transition-all duration-300
                ${
                  isDragging
                    ? 'border-primary bg-primary/10'
                    : 'border-border/50 bg-muted/20 hover:border-primary/50'
                }
              `}
            >
              <input
                type="file"
                accept=".mp3,.wav,.ogg"
                onChange={handleFileSelect}
                disabled={isUploading}
                className="absolute inset-0 cursor-pointer opacity-0"
              />

              {selectedFile ? (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20">
                    <Music className="h-8 w-8 text-primary" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground">{selectedFile.name}</p>
                    <p className="text-sm text-muted-foreground">
                      {(selectedFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  {!isUploading && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedFile(null);
                        setProgress(0);
                        setError(null);
                      }}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <X className="mr-1 h-4 w-4" />
                      Remove
                    </Button>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground">Drop your audio file here</p>
                    <p className="text-sm text-muted-foreground">or click to browse</p>
                    <p className="mt-1 text-xs text-muted-foreground">MP3, WAV, or OGG · max 10MB</p>
                  </div>
                </div>
              )}
            </div>

            {isUploading && (
              <div className="mt-4 space-y-1">
                <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full bg-primary transition-all duration-200"
                    style={{ width: `${progress}%` }}
                    role="progressbar"
                    aria-valuenow={progress}
                    aria-valuemin={0}
                    aria-valuemax={100}
                  />
                </div>
                <p className="text-right text-xs text-muted-foreground">{progress}%</p>
              </div>
            )}

            {error && !isUploading && (
              <p className="mt-3 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                {error}
              </p>
            )}
          </div>

          <DrawerFooter>
            {isUploading ? (
              <Button
                onClick={handleCancel}
                variant="outline"
                className="w-full border-destructive text-destructive hover:bg-destructive/10"
              >
                Cancel
              </Button>
            ) : (
              <>
                <Button
                  onClick={startUpload}
                  disabled={!selectedFile}
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  {error ? 'Retry Upload' : 'Upload Track'}
                </Button>
                <Button variant="outline" onClick={handleCancel} className="w-full">
                  Close
                </Button>
              </>
            )}
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
