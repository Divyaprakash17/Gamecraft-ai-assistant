// Basic syntax highlighter for game development code
export const highlightSyntax = (code: string): string => {
  // Simple regex-based syntax highlighting (can be expanded)
  return code
    .replace(/\/\/.*/g, '<span style="color: #6B7280">$&</span>') // Comments - gray-500
    .replace(/\/\*[\s\S]*?\*\//g, '<span style="color: #6B7280">$&</span>') // Multi-line comments - gray-500
    .replace(/\b(function|class|constructor|extends|implements|interface|enum|return|if|else|for|while|switch|case|break|continue|new|this|super|static|public|private|protected|import|export|as|from|default|const|let|var)\b/g, 
      '<span style="color: #A78BFA">$&</span>') // Keywords - purple-400
    .replace(/\b(Vector2|Vector3|Quaternion|Transform|GameObject|Component|Rigidbody|Collider|Input|Physics|Time|Mathf|Debug|Instantiate|Destroy)\b/g,
      '<span style="color: #60A5FA">$&</span>') // Common game development classes - blue-400
    .replace(/\b(update|start|awake|onEnable|onDisable|onCollision|fixedUpdate|lateUpdate)\b/g,
      '<span style="color: #34D399">$&</span>') // Common game development methods - green-400
    .replace(/(".*?"|'.*?'|`.*?`)/g, '<span style="color: #FCD34D">$&</span>') // Strings - yellow-300
    .replace(/\b(\d+(\.\d+)?)\b/g, '<span style="color: #FB923C">$&</span>'); // Numbers - orange-400
};

// Function to highlight changes between original and improved code
export const highlightChanges = (originalCode: string, improvedCode: string): string => {
  const lines1 = originalCode.split('\n');
  const lines2 = improvedCode.split('\n');
  let result = '';

  // Simple line-by-line comparison
  let i = 0;
  let j = 0;
  
  while (i < lines1.length || j < lines2.length) {
    if (i >= lines1.length) {
      // Added lines
      result += `<div style="background-color: rgba(34, 197, 94, 0.2); margin: 0 -1rem; padding: 0 1rem;">${highlightSyntax(lines2[j])}</div>\n`;
      j++;
    } else if (j >= lines2.length) {
      // Removed lines (shouldn't typically happen in the improved version)
      result += `<div style="background-color: rgba(239, 68, 68, 0.2); margin: 0 -1rem; padding: 0 1rem;">${highlightSyntax(lines1[i])}</div>\n`;
      i++;
    } else if (lines1[i] !== lines2[j]) {
      // Modified lines
      result += `<div style="background-color: rgba(59, 130, 246, 0.2); margin: 0 -1rem; padding: 0 1rem;">${highlightSyntax(lines2[j])}</div>\n`;
      i++;
      j++;
    } else {
      // Unchanged lines
      result += `${highlightSyntax(lines2[j])}\n`;
      i++;
      j++;
    }
  }

  return result;
};

// Function to generate a summary of changes
export const generateChangeSummary = (originalCode: string, improvedCode: string): string => {
  const lines1 = originalCode.split('\n');
  const lines2 = improvedCode.split('\n');
  
  let added = 0;
  let removed = 0;
  let modified = 0;
  
  let i = 0;
  let j = 0;
  
  while (i < lines1.length || j < lines2.length) {
    if (i >= lines1.length) {
      added++;
      j++;
    } else if (j >= lines2.length) {
      removed++;
      i++;
    } else if (lines1[i] !== lines2[j]) {
      modified++;
      i++;
      j++;
    } else {
      i++;
      j++;
    }
  }
  
  return `${added} lines added, ${removed} lines removed, ${modified} lines modified`;
};
