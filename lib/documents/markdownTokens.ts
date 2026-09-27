// lib/documents/markdownTokens.ts
// Единая точка парсинга markdown в токены через `marked` (лёгкий, pure-JS лексер,
// без зависимостей от DOM/браузера — идеально для serverless).
// И PDF-, и DOCX-генераторы работают с одним и тем же деревом токенов,
// чтобы не дублировать логику разбора markdown и не расходиться в поведении.

import { marked } from 'marked';

export type MarkedToken = ReturnType<typeof marked.lexer>[number];

/** Разбирает markdown-строку в массив токенов верхнего уровня (heading, paragraph, list, table, ...). */
export function parseMarkdown(markdown: string): MarkedToken[] {
  return marked.lexer(markdown ?? '');
}

/** Единица форматированного инлайн-текста — общий формат для pdfmake и docx. */
export interface InlineRun {
  text: string;
  bold?: boolean;
  italics?: boolean;
  code?: boolean;
}

/**
 * Рекурсивно разворачивает инлайн-токены (strong/em/codespan/text/link) в плоский
 * список форматированных "ранов" текста. Используется обоими генераторами (PDF/DOCX),
 * чтобы **жирный** и *курсив* из markdown корректно попадали в итоговый документ.
 */
export function inlineTokensToRuns(tokens: any[] = [], inheritedBold = false, inheritedItalics = false): InlineRun[] {
  const runs: InlineRun[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case 'strong':
        runs.push(...inlineTokensToRuns(token.tokens, true, inheritedItalics));
        break;
      case 'em':
        runs.push(...inlineTokensToRuns(token.tokens, inheritedBold, true));
        break;
      case 'codespan':
        runs.push({ text: token.text, code: true, bold: inheritedBold, italics: inheritedItalics });
        break;
      case 'link':
        // Ссылки в юридическом документе печатаем как обычный текст (без гиперссылки),
        // т.к. в PDF/DOCX для печати это выглядит естественнее.
        runs.push(...inlineTokensToRuns(token.tokens, inheritedBold, inheritedItalics));
        break;
      case 'br':
        runs.push({ text: '\n', bold: inheritedBold, italics: inheritedItalics });
        break;
      case 'text':
      default:
        // У некоторых inline-токенов есть вложенные `tokens` (например, вложенный em внутри text) —
        // рекурсивно обрабатываем, если они есть, иначе берём сырой текст.
        if (token.tokens && token.tokens.length > 0) {
          runs.push(...inlineTokensToRuns(token.tokens, inheritedBold, inheritedItalics));
        } else {
          runs.push({ text: token.text ?? token.raw ?? '', bold: inheritedBold, italics: inheritedItalics });
        }
    }
  }

  return runs;
}

/** Извлекает инлайн-токены первого параграфа внутри list item / blockquote (частая структура marked). */
export function firstParagraphTokens(container: any): any[] {
  const first = container?.tokens?.[0];
  if (first?.type === 'text' || first?.type === 'paragraph') {
    return first.tokens ?? [];
  }
  return container?.tokens ?? [];
}