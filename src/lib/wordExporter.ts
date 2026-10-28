import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle } from 'docx';

export function cleanLatexToWordMath(str: string): string {
  if (!str) return '';

  let text = str;

  // 1. Remove $$ and $ inline latex wrappers
  text = text.replace(/\$\$(.*?)\$\$/g, '$1');
  text = text.replace(/\$(.*?)\$/g, '$1');

  // 2. Convert \frac{num}{den} recursively
  while (/\\frac\{([^{}]+)\}\{([^{}]+)\}/.test(text)) {
    text = text.replace(/\\frac\{([^{}]+)\}\{([^{}]+)\}/g, '($1)/($2)');
  }

  // 3. Convert \sqrt[n]{x} and \sqrt{x}
  text = text.replace(/\\sqrt\[([^{}]+)\]\{([^{}]+)\}/g, '$1√($2)');
  while (/\\sqrt\{([^{}]+)\}/.test(text)) {
    text = text.replace(/\\sqrt\{([^{}]+)\}/g, '√($1)');
  }

  // 4. Sets and Blackboard Bold
  text = text.replace(/\\mathbb\{R\}|\\mathbb R/g, 'ℝ');
  text = text.replace(/\\mathbb\{N\}|\\mathbb N/g, 'ℕ');
  text = text.replace(/\\mathbb\{Z\}|\\mathbb Z/g, 'ℤ');
  text = text.replace(/\\mathbb\{Q\}|\\mathbb Q/g, 'ℚ');
  text = text.replace(/\\mathbb\{C\}|\\mathbb C/g, 'ℂ');

  // 5. Greek letters
  text = text.replace(/\\alpha/g, 'α');
  text = text.replace(/\\beta/g, 'β');
  text = text.replace(/\\gamma/g, 'γ');
  text = text.replace(/\\Gamma/g, 'Γ');
  text = text.replace(/\\delta/g, 'δ');
  text = text.replace(/\\Delta/g, 'Δ');
  text = text.replace(/\\epsilon/g, 'ε');
  text = text.replace(/\\theta/g, 'θ');
  text = text.replace(/\\lambda/g, 'λ');
  text = text.replace(/\\mu/g, 'μ');
  text = text.replace(/\\pi/g, 'π');
  text = text.replace(/\\sigma/g, 'σ');
  text = text.replace(/\\omega/g, 'ω');
  text = text.replace(/\\Omega/g, 'Ω');

  // 6. Math operators & relations
  text = text.replace(/\\le\b|\\leq\b/g, '≤');
  text = text.replace(/\\ge\b|\\geq\b/g, '≥');
  text = text.replace(/\\neq\b|\\ne\b/g, '≠');
  text = text.replace(/\\approx\b/g, '≈');
  text = text.replace(/\\pm\b/g, '±');
  text = text.replace(/\\times\b/g, '×');
  text = text.replace(/\\cdot\b/g, '·');
  text = text.replace(/\\div\b/g, '÷');
  text = text.replace(/\\infty\b/g, '∞');
  text = text.replace(/\\in\b/g, '∈');
  text = text.replace(/\\notin\b/g, '∉');
  text = text.replace(/\\subset\b/g, '⊂');
  text = text.replace(/\\cup\b/g, '∪');
  text = text.replace(/\\cap\b/g, '∩');
  text = text.replace(/\\emptyset\b|\\empty\b/g, '∅');
  text = text.replace(/\\forall\b/g, '∀');
  text = text.replace(/\\exists\b/g, '∃');
  text = text.replace(/\\to\b|\\rightarrow\b/g, '→');
  text = text.replace(/\\Rightarrow\b/g, '⇒');
  text = text.replace(/\\Leftrightarrow\b/g, '⇔');
  text = text.replace(/\\int\b/g, '∫');
  text = text.replace(/\\sum\b/g, '∑');
  text = text.replace(/\\lim\b/g, 'lim');

  // 7. Functions & vectors
  text = text.replace(/\\sin\b/g, 'sin');
  text = text.replace(/\\cos\b/g, 'cos');
  text = text.replace(/\\tan\b/g, 'tan');
  text = text.replace(/\\cot\b/g, 'cot');
  text = text.replace(/\\log\b/g, 'log');
  text = text.replace(/\\ln\b/g, 'ln');
  text = text.replace(/\\vec\{([^{}]+)\}/g, '$1⃗');

  // 8. Superscripts & Subscripts
  text = text.replace(/\^2/g, '²');
  text = text.replace(/\^3/g, '³');
  text = text.replace(/\^1/g, '¹');
  text = text.replace(/\^0/g, '⁰');
  text = text.replace(/\^4/g, '⁴');
  text = text.replace(/\^n/g, 'ⁿ');
  text = text.replace(/\^x/g, 'ˣ');
  text = text.replace(/_1/g, '₁');
  text = text.replace(/_2/g, '₂');
  text = text.replace(/_3/g, '₃');
  text = text.replace(/_0/g, '₀');

  return text;
}

export async function generateExamDocxBlob(examText: string, title = 'Đề thi đã chuẩn hóa'): Promise<Blob> {
  const lines = examText.split('\n');
  const children: (Paragraph | Table)[] = [];

  // Document Title Header
  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: title.toUpperCase(),
          bold: true,
          size: 28, // 14pt
          font: 'Times New Roman',
          color: '1E3A8A', // Deep Blue
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 200, before: 100 },
    })
  );

  children.push(
    new Paragraph({
      children: [
        new TextRun({
          text: 'SỞ GIÁO DỤC VÀ ĐÀO TẠO TỈNH AN GIANG • TRƯỜNG THPT NGUYỄN QUANG DIÊU',
          italics: true,
          bold: true,
          size: 20, // 10pt
          font: 'Times New Roman',
          color: '475569',
        }),
      ],
      alignment: AlignmentType.CENTER,
      spacing: { after: 400 },
    })
  );

  let inTableMode = false;
  let tableRows: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const line = cleanLatexToWordMath(rawLine.trim());

    if (!line) {
      if (inTableMode && tableRows.length > 0) {
        // Flush table
        children.push(createWordTable(tableRows));
        inTableMode = false;
        tableRows = [];
      }
      children.push(new Paragraph({ spacing: { after: 120 } }));
      continue;
    }

    // Table markdown line check | col | col |
    if (line.startsWith('|') && line.endsWith('|')) {
      inTableMode = true;
      if (!line.includes('---')) {
        tableRows.push(line);
      }
      continue;
    } else if (inTableMode) {
      // Flush accumulated table
      children.push(createWordTable(tableRows));
      inTableMode = false;
      tableRows = [];
    }

    // Check for Section Headers (PHẦN I, PHẦN II, PHẦN III)
    if (/^(PHẦN|Phần)\s+[I|V|X|1-9]+/i.test(line)) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              bold: true,
              size: 26, // 13pt
              font: 'Times New Roman',
              color: '0F172A',
            }),
          ],
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 300, after: 150 },
        })
      );
      continue;
    }

    // Check for Questions (Câu 1:, Câu 2:...)
    if (/^(Câu|câu)\s+\d+/i.test(line)) {
      children.push(
        new Paragraph({
          children: [
            new TextRun({
              text: line,
              bold: true,
              size: 24, // 12pt
              font: 'Times New Roman',
            }),
          ],
          spacing: { before: 200, after: 100 },
        })
      );
      continue;
    }

    // Check for Image or Table lines
    // If line is a markdown image line like ![...](...) or [Hình...], convert to a clean "Hình ảnh" single-cell table
    if (/^\!\[.*\]\(.*\)/.test(line) || /^\[Hình\s*.*\]/.test(line) || line === 'Hình ảnh minh họa') {
      children.push(createWordTable(['| Hình ảnh |']));
      continue;
    }

    // Options or normal line
    // Keep asterisk intact for correct answers, no special green color or artificial bold
    children.push(
      new Paragraph({
        children: [
          new TextRun({
            text: line, // Keep line intact including '*'
            size: 24, // 12pt
            font: 'Times New Roman',
            color: '0F172A',
          }),
        ],
        spacing: { after: 80 },
        indent: line.match(/^(\*?\s*)[A-D]\.|^(\*?\s*)[a-d]\)/) ? { left: 360 } : undefined,
      })
    );
  }

  if (inTableMode && tableRows.length > 0) {
    children.push(createWordTable(tableRows));
  }

  const doc = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

function createWordTable(rows: string[]): Table {
  const tableRows: TableRow[] = [];

  // Filter out markdown alignment separator rows like | :---: | or | --- |
  const contentRows = rows.filter((r) => !/^\|[\s:\-]*\|$/.test(r.trim()) && !r.includes('---'));

  contentRows.forEach((r, idx) => {
    const cells = r
      .split('|')
      .map((c) => c.trim())
      .filter((c, cellIdx) => cellIdx !== 0 && cellIdx !== r.split('|').length - 1);

    const tableCells: TableCell[] = cells.map((cellText) => {
      // Clean up markdown image syntax like ![Hình minh họa](Hình vẽ) -> "Hình ảnh"
      let cleanCellText = cleanLatexToWordMath(cellText);
      if (/^\!\[.*\]\(.*\)/.test(cleanCellText) || cleanCellText.startsWith('![')) {
        cleanCellText = 'Hình ảnh';
      }

      return new TableCell({
        children: [
          new Paragraph({
            children: [
              new TextRun({
                text: cleanCellText,
                bold: idx === 0, // Header row bold
                size: 22,
                font: 'Times New Roman',
              }),
            ],
            alignment: AlignmentType.CENTER,
          }),
        ],
        width: { size: 100 / (cells.length || 1), type: WidthType.PERCENTAGE },
        borders: {
          top: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
          bottom: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
          left: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
          right: { style: BorderStyle.SINGLE, size: 1, color: 'CBD5E1' },
        },
      });
    });

    tableRows.push(new TableRow({ children: tableCells }));
  });

  return new Table({
    rows: tableRows,
    width: { size: 100, type: WidthType.PERCENTAGE },
  });
}

export async function generateCourseTemplateDocxBlob(): Promise<Blob> {
  const templateText = `MẪU THÔNG TIN TẠO NHANH KHÓA HỌC LMS NQDIEU

I. THÔNG TIN CHUNG
Tên khóa học*: Ôn tập Hóa học 12 - Chương 1: Este & Lipit
Link ảnh bìa khóa học: https://images.unsplash.com/photo-1532094349884-543bc11b234d?auto=format&fit=crop&w=800&q=80
Mô tả khóa học: Khóa học tóm tắt toàn bộ lý thuyết trọng tâm và các dạng bài tập phân loại Este - Lipit cho học sinh khối 12.
Thời gian mở khóa học: 2026-08-01
Thời gian kết thúc khóa học: 2026-12-31

II. PHÒNG HỌC ONLINE (GOOGLE MEET, MS TEAMS, ZOOM)
Nền tảng phòng học: Google Meet
Tên phòng học / Tiêu đề: Lớp học trực tuyến Hóa 12 - Ôn tập Este Lipit
Link phòng học Online (URL) *: https://meet.google.com/abc-defg-hij
Lịch học trực tuyến (Tùy chọn): Tối thứ 3 & thứ 5 (19h30 - 21h00)
Ghi chú / Passcode (Tùy chọn): Mật khẩu: 123456

III. NỘI DUNG CÁC BÀI HỌC
1. Bài 1
Tên bài học: Bài 1. Khái niệm, Danh pháp và Tính chất hóa học của Este
Link Video (Youtube/MP4): https://www.youtube.com/watch?v=dQw4w9WgXcQ
Link File Tài liệu (PDF/Drive): https://drive.google.com/file/d/1sample_document/view
Link Slide PPT / Google Slides: https://docs.google.com/presentation/d/1sample_slide/edit
Thời gian học tối thiểu (phút): 45

2. Bài 2
Tên bài học: Bài 2. Cấu tạo, Tính chất và Phản ứng Thủy phân của Lipit
Link Video (Youtube/MP4): https://www.youtube.com/watch?v=dQw4w9WgXcQ
Link File Tài liệu (PDF/Drive): https://drive.google.com/file/d/2sample_document/view
Link Slide PPT / Google Slides: https://docs.google.com/presentation/d/2sample_slide/edit
Thời gian học tối thiểu (phút): 40

V. CẤP GIẤY CHỨNG NHẬN HOÀN THÀNH KHÓA HỌC
Tên Đơn vị chủ quản: SỞ GIÁO DỤC VÀ ĐÀO TẠO TỈNH AN GIANG
Tên Đơn vị trực tiếp: TRƯỜNG THPT NGUYỄN QUANG DIÊU
Ký hiệu / Hậu tố Số Giấy chứng nhận: NQD-HH12
Chức vụ người ký: HIỆU TRƯỜNG
Chức vụ người ký thay (nếu có): KT. HIỆU TRƯỜNG - PHÓ HIỆU TRƯỜNG
Họ tên người ký: Nguyễn Văn A`;

  const lines = templateText.split('\n');
  const paragraphs: Paragraph[] = lines.map((line) => {
    const isHeader = line.startsWith('I.') || line.startsWith('II.') || line.startsWith('III.') || line.startsWith('IV.') || line.startsWith('V.') || line.startsWith('MẪU');
    const isLabel = line.includes(':');
    
    return new Paragraph({
      children: [
        new TextRun({
          text: line,
          bold: isHeader || isLabel,
          size: isHeader ? 26 : 22,
          font: 'Times New Roman',
          color: isHeader ? '1E3A8A' : '1E293B',
        }),
      ],
      alignment: isHeader && line.startsWith('MẪU') ? AlignmentType.CENTER : AlignmentType.LEFT,
      spacing: { after: 120 },
    });
  });

  const doc = new Document({
    sections: [
      {
        properties: {},
        children: paragraphs,
      },
    ],
  });

  return await Packer.toBlob(doc);
}

