// lib/documents/generatePdf.ts
// Генерация PDF из markdown БЕЗ headless-браузера — используется `pdfmake`,
// который рендерит PDF напрямую через pdfkit на чистом Node.js (без Chromium),
// что критично для serverless: холодный старт в разы быстрее, бандл в разы меньше.
//
// ВАЖНО (деплой на Vercel): pdfmake требует .ttf файлы шрифтов, подключаемые по пути,
// а не импортом — поэтому Next.js file tracing может их не подхватить автоматически.
// Положите шрифты в /fonts в корне проекта и добавьте в next.config.js:
//
//   module.exports = {
//     outputFileTracingIncludes: {
//       'app/api/generate/export/route.ts': ['./fonts/**'],
//     },
//   };
//
// Шрифты Roboto можно взять из репозитория pdfmake (examples/fonts) — они кириллицу
// поддерживают, что критично для русского и узбекского (кириллица/латиница) текста.

import pdfmake from 'pdfmake';
import path from 'path';
import { parseMarkdown, inlineTokensToRuns, firstParagraphTokens, type InlineRun } from './markdownTokens';

const FONTS_DIR = path.join(process.cwd(), 'fonts');

const fonts = {
  Roboto: {
    normal: path.join(FONTS_DIR, 'Roboto-Regular.ttf'),
    bold: path.join(FONTS_DIR, 'Roboto-Bold.ttf'),
    italics: path.join(FONTS_DIR, 'Roboto-Italic.ttf'),
    bolditalics: path.join(FONTS_DIR, 'Roboto-BoldItalic.ttf'),
  },
};

const HEADING_FONT_SIZE: Record<number, number> = { 1: 18, 2: 16, 3: 14, 4: 13, 5: 12, 6: 11 };

/** Конвертирует InlineRun[] в формат текстовых объектов pdfmake ({text, bold, italics}). */
function runsToPdfText(runs: InlineRun[]) {
  return runs.map((r) => ({
    text: r.text,
    bold: r.bold || undefined,
    italics: r.italics || undefined,
    // pdfmake не поддерживает моноширинный шрифт "из коробки" без доп. регистрации —
    // для инлайн-кода просто выделяем цветом, чтобы не тянуть ещё один шрифт.
    color: r.code ? '#b91c1c' : undefined,
  }));
}

/** Рекурсивно превращает токены `marked` в content-массив для docDefinition pdfmake. */
function tokensToPdfContent(tokens: any[]): any[] {
  const content: any[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'heading':
        content.push({
          text: runsToPdfText(inlineTokensToRuns(token.tokens)),
          fontSize: HEADING_FONT_SIZE[token.depth] ?? 12,
          bold: true,
          margin: [0, token.depth === 1 ? 12 : 8, 0, 6] as [number, number, number, number],
        });
        break;

      case 'paragraph':
        content.push({
          text: runsToPdfText(inlineTokensToRuns(token.tokens)),
          fontSize: 11,
          alignment: 'justify',
          margin: [0, 0, 0, 8] as [number, number, number, number],
        });
        break;

      case 'list':
        content.push({
          [token.ordered ? 'ol' : 'ul']: token.items.map((item: any) => ({
            text: runsToPdfText(inlineTokensToRuns(firstParagraphTokens(item))),
          })),
          fontSize: 11,
          margin: [0, 0, 0, 8] as [number, number, number, number],
        });
        break;

      case 'table': {
        const body = [
          token.header.map((cell: any) => ({
            text: runsToPdfText(inlineTokensToRuns(cell.tokens)),
            bold: true,
            fillColor: '#f1f5f9',
          })),
          ...token.rows.map((row: any[]) =>
            row.map((cell) => ({ text: runsToPdfText(inlineTokensToRuns(cell.tokens)) }))
          ),
        ];
        content.push({
          table: { headerRows: 1, widths: Array(token.header.length).fill('*'), body },
          fontSize: 10,
          margin: [0, 0, 0, 8] as [number, number, number, number],
        });
        break;
      }

      case 'blockquote':
        content.push({
          text: runsToPdfText(inlineTokensToRuns(firstParagraphTokens(token))),
          italics: true,
          color: '#555555',
          margin: [12, 0, 0, 8] as [number, number, number, number],
        });
        break;

      case 'hr':
        content.push({
          canvas: [{ type: 'line', x1: 0, y1: 0, x2: 495, y2: 0, lineWidth: 0.5, lineColor: '#cccccc' }],
          margin: [0, 8, 0, 8] as [number, number, number, number],
        });
        break;

      case 'space':
        break;

      default:
        if (token.raw) {
          content.push({ text: token.raw, fontSize: 11, margin: [0, 0, 0, 8] as [number, number, number, number] });
        }
    }
  }

  return content;
}

/**
 * Генерирует PDF-буфер из markdown-текста документа.
 * @param markdown исходный текст документа (сгенерированный LLM)
 * @param options.title заголовок метаданных PDF
 */
export async function generatePdfBuffer(markdown: string, options?: { title?: string }): Promise<Buffer> {
  const tokens = parseMarkdown(markdown);
  const content = tokensToPdfContent(tokens);

  pdfmake.setFonts(fonts);
  // Запрещаем загрузку внешних URL и ограничиваем чтение диска только папкой шрифтов.
  pdfmake.setUrlAccessPolicy(() => false);
  pdfmake.setLocalAccessPolicy((p: string) => path.resolve(p).startsWith(FONTS_DIR));

  const docDefinition: any = {
    info: { title: options?.title ?? 'Docly.uz' },
    defaultStyle: { font: 'Roboto', fontSize: 11, lineHeight: 1.3 },
    pageMargins: [50, 60, 50, 60],
    content,
  };

  const buffer = await pdfmake.createPdf(docDefinition).getBuffer();
  return Buffer.from(buffer);
}
