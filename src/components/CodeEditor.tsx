import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CodeChange } from '@/types/code';

interface CodeEditorProps {
  code: string;
  onChange: (code: string) => void;
  title: string;
  readOnly?: boolean;
  changes?: CodeChange[];
  showChangesOnly?: boolean;
  lineNumbers?: boolean;
}

const CONTEXT_LINES = 2; // Number of context lines to show around changes
const LINE_HEIGHT = 20; // Approximate height of each line in pixels
const MAX_VISIBLE_LINES = 1000; // Maximum number of lines to render at once

const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  onChange,
  title,
  readOnly = false,
  changes = [],
  showChangesOnly = false,
  lineNumbers = true,
}) => {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Memoize code lines to prevent unnecessary re-renders
  const codeLines = useMemo(() => code.split('\n'), [code]);

  // Memoize line numbers for better performance
  const lineNumbersArray = useMemo(() => {
    if (!lineNumbers) return [];
    return Array.from({ length: codeLines.length }, (_, i) => i + 1);
  }, [lineNumbers, codeLines.length]);

  // Memoize visible lines set for changed code sections
  const visibleLines = useMemo(() => {
    if (!showChangesOnly || changes.length === 0) return new Set();
    
    const lines = new Set<number>();
    changes.forEach(change => {
      for (let i = Math.max(0, change.lineNumber - CONTEXT_LINES - 1); 
           i < Math.min(codeLines.length, change.lineNumber + CONTEXT_LINES); 
           i++) {
        lines.add(i);
      }
    });
    return lines;
  }, [showChangesOnly, changes, codeLines.length]);

  // Handle textarea resize
  const updateTextareaHeight = useCallback(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const newHeight = Math.min(
        textareaRef.current.scrollHeight,
        MAX_VISIBLE_LINES * LINE_HEIGHT
      );
      textareaRef.current.style.height = `${newHeight}px`;
    }
  }, []);

  useEffect(() => {
    updateTextareaHeight();
  }, [code, updateTextareaHeight]);

  // Optimize line number rendering
  const renderLineNumbers = useCallback(() => {
    if (!lineNumbers) return null;
    
    return (
      <div className="absolute top-0 left-0 p-4 pt-2 pr-2 text-right text-muted-foreground w-8 opacity-70 select-none z-20">
        {lineNumbersArray.map(num => (
          <div key={num} className="leading-6" style={{ height: LINE_HEIGHT }}>
            {num}
          </div>
        ))}
      </div>
    );
  }, [lineNumbers, lineNumbersArray]);

  // Optimize code rendering with changes
  const renderCode = useCallback(() => {
    if (!showChangesOnly || changes.length === 0) {
      return code;
    }

    return codeLines
      .map((line, index) => {
        if (visibleLines.has(index)) {
          const change = changes.find(c => c.lineNumber - 1 === index);
          if (change) {
            return `// Changed from: ${change.originalLine}\n// Reason: ${change.explanation}\n${line}`;
          }
          return line;
        }
        return null;
      })
      .filter(Boolean)
      .join('\n');
  }, [code, showChangesOnly, changes, codeLines, visibleLines]);

  // Debounced onChange handler
  const handleChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const value = e.target.value;
    requestAnimationFrame(() => {
      onChange(value);
    });
  }, [onChange]);

  return (
    <div className="space-y-4">
      <Card className="relative w-full bg-card border-border overflow-hidden">
        <div className="bg-muted p-2 border-b border-border font-medium flex items-center justify-between z-30 relative">
          <div className="flex items-center gap-2">
            <span>{title}</span>
            {changes && changes.length > 0 && (
              <Badge variant="secondary" className="text-xs">
                {changes.length} change{changes.length !== 1 ? 's' : ''}
              </Badge>
            )}
          </div>
          {!readOnly && <span className="text-xs text-muted-foreground">Editable</span>}
        </div>
        
        <div className="relative" ref={containerRef}>
          {renderLineNumbers()}
          <textarea
            ref={textareaRef}
            value={renderCode()}
            onChange={handleChange}
            className={`w-full font-mono text-sm p-4 pt-2 bg-transparent resize-none ${lineNumbers ? 'pl-10' : ''} relative z-20`}
            style={{ 
              minHeight: '200px',
              maxHeight: `${MAX_VISIBLE_LINES * LINE_HEIGHT}px`,
              overflowY: 'auto',
              color: 'inherit',
              caretColor: 'white',
              lineHeight: `${LINE_HEIGHT}px`
            }}
            readOnly={readOnly}
            spellCheck={false}
          />
        </div>
      </Card>
    </div>
  );
};

export default React.memo(CodeEditor);
