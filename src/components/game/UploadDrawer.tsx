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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Upload, Music, X, Loader2 } from 'lucide-react';
import { Tile } from '@/types/game';
import { useToast } from '@/hooks/use-toast';
import { roomApi } from '@/services/api';

interface UploadDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tile: Tile | null;
  playerId?: string;
  onUpload: (audioUrl: string, audioFile: File) => void;
}

// Client-side limits — MUST mirror the backend (MAX_UPLOAD_SIZE + allowed MIME
// types in game_engine/views.py and serializers.py). Reject before any network call.
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_EXTENSIONS = ['mp3', 'wav', 'ogg'];
const ALLOWED_MIME_TYPES = new Set([
  'audio/mpeg', // mp3
  'audio/wav',
  'audio/x-wav',
  'audio/wave',
  'audio/ogg',
  'audio/webm', // ogg encapsulated in webm container (Chrome/macOS capture)
]);

function getExtension(filename: string): string {
  const dot = filename.lastIndexOf('.');
  return dot >= 0 ? filename.slice(dot + 1).toLowerCase() : '';
}

// Validate locally and return a user-facing error key, or null if the file is OK.
function validateFile(file: File): string | null {
  if (file.size > MAX_FILE_SIZE) {
    return 'File too large';
  }
  const ext = getExtension(file.name);
  const byExt = ALLOWED_EXTENSIONS.includes(ext);
  const byMime = file.type ? ALLOWED_MIME_TYPES.has(file.type) : false;
  if (!byExt && !byMime) {
    return 'Unsupported format';
  }
  return null;
}

export function UploadDrawer({ isOpen, onClose, tile, playerId, onUpload }: UploadDrawerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const { toast } = useToast();

  const isUploading = uploadProgress !== null;

  const resetSelection = () => {
    abortRef.current?.abort();
    abortRef.current = null;
    setSelectedFile(null);
    setUploadProgress(null);
    setError(null);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files[0];
    if (file) {
      const validationError = validateFile(file);
      if (validationError) {
        toast({
          variant: 'destructive',
          title: validationError,
          description:
            validationError === 'File too large'
              ? 'Audio files must be 10MB or smaller'
              : 'Only MP3, WAV, and OGG files are allowed',
        });
        return;
      }
      setError(null);
      setSelectedFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset the input so selecting the same file again re-triggers onChange.
    e.target.value = '';
    if (file) {
      const validationError = validateFile(file);
      if (validationError) {
        toast({
          variant: 'destructive',
          title: validationError,
          description:
            validationError === 'File too large'
              ? 'Audio files must be 10MB or smaller'
              : 'Only MP3, WAV, and OGG files are allowed',
        });
        return;
      }
      setError(null);
      setSelectedFile(file);
    }
  };

  const performUpload = async (file: File) => {
    if (!tile) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setError(null);
    setUploadProgress(0);

    try {
      await roomApi.uploadAudio(
        tile.id,
        file,
        playerId ?? '',
        (percent) => setUploadProgress(percent),
        controller.signal,
      );

      // Upload succeeded — surface an immediately-playable object URL while the
      // authoritative backend URL is not yet re-fetched by the game socket.
      const audioUrl = URL.createObjectURL(file);
      onUpload(audioUrl, file);
      resetSelection();
      toast({
        title: 'Audio uploaded',
        description: 'Your track is live.',
      });
      onClose();
    } catch (err) {
      // Aborted uploads are intentional — don't show an error.
      if (controller.signal.aborted) {
        setUploadProgress(null);
        return;
      }
      const message = mapUploadError(err);
      setError(message);
      setUploadProgress(null);
    }
  };

  const handleSubmit = () => {
    if (selectedFile && !isUploading) {
      void performUpload(selectedFile);
    }
  };

  const handleCancel = () => {
    if (isUploading) {
      // Abort the in-flight request; the catch handler resets state.
      abortRef.current?.abort();
      return;
    }
    resetSelection();
    onClose();
  };

  const handleClose = () => {
    resetSelection();
    onClose();
  };

  return (
    <Drawer open={isOpen} onOpenChange={handleClose}>
      <DrawerContent className="border-border bg-card">
        <div className="mx-auto w-full max-w-md">
          <DrawerHeader>
            <DrawerTitle className="flex items-center gap-2 text-foreground">
              <Music className="h-5 w-5 text-primary" />
              Upload Audio for {tile?.genre}
            </DrawerTitle>
            <DrawerDescription className="text-muted-foreground">
              Drop your audio file or click to browse (MP3, WAV, or OGG, max 10MB)
            </DrawerDescription>
          </DrawerHeader>

          <div className="p-4">
            {/* Drop Zone */}
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
                accept=".mp3,.wav,.ogg,audio/mpeg,audio/wav,audio/x-wav,audio/ogg"
                onChange={handleFileSelect}
                disabled={isUploading}
                className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />

              {isUploading ? (
                <div className="flex w-3/4 flex-col items-center gap-3">
                  <Loader2 className="h-8 w-8 animate-spin text-primary" />
                  <p className="text-sm font-medium text-foreground">
                    Uploading… {uploadProgress}%
                  </p>
                  <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={uploadProgress ?? 0}
                    data-testid="upload-progress"
                    className="h-2 w-full overflow-hidden rounded-full bg-muted"
                  >
                    <div
                      className="h-full rounded-full bg-primary transition-all duration-150"
                      style={{ width: `${uploadProgress ?? 0}%` }}
                    />
                  </div>
                </div>
              ) : selectedFile ? (
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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedFile(null);
                    }}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <X className="mr-1 h-4 w-4" />
                    Remove
                  </Button>
                </div>
              ) : (
                <div className="flex flex-col items-center gap-3">
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
                    <Upload className="h-8 w-8 text-muted-foreground" />
                  </div>
                  <div className="text-center">
                    <p className="font-medium text-foreground">Drop your audio file here</p>
                    <p className="text-sm text-muted-foreground">or click to browse</p>
                  </div>
                </div>
              )}
            </div>

            {error && (
              <div
                data-testid="upload-error"
                className="mt-3 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
                role="alert"
              >
                {error}
                {error === 'Network error — tap to retry' && (
                  <button
                    type="button"
                    data-testid="upload-retry"
                    onClick={() => selectedFile && void performUpload(selectedFile)}
                    className="ml-2 font-semibold underline underline-offset-2"
                  >
                    Retry
                  </button>
                )}
              </div>
            )}
          </div>

          <DrawerFooter>
            {isUploading ? (
              <Button
                data-testid="upload-cancel"
                onClick={handleCancel}
                variant="destructive"
                className="w-full"
              >
                Cancel Upload
              </Button>
            ) : (
              <>
                <Button
                  onClick={handleSubmit}
                  disabled={!selectedFile}
                  data-testid="upload-submit"
                  className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
                >
                  <Upload className="mr-2 h-4 w-4" />
                  Upload Track
                </Button>
                <Button
                  data-testid="upload-cancel"
                  variant="outline"
                  onClick={handleCancel}
                  className="w-full"
                >
                  Cancel
                </Button>
              </>
            )}
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}

function mapUploadError(err: unknown): string {
  // Aborted uploads are handled separately; this is a defensive guard.
  if (err instanceof DOMException && err.name === 'AbortError') {
    return 'Upload cancelled';
  }
  const axiosErr = err as {
    response?: { status?: number; data?: { error?: string } };
    message?: string;
  };
  if (axiosErr?.response) {
    const status = axiosErr.response.status;
    const serverMsg = axiosErr.response.data?.error;
    if (status === 400) {
      if (serverMsg?.toLowerCase().includes('too large')) return 'File too large';
      if (serverMsg?.toLowerCase().includes('invalid file type')) return 'Unsupported format';
      return serverMsg || 'Unsupported format';
    }
    if (status >= 500) return 'Server error — tap to retry';
    return 'Upload failed — tap to retry';
  }
  return 'Network error — tap to retry';
}
