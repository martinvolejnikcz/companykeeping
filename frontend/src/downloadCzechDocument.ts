/** Export the Czech text the founder reviewed. Load the Word writer on demand. */
export async function downloadCzechDocument(text: string, filename: string): Promise<void> {
  const { Document, Packer, Paragraph, HeadingLevel, TextRun } = await import('docx');
  const lines = text.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().split(/\r?\n/);
  const paragraphs = lines.flatMap((line, index) => {
    if (!line.trim()) return [];
    const heading = index === 0 ? HeadingLevel.TITLE
      : /^(?:[IVXL]+\.\s|Podklady k projednání)/u.test(line) ? HeadingLevel.HEADING_1 : undefined;
    return [new Paragraph({ heading, widowControl: true, children: [new TextRun(line)] })];
  });
  const documentFile = new Document({
    creator: 'Companykeeping',
    title: lines[0],
    styles: {
      default: { document: {
        run: { font: 'Arial', size: 22, language: { value: 'cs-CZ' } },
        paragraph: { spacing: { after: 85, line: 265 } },
      } },
      paragraphStyles: [
        { id: 'Title', name: 'Title', basedOn: 'Normal', next: 'Normal',
          run: { bold: true, size: 36, color: '162840' },
          paragraph: { keepNext: true, spacing: { after: 160 } } },
        { id: 'Heading1', name: 'Heading 1', basedOn: 'Normal', next: 'Normal', quickFormat: true,
          run: { bold: true, size: 24, color: '2045BC' },
          paragraph: { outlineLevel: 0, keepNext: true, spacing: { before: 180, after: 80 } } },
      ],
    },
    sections: [{ properties: { page: {
      size: { width: 11906, height: 16838 },
      margin: { top: 1250, bottom: 1250, left: 1360, right: 1360 },
    } }, children: paragraphs }],
  });
  const url = URL.createObjectURL(await Packer.toBlob(documentFile));
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
