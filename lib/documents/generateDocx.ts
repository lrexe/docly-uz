// lib/documents/generateDocx.ts
// Генерация .docx из markdown через библиотеку `docx` — чистый JS, без Word/LibreOffice
// на сервере. Использует то же дерево токенов `marked`, что и generatePdf.ts.

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  Table,
  TableRow,
  TableCell,
  WidthType,
  AlignmentType,
  BorderStyle,
} from 'docx';
import { parseMarkdown, inlineTokensToRuns, firstParagraphTokens, type InlineRun } from './markdownTokens';

const HEADING_MAP: Record<number, (typeof HeadingLevel)[keyof typeof HeadingLevel]> = {
  1: HeadingLevel.HEADING_1,
  2: HeadingLevel.HEADING_2,
  3: HeadingLevel.HEADING_3,
  4: HeadingLevel.HEADING_4,
  5: HeadingLevel.HEADING_5,
  6: HeadingLevel.HEADING_6,
};

const NUMBERING_REFERENCE = 'docly-ordered-list';

/** Конвертирует InlineRun[] в TextRun[] библиотеки docx. */
function runsToTextRuns(runs: InlineRun[]): TextRun[] {
  if (runs.length === 0) return [new TextRun('')];
  return runs.map(
    (r) =>
      new TextRun({
        text: r.text,
        bold: r.bold,
        italics: r.italics,
        font: r.code ? 'Courier New' : undefined,
      })
  );
}

/** Превращает токены `marked` в массив блоков docx (Paragraph | Table). */
function tokensToDocxElements(tokens: any[]): (Paragraph | Table)[] {
  const elements: (Paragraph | Table)[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
        elements.push(
          new Paragraph({
            heading: HEADING_MAP[token.depth] ?? HeadingLevel.HEADING_4,
            children: runsToTextRuns(inlineTokensToRuns(token.tokens)),
            spacing: { before: 200, after: 120 },
          })
        );
        break;

      case 'paragraph':
        elements.push(
          new Paragraph({
            children: runsToTextRuns(inlineTokensToRuns(token.tokens)),
            alignment: AlignmentType.JUSTIFIED,
            spacing: { after: 160 },
          })
        );
        break;

      case 'list':
        token.items.forEach((item: any) => {
          elements.push(
            new Paragraph({
              children: runsToTextRuns(inlineTokensToRuns(firstParagraphTokens(item))),
              bullet: token.ordered ? undefined : { level: 0 },
              numbering: token.ordered ? { reference: NUMBERING_REFERENCE, level: 0 } : undefined,
              spacing: { after: 80 },
            })
          );
        });
        break;

      case 'table': {
        const headerRow = new TableRow({
          children: token.header.map(
            (cell: any) =>
              new TableCell({
                shading: { fill: 'F1F5F9' },
                children: [new Paragraph({ children: runsToTextRuns(inlineTokensToRuns(cell.tokens)) })],
              })
          ),
        });
        const bodyRows = token.rows.map(
          (row: any[]) =>
            new TableRow({
              children: row.map(
                (cell) =>
                  new TableCell({
                    children: [new Paragraph({ children: runsToTextRuns(inlineTokensToRuns(cell.tokens)) })],
                  })
              ),
            })
        );
        elements.push(
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [headerRow, ...bodyRows],
          })
        );
        break;
      }

      case 'blockquote':
        elements.push(
          new Paragraph({
            children: runsToTextRuns(inlineTokensToRuns(firstParagraphTokens(token)).map((r) => ({ ...r, italics: true }))),
            indent: { left: 400 },
            spacing: { after: 160 },
          })
        );
        break;

      case 'hr':
        elements.push(
          new Paragraph({
            border: { bottom: { color: 'CCCCCC', space: 1, style: BorderStyle.SINGLE, size: 6 } },
            spacing: { after: 160 },
          })
        );
        break;

      case 'space':
        break;

      default:
        if (token.raw) {
          elements.push(new Paragraph({ children: [new TextRun(token.raw)] }));
        }
    }
  }

  return elements;
}

/**
 * Генерирует DOCX-буфер из markdown-текста документа.
 * @param markdown исходный текст документа (сгенерированный LLM)
 * @param options.title заголовок метаданных документа
 */
export async function generateDocxBuffer(markdown: string, options?: { title?: string }): Promise<Buffer> {
  const tokens = parseMarkdown(markdown);
  const children = tokensToDocxElements(tokens);

  const doc = new Document({
    title: options?.title,
    numbering: {
      config: [
        {
          reference: NUMBERING_REFERENCE,
          levels: [{ level: 0, format: 'decimal', text: '%1.', alignment: AlignmentType.START }],
        },
      ],
    },
    sections: [{ properties: {}, children }],
  });

  return Packer.toBuffer(doc);
}