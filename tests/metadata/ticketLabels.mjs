import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

export const metadataPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'ticket-test-labels.json');
export const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

let cachedMetadata;

export function loadTicketTestMetadata(filePath = metadataPath) {
  if (!cachedMetadata || filePath !== metadataPath) {
    cachedMetadata = existsSync(filePath)
      ? JSON.parse(readFileSync(filePath, 'utf8'))
      : { schemaVersion: 1, entries: [], documentedTicketsWithoutExistingTests: [] };
  }
  return cachedMetadata;
}

export function metadataLabelsForTest({ filePath, testName, suiteName, metadata = loadTicketTestMetadata() }) {
  const relativeFile = normalizePath(path.isAbsolute(filePath) ? path.relative(projectRoot, filePath) : filePath);
  const labels = [];
  for (const entry of metadata.entries ?? []) {
    if (!matchesEntry(entry, { relativeFile, testName, suiteName })) {
      continue;
    }
    labels.push(...expandMetadataLabels(entry.labels ?? {}));
  }
  return dedupeLabels(labels);
}

export function expandMetadataLabels(labels) {
  return [
    ...oneOrMany('verificationSet', labels.verificationSet),
    ...oneOrMany('ticket', labels.ticket ?? labels.tickets),
    ...oneOrMany('requirement', labels.requirement ?? labels.requirements),
    ...oneOrMany('ownerType', labels.ownerType),
    ...oneOrMany('owner', labels.owner),
    ...oneOrMany('testConcern', labels.testConcern),
    ...oneOrMany('runtimeSlice', labels.runtimeSlice),
  ];
}

export function verifyTicketMetadataCompleteness({ ticketPaths = [], metadata = loadTicketTestMetadata() } = {}) {
  const linkedTickets = new Set(
    (metadata.entries ?? []).flatMap((entry) => asArray(entry.labels?.ticket ?? entry.labels?.tickets)),
  );
  const documentedNoTest = new Set((metadata.documentedTicketsWithoutExistingTests ?? []).map((entry) => entry.ticket));
  const missing = [];
  const invalidEntries = [];

  for (const entry of metadata.entries ?? []) {
    const labels = entry.labels ?? {};
    for (const labelName of ['verificationSet', 'ownerType', 'owner', 'testConcern']) {
      if (asArray(labels[labelName]).length === 0) {
        invalidEntries.push(`${entry.file ?? entry.filePrefix ?? '<unknown>'}: missing ${labelName}`);
      }
    }
    if (asArray(labels.ticket ?? labels.tickets).length === 0) {
      invalidEntries.push(`${entry.file ?? entry.filePrefix ?? '<unknown>'}: missing ticket`);
    }
    if (entry.file && !existsSync(path.join(projectRoot, entry.file))) {
      invalidEntries.push(`${entry.file}: file does not exist`);
    }
  }

  if (invalidEntries.length > 0) {
    throw new Error(`Ticket metadata has invalid entries:\n${invalidEntries.join('\n')}`);
  }

  for (const ticketPath of ticketPaths) {
    const contents = readFileSync(ticketPath, 'utf8');
    if (contents.includes('# Implementation Ticket Template')) {
      continue;
    }
    const ticket = inferTicketId(ticketPath, contents);
    const status = contents.match(/^STATUS:\s*(.+)$/mu)?.[1]?.trim() ?? 'unknown';
    if (linkedTickets.has(ticket) || documentedNoTest.has(ticket) || status === 'pending') {
      continue;
    }
    missing.push(ticket);
  }

  if (missing.length > 0) {
    throw new Error(`Ticket metadata is missing test links for: ${missing.sort().join(', ')}`);
  }

  return {
    linkedTickets: [...linkedTickets].sort(),
    documentedTicketsWithoutExistingTests: [...documentedNoTest].sort(),
  };
}

function matchesEntry(entry, { relativeFile, testName, suiteName }) {
  if (entry.file && normalizePath(entry.file) !== relativeFile) {
    return false;
  }
  if (entry.filePrefix && !relativeFile.startsWith(normalizePath(entry.filePrefix))) {
    return false;
  }
  if (entry.testName && entry.testName !== testName) {
    return false;
  }
  if (entry.suiteName && entry.suiteName !== suiteName) {
    return false;
  }
  return true;
}

function oneOrMany(name, value) {
  return asArray(value).map((entry) => ({ name, value: entry }));
}

function asArray(value) {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function dedupeLabels(labels) {
  const seen = new Set();
  return labels.filter((label) => {
    const key = `${label.name}:${label.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function inferTicketId(ticketPath, contents) {
  const titleMatch = contents.match(/\b([A-Z]+(?:-[A-Z]+)*-\d{3}|SYST-\d{3}|T\d{3})\b/u);
  if (titleMatch) {
    return titleMatch[1];
  }
  return path.basename(path.dirname(ticketPath)).split('-').slice(0, 2).join('-');
}

function normalizePath(value) {
  return value.replace(/\\/gu, '/');
}
