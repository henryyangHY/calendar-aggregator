export interface ParsedIcs {
  vevents: string[];
  vtimezones: string[];
}

function extractBlocks(icsText: string, blockName: string): string[] {
  const lines = icsText.split(/\r?\n/);
  const begin = `BEGIN:${blockName}`;
  const end = `END:${blockName}`;
  const blocks: string[] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (line === begin) {
      current = [line];
    } else if (line === end && current) {
      current.push(line);
      blocks.push(current.join('\r\n'));
      current = null;
    } else if (current) {
      current.push(line);
    }
  }
  return blocks;
}

export function parseIcs(icsText: string): ParsedIcs {
  return {
    vevents: extractBlocks(icsText, 'VEVENT'),
    vtimezones: extractBlocks(icsText, 'VTIMEZONE'),
  };
}
