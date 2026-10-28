import mammoth from 'mammoth';
import JSZip from 'jszip';
import omml2mathml from 'omml2mathml';
import WMF from 'wmf';
import { QuizQuestionP1, QuizQuestionP2, QuizQuestionP3 } from '../types';

/**
 * Render WMF binary data to a PNG Data URL using HTML Canvas in browser
 */
function convertWmfToPngDataUrl(uint8Array: Uint8Array): string | null {
  try {
    if (typeof document === 'undefined') return null;
    const canvas = document.createElement('canvas');
    WMF.draw_canvas(uint8Array, canvas);

    if (canvas.width > 0 && canvas.height > 0) {
      return canvas.toDataURL('image/png');
    }
  } catch (err) {
    console.warn('[WMF conversion error]:', err);
  }
  return null;
}

/**
 * Preprocess docx ZIP package before mammoth parsing:
 * 1. Convert Word OMML (m:oMath) to standard MathML strings
 * 2. Extract MathType OLE embedded equations & images (WMF, EMF, PNG, JPEG)
 * 3. Convert WMF vector formulas directly to PNG base64 so browsers render them crisply!
 */
async function preprocessDocxArrayBuffer(arrayBuffer: ArrayBuffer): Promise<ArrayBuffer> {
  try {
    const zip = await JSZip.loadAsync(arrayBuffer);
    const docFile = zip.file('word/document.xml');
    if (!docFile) return arrayBuffer;

    const docXmlStr = await docFile.async('string');
    if (!docXmlStr) return arrayBuffer;

    // Load relationships from document.xml.rels
    const relsFile = zip.file('word/_rels/document.xml.rels');
    const relMap: Record<string, string> = {};
    if (relsFile) {
      const relsXmlStr = await relsFile.async('string');
      const relsDoc = new DOMParser().parseFromString(relsXmlStr, 'text/xml');
      const relNodes = relsDoc.getElementsByTagName('Relationship');
      for (let i = 0; i < relNodes.length; i++) {
        const id = relNodes[i].getAttribute('Id');
        const target = relNodes[i].getAttribute('Target');
        if (id && target) {
          relMap[id] = target;
        }
      }
    }

    const xmlDoc = new DOMParser().parseFromString(docXmlStr, 'text/xml');
    let modified = false;

    // Helper to serialize MathML DOM node to string
    const serializeNode = (node: Node): string => {
      if (!node) return '';
      if (node.nodeType === 3) return node.nodeValue || '';
      const tagName = node.nodeName.toLowerCase();
      let attrs = '';
      if ((node as Element).attributes) {
        const elementAttrs = (node as Element).attributes;
        for (let i = 0; i < elementAttrs.length; i++) {
          const attr = elementAttrs[i];
          attrs += ` ${attr.name}="${attr.value}"`;
        }
      }
      let children = '';
      if (node.childNodes) {
        for (let i = 0; i < node.childNodes.length; i++) {
          children += serializeNode(node.childNodes[i]);
        }
      }
      return `<${tagName}${attrs}>${children}</${tagName}>`;
    };

    // 1. Process Office MathML (OMML: m:oMath / m:oMathPara)
    const allXmlElements = Array.from(xmlDoc.getElementsByTagName('*'));
    const oMathList = allXmlElements.filter((el) => el.localName === 'oMath');

    for (const mathEl of oMathList) {
      try {
        const mathmlNode = omml2mathml(mathEl);
        if (mathmlNode) {
          let mathmlStr = serializeNode(mathmlNode);
          mathmlStr = mathmlStr.replace(/<mroot>([\s\S]*?)<mrow>\s*<\/mrow><\/mroot>/g, '<msqrt>$1</msqrt>');
          if (!mathmlStr.includes('xmlns=')) {
            mathmlStr = mathmlStr.replace('<math', '<math xmlns="http://www.w3.org/1998/Math/MathML" display="inline"');
          } else if (!mathmlStr.includes('display=')) {
            mathmlStr = mathmlStr.replace('<math', '<math display="inline"');
          }

          const newR = xmlDoc.createElement('w:r');
          const newT = xmlDoc.createElement('w:t');
          newT.setAttribute('xml:space', 'preserve');
          newT.textContent = `___MATHML_START___${mathmlStr}___MATHML_END___`;
          newR.appendChild(newT);

          const parentPara = mathEl.closest ? mathEl.closest('oMathPara') : null;
          if (parentPara && parentPara.parentNode) {
            parentPara.parentNode.replaceChild(newR, parentPara);
          } else if (mathEl.parentNode) {
            mathEl.parentNode.replaceChild(newR, mathEl);
          }
          modified = true;
        }
      } catch (e) {
        console.warn('Failed to convert OMML:', e);
        const mTexts = Array.from(mathEl.getElementsByTagName('*'))
          .filter((el) => el.localName === 't')
          .map((el) => el.textContent || '')
          .join('');
        if (mTexts) {
          const newR = xmlDoc.createElement('w:r');
          const newT = xmlDoc.createElement('w:t');
          newT.textContent = mTexts;
          newR.appendChild(newT);
          if (mathEl.parentNode) mathEl.parentNode.replaceChild(newR, mathEl);
          modified = true;
        }
      }
    }

    // 2. Process Equation / MathType Object images (v:imagedata, w:object, w:pict, v:shape, a:blip)
    const objectNodes = allXmlElements.filter(
      (el) =>
        el.localName === 'imagedata' ||
        el.localName === 'shape' ||
        el.localName === 'object' ||
        el.localName === 'pict' ||
        el.localName === 'blip'
    );

    for (const node of objectNodes) {
      let rId =
        node.getAttribute('r:id') ||
        node.getAttribute('id') ||
        node.getAttribute('r:embed') ||
        node.getAttribute('src');

      if (!rId) {
        const childWithRId = Array.from(node.getElementsByTagName('*')).find(
          (c) =>
            c.getAttribute('r:id') ||
            c.getAttribute('id') ||
            c.getAttribute('r:embed') ||
            c.getAttribute('src')
        );
        if (childWithRId) {
          rId =
            childWithRId.getAttribute('r:id') ||
            childWithRId.getAttribute('id') ||
            childWithRId.getAttribute('r:embed') ||
            childWithRId.getAttribute('src');
        }
      }

      if (rId && relMap[rId]) {
        const targetPath = relMap[rId];
        const zipPath = targetPath.startsWith('word/')
          ? targetPath
          : 'word/' + targetPath.replace(/^\//, '');

        const imgFile = zip.file(zipPath);
        if (imgFile) {
          try {
            const extMatch = targetPath.match(/\.([a-zA-Z0-9]+)$/);
            const ext = extMatch ? extMatch[1].toLowerCase() : 'png';
            let finalDataUrl = '';

            if (ext === 'wmf') {
              const u8 = await imgFile.async('uint8array');
              const pngUrl = convertWmfToPngDataUrl(u8);
              if (pngUrl) {
                finalDataUrl = pngUrl;
              } else {
                const b64 = await imgFile.async('base64');
                finalDataUrl = `data:image/wmf;base64,${b64}`;
              }
            } else {
              const base64Data = await imgFile.async('base64');
              let mime = 'image/png';
              if (ext === 'jpg' || ext === 'jpeg') mime = 'image/jpeg';
              else if (ext === 'gif') mime = 'image/gif';
              else if (ext === 'svg') mime = 'image/svg+xml';
              else if (ext === 'webp') mime = 'image/webp';
              else if (ext === 'emf') mime = 'image/emf';

              finalDataUrl = `data:${mime};base64,${base64Data}`;
            }

            const imgHtml = `<img src="${finalDataUrl}" class="inline-formula-img" style="max-height: 2.3em; vertical-align: middle; display: inline-block; margin: 0 3px;" alt="Công thức MathType" />`;

            const newR = xmlDoc.createElement('w:r');
            const newT = xmlDoc.createElement('w:t');
            newT.setAttribute('xml:space', 'preserve');
            newT.textContent = `___MATHML_START___${imgHtml}___MATHML_END___`;
            newR.appendChild(newT);

            const container =
              node.localName === 'object' || node.localName === 'pict'
                ? node
                : node.parentNode;

            if (container && container.parentNode) {
              container.parentNode.replaceChild(newR, container);
              modified = true;
            }
          } catch (err) {
            console.warn('Failed to extract embedded formula/image:', err);
          }
        }
      }
    }

    if (modified) {
      const serializer = new XMLSerializer();
      const updatedDocXml = serializer.serializeToString(xmlDoc);
      zip.file('word/document.xml', updatedDocXml);
      return await zip.generateAsync({ type: 'arraybuffer' });
    }
  } catch (err) {
    console.error('Error preprocessing docx for MathML/Equations:', err);
  }
  return arrayBuffer;
}

/**
 * Parse uploaded .docx file and convert to Quiz Questions.
 * Mammoth convertImage is hooked to ensure any standard or inline images (including WMF)
 * are rendered into clean base64 data URLs instead of failing!
 */
export async function parseDocxFile(
  file: File,
  partNum: 1 | 2 | 3
): Promise<any[]> {
  const arrayBuffer = await file.arrayBuffer();
  const processedBuffer = await preprocessDocxArrayBuffer(arrayBuffer);

  const mammothOptions = {
    convertImage: mammoth.images.imgElement(async (image: any) => {
      try {
        const buffer = await image.read('uint8array');
        const contentType = image.contentType || 'image/png';

        if (contentType.includes('wmf')) {
          const pngUrl = convertWmfToPngDataUrl(buffer);
          if (pngUrl) {
            return {
              src: pngUrl,
              style: 'max-height: 2.3em; vertical-align: middle; display: inline-block; margin: 0 3px;',
              alt: 'Công thức MathType',
            };
          }
        }

        const b64 = await image.read('base64');
        return {
          src: `data:${contentType};base64,${b64}`,
          style: 'max-height: 2.3em; vertical-align: middle; display: inline-block; margin: 0 3px;',
          alt: 'Công thức',
        };
      } catch (e) {
        console.warn('Error converting mammoth image:', e);
        return { src: '' };
      }
    }),
  };

  const result = await mammoth.convertToHtml({ arrayBuffer: processedBuffer }, mammothOptions);
  let html = result.value;

  // Unescape MATHML and formula blocks injected in preprocessDocxArrayBuffer
  html = html.replace(/___MATHML_START___([\s\S]*?)___MATHML_END___/g, (_, inner) => {
    return inner
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/&quot;/g, '"');
  });

  return extractQuestionsFromHtml(html, partNum);
}

/**
 * Extract question items (Part 1, Part 2, Part 3) from HTML.
 * Supports:
 * - Each option on its own line: A. ... B. ...
 * - Multiple options on a single line / table: A. 10 cm. B. 12,0 cm. *C. 12 cm. D. 10,2 cm.
 * - Starred (*) or Underlined correct answers
 * - MathML and MathType images
 */
export function extractQuestionsFromHtml(html: string, partNum: 1 | 2 | 3): any[] {
  const tempDiv = document.createElement('div');
  tempDiv.innerHTML = html;

  const blocks = Array.from(tempDiv.querySelectorAll('p, table, li, div'));
  const questions: any[] = [];

  const hasMeaningfulContent = (block: Element): boolean => {
    if (!block) return false;
    const text = ((block as HTMLElement).innerText || block.textContent || '').trim();
    return text.length > 0 || !!block.querySelector('img, math, mjx-container');
  };

  const getBlockHtml = (block: Element): string => {
    if (!block) return '';
    const clone = block.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('img').forEach((img) => {
      if (!img.getAttribute('style')) {
        img.style.maxWidth = '100%';
        img.style.height = 'auto';
        img.style.display = 'inline-block';
        img.style.verticalAlign = 'middle';
        img.style.margin = '2px 4px';
      }
    });
    return clone.innerHTML.trim();
  };

  const appendVisualBlock = (currentQ: any, block: Element) => {
    if (!currentQ || !block) return;
    const visualNodes = block.querySelectorAll('img, math, mjx-container');
    if (!visualNodes.length) return;

    const current = document.createElement('div');
    current.innerHTML = currentQ.question || '';
    const existingImageSrcs = new Set(
      Array.from(current.querySelectorAll('img'))
        .map((img) => img.getAttribute('src') || img.src)
        .filter(Boolean)
    );

    const clone = block.cloneNode(true) as HTMLElement;
    clone.querySelectorAll('img').forEach((img) => {
      const src = img.getAttribute('src') || img.src;
      if (src && existingImageSrcs.has(src)) {
        img.remove();
      } else if (src) {
        existingImageSrcs.add(src);
      }
    });

    const visualHtml = clone.innerHTML.trim();
    if (visualHtml) {
      currentQ.question = (currentQ.question || '') + '<br>' + visualHtml;
    }
  };

  const tryParseInlineOptions = (rawHtml: string): Array<{ key: string; text: string; isCorrect: boolean }> => {
    const markerRegex = /(?:^|\s|>)([\*]?\s*[A-D][\.:])\s*/g;
    const matches: Array<{ fullMatch: string; marker: string; index: number }> = [];
    let m;
    while ((m = markerRegex.exec(rawHtml)) !== null) {
      matches.push({
        fullMatch: m[0],
        marker: m[1],
        index: m.index + (m[0].indexOf(m[1])),
      });
    }

    if (matches.length < 2) return [];

    const optionsList: Array<{ key: string; text: string; isCorrect: boolean }> = [];
    for (let i = 0; i < matches.length; i++) {
      const cur = matches[i];
      const start = cur.index + cur.marker.length;
      const end = i + 1 < matches.length ? matches[i + 1].index : rawHtml.length;
      let optContent = rawHtml.substring(start, end).trim();

      optContent = optContent.replace(/^<\/?[^>]+>/g, '').trim();

      const isStarred = cur.marker.includes('*');
      const letterMatch = cur.marker.match(/[A-D]/i);
      if (letterMatch) {
        optionsList.push({
          key: letterMatch[0].toUpperCase(),
          text: optContent,
          isCorrect: isStarred,
        });
      }
    }

    return optionsList;
  };

  if (partNum === 1) {
    let currentQ: QuizQuestionP1 | null = null;

    blocks.forEach((block) => {
      if (!hasMeaningfulContent(block)) return;
      const txt = ((block as HTMLElement).innerText || block.textContent || '').trim();
      const innerHtml = getBlockHtml(block);

      if (/^\s*Câu\s+\d+[\.:]/i.test(txt)) {
        if (currentQ) questions.push(currentQ);
        currentQ = {
          question: innerHtml.replace(/^\s*Câu\s+\d+[\.:]?\s*/i, '').trim(),
          options: {},
          correct: 'A',
        };
        return;
      }

      if (currentQ) {
        const inlineOpts = tryParseInlineOptions(innerHtml);
        if (inlineOpts.length >= 2) {
          inlineOpts.forEach((opt) => {
            currentQ!.options[opt.key] = opt.text;
            if (opt.isCorrect) currentQ!.correct = opt.key;
          });
          return;
        }
      }

      if (currentQ && /^\s*\*?\s*"?\s*[A-D][\.:]/i.test(txt)) {
        const isStarred = txt.includes('*') || innerHtml.includes('*');
        const isUnderlined = innerHtml.includes('<u>') || innerHtml.includes('underline');
        const cleanTxt = txt.replace(/"/g, '').replace(/\*/g, '').trim();
        const optMatch = cleanTxt.match(/^([A-D])[\.:]/i);

        if (optMatch) {
          const optKey = optMatch[1].toUpperCase();
          let optContent = innerHtml
            .replace(/^<p[^>]*>/i, '')
            .replace(/<\/p>$/i, '')
            .replace(/^\s*\*?\s*"?\s*[A-D][\.:]?\s*/i, '')
            .trim();

          if (!optContent) {
            const txtMatch = cleanTxt.match(/^([A-D])[\.:]\s*(.*)/i);
            optContent = txtMatch ? txtMatch[2].trim() : '';
          }

          currentQ.options[optKey] = optContent;
          if (isStarred || isUnderlined) currentQ.correct = optKey;
        }
        return;
      }

      if (currentQ) appendVisualBlock(currentQ, block);
    });

    if (currentQ) questions.push(currentQ);
  } else if (partNum === 2) {
    let currentQ: QuizQuestionP2 | null = null;

    blocks.forEach((block) => {
      if (!hasMeaningfulContent(block)) return;
      const txt = ((block as HTMLElement).innerText || block.textContent || '').trim();
      const innerHtml = getBlockHtml(block);

      if (/^\s*Câu\s+\d+[\.:]/i.test(txt)) {
        if (currentQ) questions.push(currentQ);
        currentQ = {
          question: innerHtml.replace(/^\s*Câu\s+\d+[\.:]?\s*/i, '').trim(),
          options: {},
          correctMap: {},
        };
        return;
      }

      if (currentQ && /^\s*\*?\s*"?\s*[A-D][\.:]/i.test(txt)) {
        const isStarred = txt.includes('*') || innerHtml.includes('*');
        const isUnderlined = innerHtml.includes('<u>') || innerHtml.includes('underline');
        const cleanTxt = txt.replace(/"/g, '').replace(/\*/g, '').trim();
        const optMatch = cleanTxt.match(/^([A-D])[\.:]/i);

        if (optMatch) {
          const optKey = optMatch[1].toUpperCase();
          let optContent = innerHtml
            .replace(/^<p[^>]*>/i, '')
            .replace(/<\/p>$/i, '')
            .replace(/^\s*\*?\s*"?\s*[A-D][\.:]?\s*/i, '')
            .trim();

          if (!optContent) {
            const txtMatch = cleanTxt.match(/^([A-D])[\.:]\s*(.*)/i);
            optContent = txtMatch ? txtMatch[2].trim() : '';
          }

          currentQ.options[optKey] = optContent;
          currentQ.correctMap[optKey] = isStarred || isUnderlined ? 'DUNG' : 'SAI';
        }
        return;
      }

      if (currentQ) appendVisualBlock(currentQ, block);
    });

    if (currentQ) questions.push(currentQ);
  } else if (partNum === 3) {
    let currentQ: QuizQuestionP3 | null = null;

    blocks.forEach((block) => {
      if (!hasMeaningfulContent(block)) return;
      const txt = ((block as HTMLElement).innerText || block.textContent || '').trim();
      const innerHtml = getBlockHtml(block);

      if (/^\s*Câu\s+\d+[\.:]/i.test(txt)) {
        if (currentQ) questions.push(currentQ);
        currentQ = {
          question: innerHtml.replace(/^\s*Câu\s+\d+[\.:]?\s*/i, '').trim(),
          correct: '',
        };
        return;
      }

      if (currentQ && (txt.startsWith('*') || txt.toLowerCase().includes('đáp án'))) {
        currentQ.correct = txt
          .replace(/"/g, '')
          .replace(/^\*\s*Đáp\s*án[\.:]?\s*/i, '')
          .replace(/^Đáp\s*án[\.:]?\s*/i, '')
          .replace(/^\*\s*/, '')
          .trim();
        return;
      }

      if (currentQ) appendVisualBlock(currentQ, block);
    });

    if (currentQ) questions.push(currentQ);
  }

  return questions;
}
