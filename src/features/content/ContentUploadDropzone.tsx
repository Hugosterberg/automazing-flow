import { useRef, useState } from "react";
import { ImagePlus, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export function ContentUploadDropzone({
  onFiles,
  disabled = false,
  busy = false,
  accept = "image/*,video/*",
  multiple = true,
  className,
  label = "Drop images or videos here, or click to upload",
}: {
  onFiles: (files: FileList | null) => void | Promise<void>;
  disabled?: boolean;
  busy?: boolean;
  accept?: string;
  multiple?: boolean;
  className?: string;
  label?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);

  function pickFiles(fileList: FileList | null) {
    if (!fileList?.length || disabled || busy) return;
    void onFiles(fileList);
  }

  return (
    <div
      role="button"
      tabIndex={disabled || busy ? -1 : 0}
      aria-disabled={disabled || busy}
      aria-label={label}
      className={cn(
        "rounded-lg border-2 border-dashed px-4 py-8 text-center transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        dragOver ? "border-primary bg-primary/5" : "border-border hover:border-primary/40 hover:bg-muted/20",
        (disabled || busy) && "opacity-60 pointer-events-none cursor-not-allowed",
        className
      )}
      onClick={() => inputRef.current?.click()}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          inputRef.current?.click();
        }
      }}
      onDragEnter={(event) => {
        event.preventDefault();
        if (!disabled && !busy) setDragOver(true);
      }}
      onDragOver={(event) => {
        event.preventDefault();
        if (!disabled && !busy) setDragOver(true);
      }}
      onDragLeave={(event) => {
        event.preventDefault();
        setDragOver(false);
      }}
      onDrop={(event) => {
        event.preventDefault();
        setDragOver(false);
        pickFiles(event.dataTransfer.files);
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        className="hidden"
        disabled={disabled || busy}
        onChange={(event) => {
          pickFiles(event.target.files);
          if (inputRef.current) inputRef.current.value = "";
        }}
      />
      {busy ? (
        <Loader2 className="h-8 w-8 mx-auto animate-spin text-muted-foreground" />
      ) : (
        <ImagePlus className="h-8 w-8 mx-auto text-muted-foreground" />
      )}
      <p className="mt-2 text-sm text-muted-foreground">{label}</p>
    </div>
  );
}
