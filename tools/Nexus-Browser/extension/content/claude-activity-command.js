(() => {
  if (typeof window !== 'undefined' && globalThis.__browserAiBridgeClaudeActivityCommandLoaded) return;
  if (typeof window !== 'undefined') globalThis.__browserAiBridgeClaudeActivityCommandLoaded = true;

  const LANGUAGE_RE = /^(?:bash|sh|shell|zsh|fish|powershell|pwsh|python|python3|javascript|typescript|node|ruby|go|rust|sql|json|yaml|text|command)$/i;
  const COMMAND_SUMMARY_RE = /^ran\s+(?:(?:a|[\d,]+)\s+)?commands?\b/i;
  const SINGLE_COMMAND_RE = /^ran\s+(?:a|1)\s+command\b/i;
  const TOOL_BOUNDARY_RE = /^(?:searched the web|read\s+(?:a|[\d,]+)\s+pages?|recalled memory|added to memory|web search|used\s+(?:a|[\d,]+)\s+tools?|ran\s+(?:(?:a|[\d,]+)\s+)?commands?)\b/i;
  const COMMAND_SUMMARY_SELECTOR = 'button, [role="button"], summary, [aria-expanded], div, span, p';

  function compactText(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function preserveText(value) {
    return String(value || '')
      .replace(/\r\n?/g, '\n')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\n+|\n+$/g, '');
  }

  function visible(node) {
    if (!node) return false;
    if (typeof getComputedStyle === 'undefined') return true;
    try {
      const style = getComputedStyle(node);
      const rect = node.getBoundingClientRect?.();
      return style.display !== 'none'
        && style.visibility !== 'hidden'
        && style.opacity !== '0'
        && (!rect || (rect.width > 0 && rect.height > 0));
    } catch {
      return true;
    }
  }

  function labelFromContainer(container, codeNode) {
    if (!container) return '';
    for (const child of container.children || []) {
      if (child === codeNode || child.contains?.(codeNode)) continue;
      const text = compactText(child.innerText || child.textContent);
      if (/^output$/i.test(text) || LANGUAGE_RE.test(text)) return text;
    }
    const candidates = container.querySelectorAll?.('span, p') || [];
    for (const candidate of candidates) {
      if (codeNode?.contains?.(candidate)) continue;
      const text = compactText(candidate.innerText || candidate.textContent);
      if (/^output$/i.test(text) || LANGUAGE_RE.test(text)) return text;
    }
    return '';
  }

  function labelForCode(codeNode, widget) {
    let current = codeNode?.parentElement || null;
    for (let depth = 0; current && current !== widget && depth < 4; depth += 1) {
      const label = labelFromContainer(current, codeNode);
      if (label) return label;
      current = current.parentElement;
    }
    return '';
  }

  function codeNodes(widget) {
    if (!widget?.querySelectorAll) return [];
    const code = [...widget.querySelectorAll('code')].filter(visible);
    if (code.length) return code;
    return [...widget.querySelectorAll('pre')]
      .filter((node) => !node.querySelector?.('code'))
      .filter(visible);
  }

  function blocksFromCodeNodes(widget) {
    const blocks = [];
    for (const node of codeNodes(widget)) {
      const text = preserveText(node.innerText || node.textContent);
      if (!text) continue;
      const label = labelForCode(node, widget);
      if (/^output$/i.test(label)) {
        const target = blocks[blocks.length - 1];
        if (target) target.output = text;
        else blocks.push({ language: '', command: '', output: text });
        continue;
      }
      blocks.push({
        language: LANGUAGE_RE.test(label) ? label : '',
        command: text,
        output: ''
      });
    }
    return blocks.filter((block) => block.command || block.output);
  }

  function rawLines(widget) {
    return preserveText(widget?.innerText || widget?.textContent || '')
      .split('\n')
      .map((line) => line.replace(/[ \t]+$/g, ''));
  }

  function nextToolBoundary(lines, start) {
    for (let index = start; index < lines.length; index += 1) {
      const text = compactText(lines[index]);
      if (!text) continue;
      if (TOOL_BOUNDARY_RE.test(text)) return index;
    }
    return lines.length;
  }

  function blocksFromText(widget) {
    const lines = rawLines(widget);
    const blocks = [];

    for (let index = 0; index < lines.length; index += 1) {
      const language = compactText(lines[index]);
      if (!LANGUAGE_RE.test(language)) continue;

      let outputIndex = -1;
      let commandEnd = lines.length;
      for (let cursor = index + 1; cursor < lines.length; cursor += 1) {
        const text = compactText(lines[cursor]);
        if (/^output$/i.test(text)) {
          outputIndex = cursor;
          commandEnd = cursor;
          break;
        }
        if (TOOL_BOUNDARY_RE.test(text)) {
          commandEnd = cursor;
          break;
        }
      }

      const command = preserveText(lines.slice(index + 1, commandEnd).join('\n'));
      if (!command && outputIndex < 0) continue;

      let output = '';
      let endIndex = commandEnd;
      if (outputIndex >= 0) {
        endIndex = nextToolBoundary(lines, outputIndex + 1);
        output = preserveText(lines.slice(outputIndex + 1, endIndex).join('\n'));
      }

      if (command || output) {
        blocks.push({ language, command, output });
        index = Math.max(index, endIndex - 1);
      }
    }

    return blocks;
  }

  function commandBlocks(widget) {
    const structured = blocksFromCodeNodes(widget);
    if (structured.length) return structured;
    return blocksFromText(widget);
  }

  function firstVisibleLine(node) {
    return preserveText(node?.innerText || node?.textContent || '')
      .split('\n')
      .map(compactText)
      .find(Boolean) || '';
  }

  function isAggregateCommandSummary(label) {
    const match = String(label || '').match(/^ran\s+([\d,]+)\s+commands?\b/i);
    if (!match) return false;
    return Number(match[1].replace(/,/g, '')) > 1;
  }

  function isSingleCommandSummary(label) {
    return SINGLE_COMMAND_RE.test(compactText(label));
  }

  function commandSummaryNodes(root) {
    if (!root?.querySelectorAll) return [];
    const candidates = [...root.querySelectorAll(COMMAND_SUMMARY_SELECTOR)]
      .filter(visible)
      .filter((node) => isSingleCommandSummary(firstVisibleLine(node)));
    return candidates.filter((node) => !candidates.some((other) => {
      return other !== node && node.contains?.(other);
    }));
  }

  function commandCardForSummary(summary, root) {
    let current = summary || null;
    for (let depth = 0; current && depth < 10; depth += 1) {
      const nestedSummaries = commandSummaryNodes(current);
      if (current !== summary && nestedSummaries.length > 1) break;
      if (commandBlocks(current).length && nestedSummaries.length <= 1) return current;
      if (current === root) break;
      current = current.parentElement;
    }
    return null;
  }

  function commandCardEntries(root) {
    const entries = [];
    const seen = new Set();
    for (const summary of commandSummaryNodes(root)) {
      const widget = commandCardForSummary(summary, root);
      if (!widget || seen.has(widget)) continue;
      const blocks = commandBlocks(widget);
      if (!blocks.length) continue;
      seen.add(widget);
      entries.push({ summary, widget, blocks });
    }
    return entries;
  }

  function aggregateStatusSurface(summary, root) {
    const status = summary?.closest?.('.row-start-1') || null;
    if (!status) return null;
    if (root?.contains && !root.contains(status)) return null;
    if (status.closest?.('.row-start-2')) return null;
    return status;
  }

  function commandSurfaceForSummary(summary, root) {
    const summaryText = compactText(summary?.innerText || summary?.textContent || '');
    if (isAggregateCommandSummary(summaryText)) return summary;

    const card = commandCardForSummary(summary, root);
    if (card) return card;

    let current = summary || null;
    for (let depth = 0; current && depth < 9; depth += 1) {
      const blocks = commandBlocks(current);
      if (blocks.length) return current;
      if (current === root) break;
      current = current.parentElement;
    }
    return null;
  }

  function structuredLineSet(commands) {
    const lines = new Set();
    for (const block of commands || []) {
      if (block.language) lines.add(compactText(block.language));
      if (block.output) lines.add('Output');
      for (const value of [block.command, block.output]) {
        for (const line of String(value || '').split(/\n+/)) {
          const normalized = compactText(line);
          if (normalized) lines.add(normalized);
        }
      }
    }
    return lines;
  }

  function stripCommandLines(lines, commands) {
    const structured = structuredLineSet(commands);
    return (lines || []).filter((line) => !structured.has(compactText(line)));
  }

  function formatCommandBlocks(commands) {
    return (commands || []).map((block) => {
      const parts = [];
      if (block.command) {
        parts.push(`\`\`\`${block.language || ''}`.trimEnd(), block.command, '\`\`\`');
      }
      if (block.output) {
        parts.push('Output', '\`\`\`text', block.output, '\`\`\`');
      }
      return parts.join('\n');
    }).filter(Boolean).join('\n\n');
  }

  const api = {
    LANGUAGE_RE,
    COMMAND_SUMMARY_RE,
    SINGLE_COMMAND_RE,
    TOOL_BOUNDARY_RE,
    COMMAND_SUMMARY_SELECTOR,
    compactText,
    preserveText,
    visible,
    labelForCode,
    codeNodes,
    blocksFromCodeNodes,
    blocksFromText,
    commandBlocks,
    firstVisibleLine,
    commandSummaryNodes,
    commandCardForSummary,
    commandCardEntries,
    commandSurfaceForSummary,
    aggregateStatusSurface,
    isAggregateCommandSummary,
    isSingleCommandSummary,
    structuredLineSet,
    stripCommandLines,
    formatCommandBlocks
  };

  if (typeof window !== 'undefined') globalThis.BrowserAiBridgeClaudeActivityCommand = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
