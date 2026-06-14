import { useRef, useState } from 'react'
import { Label } from '@/components/ui/label'

interface Props {
  label: string
  accept: string
  onFile: (file: File) => void
  fileName?: string
}

export default function FileDropZone({ label, accept, onFile, fileName }: Props) {
  const [dragOver, setDragOver] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  function handleDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragOver(false)
    const file = e.dataTransfer.files?.[0]
    if (file) onFile(file)
  }

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) onFile(file)
  }

  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <div
        data-testid="drop-zone"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true) }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`rounded-lg p-6 text-center cursor-pointer transition-colors border-dashed border-2 ${
          dragOver ? 'border-primary' : 'border-primary/40'
        }`}
      >
        <span className="text-sm text-muted-foreground">
          {fileName ? fileName : 'Drop file here or click to browse'}
        </span>
      </div>
      <input
        data-testid="file-input"
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={handleChange}
      />
    </div>
  )
}
