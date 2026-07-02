function unfold(block: string): string {
  // RFC 5545: a CRLF (or LF) followed by a space or tab is a line continuation.
  return block.replace(/\r?\n[ \t]/g, '');
}

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}

export function transformVevent(vevent: string, label: string, category: string): string {
  const lines = unfold(vevent).split(/\r?\n/);
  const out: string[] = [];
  let hasCategories = false;

  for (let line of lines) {
    if (/^SUMMARY[:;]/.test(line)) {
      const idx = line.indexOf(':');
      line = `${line.slice(0, idx)}:[${label}] ${line.slice(idx + 1)}`;
    } else if (/^UID[:;]/.test(line)) {
      const idx = line.indexOf(':');
      line = `${line.slice(0, idx)}:${slug(label)}-${line.slice(idx + 1)}`;
    } else if (/^CATEGORIES[:;]/.test(line)) {
      hasCategories = true;
      line = `${line},${category}`;
    }
    out.push(line);
  }

  if (!hasCategories) {
    const endIdx = out.findIndex((l) => l === 'END:VEVENT');
    const at = endIdx === -1 ? out.length : endIdx;
    out.splice(at, 0, `CATEGORIES:${category}`);
  }

  return out.join('\r\n');
}
