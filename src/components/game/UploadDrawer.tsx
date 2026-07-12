import { useState } from 'react';
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
import { Upload, Music, X } from 'lucide-react';
import { Tile } from '@/types/game';
import { useToast } from '@/hooks/use-toast';
import { gameApi } from '@/services/api';
import { useUser } from '@/context/UserContext';

interface UploadDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tile: Tile | null;
  onUpload: (audioUrl: string, audioFile: File) => void;
}

export function UploadDrawer({ isOpen, onClose, tile, onUpload }: UploadDrawerProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();
  const MAX_FILE_SIZE = 50 * 1024 * 1024;

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
    if (file && file.type.startsWith('audio/')) {
      if (file.size > MAX_FILE_SIZE) {
        toast({
          variant: 'destructive',
          title: 'File too large',
          description: 'Audio files must be 50MB or smaller',
        });
        return;
      }
      setSelectedFile(file);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && file.size > MAX_FILE_SIZE) {
      toast({
        variant: 'destructive',
        title: 'File too large',
        description: 'Audio files must be 50MB or smaller',
      });
      return;
    }
    setSelectedFile(file ?? null);
  };

  const handleSubmit = async () => {
    if (!selectedFile) return;

    try {
      setIsUploading(true);
      const response = await gameApi.uploadAudio(tile?.id ?? '', selectedFile);
      toast({
        variant: 'default',
        title: 'Upload initiated',
        description: `Uploading "${selectedFile.name}"`,
      });
      onUpload(response.data?.audio_url ?? URL.createObjectURL(selectedFile), selectedFile);
      setSelectedFile(null);
      onClose();
    } catch (error) {
      console.error('Upload failed:', error);
      toast({
        variant: 'destructive',
        title: 'Upload failed',
        description: `Failed to upload ${selectedFile.name}`,
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleClose = () => {
    setSelectedFile(null);
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
              Drop your audio file or click to browse
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
                accept="audio/*"
                onChange={handleFileSelect}
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
          </div>

          <DrawerFooter>
            <Button
              onClick={handleSubmit}
              disabled={!selectedFile}
              className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
            >
              <Upload className="mr-2 h-4 w-4" />
              Upload Track
            </Button>
            <Button variant="outline" onClick={handleClose} className="w-full">
              Cancel
            </Button>
          </DrawerFooter>
        </div>
      </DrawerContent>
    </Drawer>
  );
}
