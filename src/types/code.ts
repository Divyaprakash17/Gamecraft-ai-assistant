export interface CodeChange {
  lineNumber: number;
  originalLine: string;
  improvedLine: string;
  explanation: string;
  contextBefore: string[];
  contextAfter: string[];
  severity: string;
}

export interface CodeImprovement {
  improvedCode: string;
  originalCode: string;
  explanation: string;
  language: string;
  changes: CodeChange[];
  unifiedDiff?: string;
} 