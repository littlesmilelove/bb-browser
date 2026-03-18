interface ParseSuccess<T> {
  ok: true;
  value: T;
}

interface ParseFailure {
  ok: false;
  error: Error;
}

function buildPreview(raw: string): string {
  return raw.length > 200 ? `${raw.slice(0, 200)}...` : raw;
}

function tryParseJson<T>(raw: string): ParseSuccess<T> | ParseFailure {
  try {
    return { ok: true, value: JSON.parse(raw) as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}

function tryParseLineSlices<T>(raw: string): ParseSuccess<T> | null {
  const lines = raw.split(/\r?\n/);

  for (let start = lines.length - 1; start >= 0; start -= 1) {
    for (let end = lines.length; end > start; end -= 1) {
      const candidate = lines.slice(start, end).join("\n").trim();
      if (!candidate) {
        continue;
      }

      const parsed = tryParseJson<T>(candidate);
      if (parsed.ok) {
        return parsed;
      }
    }
  }

  return null;
}

function extractTopLevelJson(raw: string, start: number): string | null {
  const opener = raw[start];
  const expectedCloser = opener === "{" ? "}" : opener === "[" ? "]" : null;
  if (!expectedCloser) {
    return null;
  }

  const stack = [expectedCloser];
  let inString = false;
  let escaped = false;

  for (let index = start + 1; index < raw.length; index += 1) {
    const char = raw[index];

    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (char === "\\") {
        escaped = true;
        continue;
      }
      if (char === "\"") {
        inString = false;
      }
      continue;
    }

    if (char === "\"") {
      inString = true;
      continue;
    }

    if (char === "{" || char === "[") {
      stack.push(char === "{" ? "}" : "]");
      continue;
    }

    if (char === "}" || char === "]") {
      const expected = stack.pop();
      if (expected !== char) {
        return null;
      }
      if (stack.length === 0) {
        return raw.slice(start, index + 1);
      }
    }
  }

  return null;
}

export function parseOpenClawJson<T>(raw: string): T {
  const trimmed = raw.trim();
  if (!trimmed) {
    throw new Error("OpenClaw returned empty output");
  }

  const direct = tryParseJson<T>(trimmed);
  if (direct.ok) {
    return direct.value;
  }

  const fromLines = tryParseLineSlices<T>(trimmed);
  if (fromLines) {
    return fromLines.value;
  }

  for (let index = trimmed.length - 1; index >= 0; index -= 1) {
    const char = trimmed[index];
    if (char !== "{" && char !== "[") {
      continue;
    }

    const candidate = extractTopLevelJson(trimmed, index);
    if (!candidate) {
      continue;
    }

    const parsed = tryParseJson<T>(candidate);
    if (parsed.ok) {
      return parsed.value;
    }
  }

  throw new Error(`Failed to parse OpenClaw JSON output: ${direct.error.message}\nRaw (preview): ${buildPreview(trimmed)}`);
}
