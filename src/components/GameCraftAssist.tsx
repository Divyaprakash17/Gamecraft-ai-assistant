import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Check, Code, RefreshCcw } from 'lucide-react';
import CodeEditor from './CodeEditor';
import { generateCodeSuggestion } from '@/services/AIService';
import { generateChangeSummary, highlightChanges } from '@/utils/syntaxHighlighter';
import { useToast } from "@/components/ui/use-toast";
import { CodeImprovement, CodeChange } from '@/types/code';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

const MAX_CODE_LENGTH = 5000; // Reduced from 10000 to prevent memory issues
const DEBOUNCE_DELAY = 500;
const BATCH_SIZE = 50;

const GameCraftAssist: React.FC = () => {
  const [originalCode, setOriginalCode] = useState<string>('');
  const [suggestedCode, setSuggestedCode] = useState<string>('');
  const [prompt, setPrompt] = useState<string>('');
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [explanation, setExplanation] = useState<string>('');
  const [changes, setChanges] = useState<CodeChange[]>([]);
  const [showFinal, setShowFinal] = useState<boolean>(false);
  const [finalCode, setFinalCode] = useState<string>('');
  const [unifiedDiff, setUnifiedDiff] = useState<string>('');
  const [engine, setEngine] = useState<string>('Unity');
  const [realTimeSuggestions, setRealTimeSuggestions] = useState<{
    suggestions: string[];
    performanceTips: string[];
    potentialIssues: string[];
  }>({
    suggestions: [],
    performanceTips: [],
    potentialIssues: []
  });
  const [isAnalyzing, setIsAnalyzing] = useState<boolean>(false);
  
  const { toast } = useToast();

  // Optimized cleanup function
  const cleanup = useCallback(() => {
    // Clear state in batches to prevent UI freeze
    requestAnimationFrame(() => {
      setSuggestedCode('');
      setExplanation('');
      setUnifiedDiff('');
    });
    requestAnimationFrame(() => {
      setChanges([]);
      setShowFinal(false);
      setFinalCode('');
    });
  }, []);

  // Memory cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  // Optimized code processing function
  const processCodeInBatches = useCallback((result: CodeImprovement) => {
    // Process code, explanation, and diff first
    requestAnimationFrame(() => {
      setSuggestedCode(result.improvedCode);
      setExplanation(result.explanation);
      if (result.unifiedDiff) {
        setUnifiedDiff(result.unifiedDiff);
      }
    });

    // Process changes in batches
    if (result.changes.length > BATCH_SIZE) {
      let currentBatch = 0;
      const processBatch = () => {
        const batch = result.changes.slice(
          currentBatch * BATCH_SIZE,
          (currentBatch + 1) * BATCH_SIZE
        );
        
        if (batch.length > 0) {
          setChanges(prev => [...prev, ...batch]);
          currentBatch++;
          
          // Schedule next batch
          if (currentBatch * BATCH_SIZE < result.changes.length) {
            setTimeout(processBatch, 100);
          }
        }
      };
      
      processBatch();
    } else {
      setChanges(result.changes);
    }
  }, []);

  const handleGenerateSuggestions = async () => {
    if (!originalCode.trim()) {
      toast({
        title: "Empty Code",
        description: "Please enter some code first.",
        variant: "destructive"
      });
      return;
    }
    
    if (!prompt.trim()) {
      toast({
        title: "Empty Prompt",
        description: "Please describe what you want to improve.",
        variant: "destructive"
      });
      return;
    }

    // Check code length
    if (originalCode.length > MAX_CODE_LENGTH) {
      toast({
        title: "Code Too Long",
        description: `Please reduce code length to less than ${MAX_CODE_LENGTH} characters to prevent memory issues.`,
        variant: "destructive"
      });
      return;
    }
    
    try {
      setIsProcessing(true);
      // Clean up previous results
      cleanup();
      
      const result = await generateCodeSuggestion(originalCode, prompt);
      
      if (!result.improvedCode) {
        throw new Error("No improved code was generated");
      }
      
      // Process results in batches
      processCodeInBatches(result);
      
      toast({
        title: "Code Improved!",
        description: `Found ${result.changes.length} potential improvements.`,
      });
    } catch (error) {
      console.error("Error generating suggestions:", error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to generate code suggestions. Please try again.",
        variant: "destructive"
      });
    } finally {
      setIsProcessing(false);
    }
  };

  const handleIntegrateCode = useCallback(() => {
    // Process integration in next frame to prevent UI freeze
    requestAnimationFrame(() => {
      setFinalCode(suggestedCode);
      setShowFinal(true);
    });
    
    toast({
      title: "Code Integrated",
      description: "The suggested changes have been applied. You can now view the final code below.",
    });
  }, [suggestedCode]);
  
  const handleReset = useCallback(() => {
    cleanup();
    toast({
      description: "Suggestions cleared. You can start fresh.",
    });
  }, [cleanup]);

  // Add this new function to extract only the changed lines
  const getChangedLinesOnly = useCallback((changes: CodeChange[]): string => {
    return changes
      .map(change => {
        const context = [];
        if (change.contextBefore.length > 0) {
          context.push('// Context before:');
          context.push(...change.contextBefore.map(line => `// ${line}`));
        }
        context.push(`- ${change.originalLine}`);
        context.push(`+ ${change.improvedLine} // ${change.explanation}`);
        if (change.contextAfter.length > 0) {
          context.push('// Context after:');
          context.push(...change.contextAfter.map(line => `// ${line}`));
        }
        return context.join('\n');
      })
      .join('\n\n');
  }, []);

  // Debounced real-time analysis
  useEffect(() => {
    const timer = setTimeout(async () => {
      if (originalCode.length > 100) {
        setIsAnalyzing(true);
        try {
          const aiService = new AIService();
          const analysis = await aiService.analyzeCodeInRealTime(originalCode, engine);
          setRealTimeSuggestions(analysis);
        } catch (error) {
          console.error('Error in real-time analysis:', error);
        } finally {
          setIsAnalyzing(false);
        }
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [originalCode, engine]);

  return (
    <div className="container mx-auto px-4 py-8 max-w-5xl">
      <Card className="bg-card shadow-lg border-game-primary/30 animate-pulse-glow">
        <CardHeader className="border-b border-border">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
            <div>
              <CardTitle className="text-2xl font-bold bg-gradient-to-r from-game-primary to-game-secondary bg-clip-text text-transparent">
                GameCraft AI Assist
              </CardTitle>
              <CardDescription>
                AI-powered code improvements for game developers
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Select value={engine} onValueChange={setEngine}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue placeholder="Select engine" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Unity">Unity</SelectItem>
                  <SelectItem value="Unreal">Unreal Engine</SelectItem>
                  <SelectItem value="Godot">Godot</SelectItem>
                </SelectContent>
              </Select>
              <Badge variant="outline" className="px-2 py-1 bg-game-primary/10 text-game-primary border-game-primary/30">
                <Code className="h-3 w-3 mr-1" /> Game Code Optimizer
              </Badge>
            </div>
          </div>
        </CardHeader>
        
        <CardContent className="pt-6 space-y-4">
          {/* Real-time Analysis Section */}
          {realTimeSuggestions.suggestions.length > 0 && (
            <div className="bg-muted p-4 rounded-md border border-border">
              <h3 className="text-lg font-medium mb-2 text-game-accent">Real-time Analysis</h3>
              {isAnalyzing ? (
                <div className="flex items-center gap-2">
                  <RefreshCcw className="h-4 w-4 animate-spin" />
                  <span>Analyzing code...</span>
                </div>
              ) : (
                <div className="space-y-4">
                  {realTimeSuggestions.suggestions.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-1">Suggestions</h4>
                      <ul className="text-sm space-y-1">
                        {realTimeSuggestions.suggestions.map((suggestion, index) => (
                          <li key={index} className="flex items-start">
                            <span className="mr-2">•</span>
                            <span>{suggestion}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {realTimeSuggestions.performanceTips.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-1">Performance Tips</h4>
                      <ul className="text-sm space-y-1">
                        {realTimeSuggestions.performanceTips.map((tip, index) => (
                          <li key={index} className="flex items-start">
                            <span className="mr-2">⚡</span>
                            <span>{tip}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {realTimeSuggestions.potentialIssues.length > 0 && (
                    <div>
                      <h4 className="font-medium mb-1">Potential Issues</h4>
                      <ul className="text-sm space-y-1">
                        {realTimeSuggestions.potentialIssues.map((issue, index) => (
                          <li key={index} className="flex items-start">
                            <span className="mr-2">⚠️</span>
                            <span>{issue}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* Code Input Section */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-lg font-medium">Original Game Code</h3>
              <Badge 
                variant="secondary" 
                className="text-xs"
              >
                {!suggestedCode ? 'Step 1: Add your code' : 'Source Code'}
              </Badge>
            </div>
            
            <CodeEditor 
              code={originalCode}
              onChange={setOriginalCode}
              title="Original Code"
              lineNumbers={true}
            />
          </div>
          
          {/* Prompt Input */}
          <div className="space-y-2">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <h3 className="text-lg font-medium">Improvement Request</h3>
              <Badge 
                variant="secondary"
                className="text-xs"
              >
                {!suggestedCode ? 'Step 2: Describe improvement' : 'Your Request'}
              </Badge>
            </div>
            
            <Textarea 
              placeholder="Describe what you want to improve (e.g., 'Optimize this loop for better performance', 'Fix the collision detection bug', 'Apply better design patterns')"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              className="min-h-24 bg-card"
            />
          </div>
          
          {/* Generate Button */}
          <div className="flex justify-end">
            <Button 
              onClick={handleGenerateSuggestions} 
              disabled={isProcessing}
              className="bg-game-primary hover:bg-game-primary/90"
            >
              {isProcessing ? (
                <>
                  <RefreshCcw className="mr-2 h-4 w-4 animate-spin" />
                  Processing...
                </>
              ) : (
                'Generate Suggestions'
              )}
            </Button>
          </div>
          
          {/* Results Section */}
          {suggestedCode && (
            <>
              <Separator className="my-6" />
              
              {/* AI Explanation */}
              <div className="bg-muted p-4 rounded-md mb-6 border border-border">
                <h3 className="text-lg font-medium mb-2 text-game-accent">Changes Made</h3>
                <div className="text-sm text-muted-foreground space-y-1">
                  {explanation.split('\n').map((line, index) => (
                    line.trim() && (
                      <p key={index} className="flex items-start">
                        <span className="mr-2">•</span>
                        <span>{line.replace(/^-\s*/, '')}</span>
                      </p>
                    )
                  ))}
                </div>
              </div>

              {/* Changed Lines Only */}
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="text-lg font-medium">Updated Code (Changes Only)</h3>
                  <Badge variant="outline" className="text-xs bg-game-primary/10 text-game-primary">
                    {changes.length} Change{changes.length !== 1 ? 's' : ''} Made
                  </Badge>
                </div>
                
                <CodeEditor 
                  code={getChangedLinesOnly(changes)}
                  onChange={() => {}} // Read-only
                  title="Changed Lines"
                  readOnly={true}
                  lineNumbers={true}
                />

                {/* Action Buttons */}
                <div className="flex flex-col sm:flex-row gap-2 justify-end mt-4">
                  <Button 
                    variant="outline" 
                    onClick={handleReset}
                  >
                    Reset
                  </Button>
                  <Button 
                    onClick={handleIntegrateCode}
                    className="bg-game-accent hover:bg-game-accent/90"
                  >
                    <Check className="mr-2 h-4 w-4" />
                    Integrate Changes
                  </Button>
                </div>
              </div>
            </>
          )}
          
          {/* Final Integrated Code Section */}
          {showFinal && (
            <>
              <Separator className="my-6" />
              <div className="space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h3 className="text-lg font-medium">Complete Code</h3>
                  <Badge variant="secondary" className="text-xs">All Changes Integrated</Badge>
                </div>
                
                <div className="bg-muted p-4 rounded-md mb-4 border border-border">
                  <p className="text-sm text-muted-foreground">
                    This is your complete code with all changes integrated. You can copy and use it directly.
                  </p>
                </div>
                
                <CodeEditor 
                  code={finalCode}
                  onChange={setFinalCode}
                  title="Complete Code"
                  readOnly={false}
                  lineNumbers={true}
                />
              </div>
            </>
          )}
        </CardContent>
        
        <CardFooter className="border-t border-border flex justify-between text-xs text-muted-foreground pt-4">
          <span>GameCraft AI Assist v1.0</span>
          <span>Powered by Aicade</span>
        </CardFooter>
      </Card>
    </div>
  );
};

export default GameCraftAssist;
