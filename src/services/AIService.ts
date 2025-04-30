// AIService.ts - Using Google's Gemini API for code suggestions

import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { createPatch } from 'diff';
import { HumanMessage } from "@langchain/core/messages";
import { HarmCategory, HarmBlockThreshold } from "@google/generative-ai";
import { RunnableSequence } from "@langchain/core/runnables";
import { StringOutputParser } from "@langchain/core/output_parsers";

// Custom error types
class AIServiceError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AIServiceError';
  }
}

class APIKeyError extends AIServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'APIKeyError';
  }
}

class RateLimitError extends AIServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

class ValidationError extends AIServiceError {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

interface CodeChange {
  lineNumber: number;
  originalLine: string;
  improvedLine: string;
  explanation: string;
  contextBefore: string[];
  contextAfter: string[];
  severity: string;
}

interface CodeImprovement {
  improvedCode: string;
  originalCode: string;
  explanation: string;
  language: string;
  changes: CodeChange[];
  unifiedDiff?: string;
}

interface GameAIResponse {
  code: string;
  explanation: string;
  language: string;
  engineSuggestion?: string;
  originalCode?: string;
  changes?: CodeChange[];
  unifiedDiff?: string;
}

interface TemplateInput {
  code?: string;
  prompt?: string;
  request?: string;
  language?: string;
  gameEngine?: string;
}

export const generateCodeSuggestion = async (
  code: string,
  prompt: string
): Promise<CodeImprovement> => {
  try {
    const aiService = new AIService();
    const language = aiService.detectLanguage(code);
    return await aiService.improveCode(code, language, prompt);
  } catch (error) {
    console.error("Error in generateCodeSuggestion:", error);
    if (error instanceof AIServiceError) {
      throw error;
    }
    if (error instanceof Error) {
      throw new AIServiceError(`Failed to generate code suggestion: ${error.message}`);
    }
    throw new AIServiceError("Failed to generate code suggestion: Unknown error");
  }
};

export class AIService {
  private model: ChatGoogleGenerativeAI;
  private readonly RATE_LIMIT_DELAY = 1000;
  private lastRequestTime = 0;

  constructor() {
    const apiKey = import.meta.env.VITE_GOOGLE_API_KEY;
    if (!apiKey) {
      throw new APIKeyError("VITE_GOOGLE_API_KEY environment variable is not set");
    }

    this.model = new ChatGoogleGenerativeAI({
      apiKey,
      modelName: "gemini-1.5-pro",
      temperature: 0.2,
      topK: 1,
      topP: 0.1,
      maxOutputTokens: 2048,
      maxRetries: 3
    });
  }

  private createPrompt(code: string, prompt: string): string {
    // Escape any special characters in the code and prompt
    const escapedCode = code.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    const escapedPrompt = prompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"');

    return `You are an expert game development AI. Your task is to analyze and improve the given game code based on the user's request. You should generate code that is clean, efficient, well-documented, and follows best practices for game development. Pay close attention to error handling and performance optimization techniques.

=== CODE TO IMPROVE ===
${escapedCode}

=== IMPROVEMENT REQUEST ===
${escapedPrompt}

=== EXPECTED RESPONSE FORMAT ===
Return ONLY a valid JSON object with no additional text. The JSON object should have the following structure:
{
  "improvedCode": "the complete improved code",
  "explanation": "clear explanation of all changes made to the code, including the reasoning behind each change",
  "changes": [
    {
      "lineNumber": 1,
      "originalLine": "original code line",
      "improvedLine": "improved code line",
      "explanation": "detailed explanation of why this specific line was changed",
      "contextBefore": ["lines of code before the change"],
      "contextAfter": ["lines of code after the change"],
      "severity": "info" // can be 'info', 'warning', or 'error'
    }
  ]
}

=== RULES ===
1.  You MUST output only valid JSON. Do not include any text before or after the JSON object.
2.  Do not use markdown formatting.
3.  Escape all special characters in strings (e.g., \, ", \n).
4.  Include all necessary code context to ensure the improved code is self-contained and functional.
5.  Focus on improving code quality, readability, and performance.
6.  Consider common game development patterns and practices when making changes.
7.  Prioritize error handling and provide informative error messages.
8.  Optimize code for performance, especially in critical sections like loops and collision detection.
9.  Provide clear and concise explanations for all changes made.
`;
  }

  private async checkRateLimit() {
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;
    if (timeSinceLastRequest < this.RATE_LIMIT_DELAY) {
      await new Promise(resolve => setTimeout(resolve, this.RATE_LIMIT_DELAY - timeSinceLastRequest));
    }
    this.lastRequestTime = Date.now();
  }

  public async improveCode(
    code: string,
    language: string,
    prompt: string
  ): Promise<CodeImprovement> {
    try {
      if (code.length > 5000) {
        throw new AIServiceError("Code is too long. Please submit a smaller code snippet (max 5000 characters).");
      }

      await this.checkRateLimit();

      // Create the prompt and call the model
      const promptText = this.createPrompt(code, prompt);
      const response = await this.model.call([new HumanMessage(promptText)]);

      if (!response?.content) {
        throw new AIServiceError("Empty response from AI model");
      }

      const content = typeof response.content === 'string' 
        ? response.content 
        : JSON.stringify(response.content);

      // Parse and validate the response
      const result = this.parseResponse(content);

      return {
        improvedCode: String(result.improvedCode),
        originalCode: code,
        explanation: String(result.explanation || 'Code has been improved based on the request.'),
        language,
        changes: this.validateChanges(result.changes),
        unifiedDiff: this.generateUnifiedDiff(code, result.improvedCode)
      };

    } catch (error) {
      console.error('Error improving code:', error);
      throw error instanceof AIServiceError 
        ? error 
        : new AIServiceError('Failed to improve code. Please try again.');
    }
  }

  private parseResponse(response: string): any {
    try {
      // Extract JSON from the response
      const jsonMatch = response.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        throw new AIServiceError("No valid JSON found in response");
      }

      const result = JSON.parse(jsonMatch[0]);
      
      if (!result.improvedCode || !Array.isArray(result.changes)) {
        throw new AIServiceError("Invalid response structure");
      }

      return result;
    } catch (error) {
      throw new AIServiceError(`Failed to parse response: ${error instanceof Error ? error.message : 'Invalid JSON'}`);
    }
  }

  private validateChanges(changes: any[]): CodeChange[] {
    return changes.map(change => ({
      lineNumber: Number(change.lineNumber) || 0,
      originalLine: String(change.originalLine || ''),
      improvedLine: String(change.improvedLine || ''),
      explanation: String(change.explanation || ''),
      contextBefore: Array.isArray(change.contextBefore) ? change.contextBefore.map(String) : [],
      contextAfter: Array.isArray(change.contextAfter) ? change.contextAfter.map(String) : [],
      severity: this.validateSeverity(String(change.severity || 'info'))
    }));
  }

  private validateSeverity(severity: string): string {
    const validSeverities = ['info', 'warning', 'error'];
    return validSeverities.includes(severity.toLowerCase()) 
      ? severity.toLowerCase() 
      : 'info';
  }

  private generateUnifiedDiff(originalCode: string, improvedCode: string): string {
    return createPatch('code', originalCode, improvedCode);
  }

  public detectLanguage(code: string): string {
    const languagePatterns: Record<string, RegExp[]> = {
      "C#": [/using\s+System/, /namespace\s+\w+/, /public\s+class/, /\[.*\]\s*public/],
      Python: [/import\s+pygame/, /def\s+\w+/, /class\s+\w+/, /from\s+\w+\s+import/],
      JavaScript: [/function\s+\w+/, /const\s+\w+/, /let\s+\w+/, /export\s+(default\s+)?(function|class)/],
      Java: [/public\s+class/, /private\s+void/, /import\s+java\./, /@Override/],
      "C++": [/#include\s+<.*>/, /int\s+main/, /class\s+\w+/, /using\s+namespace/],
    };

    for (const [lang, patterns] of Object.entries(languagePatterns)) {
      if (patterns.some((pat) => pat.test(code))) {
        return lang;
      }
    }
    return "Unknown";
  }

  async generateGameCode(
    request: string,
    code: string,
    language: string,
    gameEngine?: string
  ): Promise<GameAIResponse> {
    const chain = RunnableSequence.from([
      {
        invoke: async (input: { language: string; gameEngine?: string; request: string }) => {
          const template = [
            "Expert game developer. Improve code following guidelines:",
            "1. Best practices for " + input.language + "/" + (input.gameEngine || "Generic"),
            "2. Clean, efficient, documented code",
            "3. Error handling and patterns",
            "4. Performance optimization",
            "5. Game-specific improvements",
            "",
            "Request: " + input.request,
            "",
            "Reply format:",
            "- old_line",
            "+ new_line # ← brief explanation"
          ].join("\n");
          return template;
        }
      },
      this.model,
      new StringOutputParser(),
    ]);

    const result = await chain.invoke({
      request,
      language,
      gameEngine: gameEngine || "Generic"
    });

    if (!result) {
      throw new AIServiceError("No response received from AI model");
    }

    const { code: improvedCode, explanation, changes } = this.extractCodeAndChanges(result);

    if (!improvedCode?.trim()) {
      throw new AIServiceError("The AI model did not provide any code improvements. Please try again with a different prompt or code.");
    }

    const formatted = this.formatCode(improvedCode);
    const detailedChanges = this.findCodeChanges(code, formatted);
    const unifiedDiff = this.generateUnifiedDiff(code, formatted);

    return {
      code: formatted,
      originalCode: code,
      explanation: explanation || "The AI has provided improvements to your code. Review the changes above.",
      language,
      changes: detailedChanges,
      unifiedDiff,
      engineSuggestion: gameEngine ? this.suggestGameEngine(request, language) : undefined
    };
  }

  private extractCodeAndChanges(response: string): { 
    code: string; 
    explanation: string;
    changes: CodeChange[];
  } {
    try {
      // Process response in chunks to avoid memory issues
      const lines = response.split('\n');
      const changes: CodeChange[] = [];
      let currentChange: {
        lineNumber: number;
        originalLine: string;
        newLines: string[];
        explanation?: string;
      } | null = null;
      let improvedCode = '';
      let changeExplanation = '';

      // Process lines in chunks of 100
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines and file markers
        if (!line || line.startsWith('+ b/') || line.startsWith('- a/')) {
          continue;
        }

        if (line.startsWith('-')) {
          if (currentChange) {
            changes.push({
              lineNumber: currentChange.lineNumber,
              originalLine: currentChange.originalLine,
              improvedLine: currentChange.newLines.join('\n'),
              explanation: currentChange.explanation || 'Line was modified',
              contextBefore: [],
              contextAfter: [],
              severity: 'info'
            });
          }

          currentChange = {
            lineNumber: changes.length + 1,
            originalLine: line.substring(2),
            newLines: [],
            explanation: undefined
          };
        } else if (line.startsWith('+')) {
          const [, newLine, comment] = line.match(/^\+ (.+?)(?:\s+# ←\s*(.+))?$/) || [null, line.substring(2), ''];
          if (currentChange) {
            currentChange.newLines.push(newLine);
            if (comment) {
              currentChange.explanation = comment;
              changeExplanation += `- ${comment}\n`;
            }
          } else {
            // This is a new line addition
            improvedCode += newLine + '\n';
            if (comment) {
              changeExplanation += `- Added: ${comment}\n`;
            }
          }
        }
      }

      // Add the last change if any
      if (currentChange) {
        changes.push({
          lineNumber: currentChange.lineNumber,
          originalLine: currentChange.originalLine,
          improvedLine: currentChange.newLines.join('\n'),
          explanation: currentChange.explanation || 'Line was modified',
          contextBefore: [],
          contextAfter: [],
          severity: 'info'
        });
      }

      // Generate improved code from changes
      improvedCode = this.reconstructImprovedCode(changes);

      // Generate a meaningful explanation
      const explanation = changeExplanation || 'The code has been improved based on your request.';

      return {
        code: improvedCode,
        explanation,
        changes
      };
    } catch (error) {
      console.error("Error parsing AI response:", error);
      throw new AIServiceError("Failed to parse the AI response. Try again with simpler code.");
    }
  }

  private reconstructImprovedCode(changes: CodeChange[]): string {
    // Sort changes by line number to ensure correct order
    const sortedChanges = [...changes].sort((a, b) => a.lineNumber - b.lineNumber);
    
    let improvedCode = '';
    for (const change of sortedChanges) {
      // Skip empty lines or file markers
      if (!change.improvedLine.trim() || 
          change.improvedLine.startsWith('+ b/') || 
          change.improvedLine.startsWith('- a/')) {
        continue;
      }
      improvedCode += change.improvedLine + '\n';
    }
    
    return improvedCode.trim();
  }

  private findCodeChanges(originalCode: string, improvedCode: string): CodeChange[] {
    const originalLines = originalCode.split('\n');
    const improvedLines = improvedCode.split('\n');
    const patch = createPatch('code', originalCode, improvedCode);
    const changes: CodeChange[] = [];

    // Parse the unified diff format
    const lines = patch.split('\n').slice(4); // Skip the header lines
    let currentLine = 0;
    const CONTEXT_SIZE = 3;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('-')) {
        const nextLine = lines[i + 1];
        if (nextLine && nextLine.startsWith('+')) {
          // Get context before the change
          const contextBefore = originalLines.slice(
            Math.max(0, currentLine - CONTEXT_SIZE),
            currentLine
          );
          
          // Get context after the change
          const contextAfter = originalLines.slice(
            currentLine + 1,
            Math.min(originalLines.length, currentLine + CONTEXT_SIZE + 1)
          );

          changes.push({
            lineNumber: currentLine + 1,
            originalLine: line.slice(1),
            improvedLine: nextLine.slice(1),
            explanation: `Line ${currentLine + 1} was modified`,
            contextBefore,
            contextAfter,
            severity: 'info'
          });
          i++; // Skip the next line since we've processed it
        }
      }
      if (!line.startsWith('+')) {
        currentLine++;
      }
    }

    return changes;
  }

  private formatCode(code: string): string {
    return code
      .split('\n')
      .map(line => line.trim())
      .join('\n')
      .trim();
  }

  private suggestGameEngine(request: string, language: string): string {
    const req = request.toLowerCase();
    if (language === "C#") {
      if (req.includes("2d")) {
        return "Unity is recommended for 2D game development in C#";
      }
      return "Unity or Godot (C#) are excellent choices for this project";
    }
    if (language === "Python") {
      if (req.includes("2d") || req.includes("simple")) {
        return "Pygame is perfect for this type of project";
      }
      return "Pygame or Arcade would work well for this";
    }
    if (language === "JavaScript") {
      if (req.includes("web") || req.includes("browser")) {
        return "Phaser.js or Three.js would be ideal for web-based games";
      }
      return "Phaser.js, Three.js, or Babylon.js would work well";
    }
    if (language === "C++") {
      if (req.includes("3d")) {
        return "Unreal Engine is recommended for 3D game development in C++";
      }
      return "SFML, SDL2, or Unreal Engine depending on your needs";
    }
    return "Consider choosing an engine based on your specific requirements";
  }
}
