/**
 * Helper para parsear archivos CSV, TSV o exportaciones de Excel en español.
 * Soporta delimitadores coma (,), punto y coma (;) y tabulaciones (\t).
 * Respeta comillas dobles "" para celdas con comas, punto y coma o saltos de línea.
 */

export interface ParsedCsvResult {
  headers: string[];
  rows: Record<string, string>[];
  delimiter: string;
}

export function parseCsvText(text: string): ParsedCsvResult {
  if (!text) return { headers: [], rows: [], delimiter: ',' };

  // Eliminar BOM UTF-8 (\uFEFF) si está presente
  let cleanText = text.replace(/^\uFEFF/, '').trim();
  if (!cleanText) return { headers: [], rows: [], delimiter: ',' };

  // Detectar delimitador (el más frecuente en la primera línea)
  const firstLine = cleanText.split(/\r\n|\n/)[0] || '';
  const commaCount = (firstLine.match(/,/g) || []).length;
  const semiCount = (firstLine.match(/;/g) || []).length;
  const tabCount = (firstLine.match(/\t/g) || []).length;

  let delimiter = ',';
  if (semiCount > commaCount && semiCount >= tabCount) {
    delimiter = ';';
  } else if (tabCount > commaCount && tabCount > semiCount) {
    delimiter = '\t';
  }

  // Tokenizador de CSV con autómata finito
  const allRows: string[][] = [];
  let currentRow: string[] = [];
  let currentCell = '';
  let insideQuotes = false;

  for (let i = 0; i < cleanText.length; i++) {
    const char = cleanText[i];
    const nextChar = cleanText[i + 1];

    if (insideQuotes) {
      if (char === '"') {
        if (nextChar === '"') {
          // Escaped quote ("")
          currentCell += '"';
          i++;
        } else {
          // Cierre de comillas
          insideQuotes = false;
        }
      } else {
        currentCell += char;
      }
    } else {
      if (char === '"') {
        insideQuotes = true;
      } else if (char === delimiter) {
        currentRow.push(currentCell.trim());
        currentCell = '';
      } else if (char === '\r') {
        if (nextChar === '\n') i++;
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c.length > 0)) {
          allRows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else if (char === '\n') {
        currentRow.push(currentCell.trim());
        if (currentRow.some(c => c.length > 0)) {
          allRows.push(currentRow);
        }
        currentRow = [];
        currentCell = '';
      } else {
        currentCell += char;
      }
    }
  }

  if (currentCell.length > 0 || currentRow.length > 0) {
    currentRow.push(currentCell.trim());
    if (currentRow.some(c => c.length > 0)) {
      allRows.push(currentRow);
    }
  }

  if (allRows.length === 0) {
    return { headers: [], rows: [], delimiter };
  }

  const rawHeaders = allRows[0].map(h => h.replace(/^["']|["']$/g, '').trim());
  const dataRows: Record<string, string>[] = [];

  for (let r = 1; r < allRows.length; r++) {
    const rowValues = allRows[r];
    const rowObj: Record<string, string> = {};
    rawHeaders.forEach((header, idx) => {
      rowObj[header] = rowValues[idx] || '';
    });
    dataRows.push(rowObj);
  }

  return {
    headers: rawHeaders,
    rows: dataRows,
    delimiter
  };
}
