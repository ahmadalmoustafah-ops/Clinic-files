import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  HeadingLevel,
  ImageRun,
  Packer,
  Paragraph,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from 'docx';
import { MedicalImage, PatientRecord } from '../types';
import { Language, translations } from '../i18n/translations';

interface ProcessedImageData {
  data: Uint8Array;
  type: 'png' | 'jpg' | 'gif' | 'bmp';
  width: number;
  height: number;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

async function loadImageDimensions(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => {
      resolve({
        width: img.naturalWidth || 400,
        height: img.naturalHeight || 300,
      });
    };
    img.onerror = () => resolve({ width: 400, height: 300 });
    img.src = dataUrl;
  });
}

async function convertDataUrlToPngUint8Array(
  dataUrl: string,
  maxW = 800
): Promise<{ data: Uint8Array; width: number; height: number } | null> {
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      try {
        const origW = img.naturalWidth || 400;
        const origH = img.naturalHeight || 300;
        const ratio = origW > maxW ? maxW / origW : 1;
        const w = Math.max(1, Math.round(origW * ratio));
        const h = Math.max(1, Math.round(origH * ratio));

        const canvas = document.createElement('canvas');
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          resolve(null);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        const pngDataUrl = canvas.toDataURL('image/png');
        const base64 = pngDataUrl.split(',')[1];
        resolve({
          data: base64ToUint8Array(base64),
          width: origW,
          height: origH,
        });
      } catch {
        resolve(null);
      }
    };
    img.onerror = () => resolve(null);
    img.src = dataUrl;
  });
}

async function prepareImageForWord(img: MedicalImage): Promise<ProcessedImageData | null> {
  try {
    if (!img.url || !img.url.startsWith('data:')) {
      return null;
    }

    const match = img.url.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
    if (!match) {
      return null;
    }

    const mimeSubtype = match[1].toLowerCase();
    const base64Body = match[2];

    let type: 'png' | 'jpg' | 'gif' | 'bmp' | null = null;
    if (mimeSubtype === 'png') type = 'png';
    else if (mimeSubtype === 'jpeg' || mimeSubtype === 'jpg') type = 'jpg';
    else if (mimeSubtype === 'gif') type = 'gif';
    else if (mimeSubtype === 'bmp') type = 'bmp';

    let finalData: Uint8Array;
    let naturalWidth: number;
    let naturalHeight: number;

    if (type) {
      finalData = base64ToUint8Array(base64Body);
      const dims = await loadImageDimensions(img.url);
      naturalWidth = dims.width;
      naturalHeight = dims.height;
    } else {
      // Convert WebP / SVG / unknown image format to PNG offline via Canvas
      const converted = await convertDataUrlToPngUint8Array(img.url);
      if (!converted) return null;
      type = 'png';
      finalData = converted.data;
      naturalWidth = converted.width;
      naturalHeight = converted.height;
    }

    // Scale to fit nicely on an A4 Word page (max width 430px, max height 320px)
    const maxWidth = 430;
    const maxHeight = 320;
    const scale = Math.min(maxWidth / naturalWidth, maxHeight / naturalHeight, 1);

    return {
      data: finalData,
      type,
      width: Math.max(40, Math.round(naturalWidth * scale)),
      height: Math.max(40, Math.round(naturalHeight * scale)),
    };
  } catch {
    return null;
  }
}

function makeTextParagraphs(
  text: string | undefined,
  isRTL: boolean,
  emptyFallback: string,
  options?: { bold?: boolean; color?: string; size?: number }
): Paragraph[] {
  const value = (text || '').trim();
  const lines = value ? value.split(/\r?\n/) : [emptyFallback];
  const isEmpty = !value;

  return lines.map(
    (line) =>
      new Paragraph({
        bidirectional: isRTL,
        alignment: isRTL ? AlignmentType.RIGHT : AlignmentType.LEFT,
        spacing: { before: 40, after: 40, line: 276 },
        children: [
          new TextRun({
            text: line || ' ',
            bold: options?.bold ?? false,
            italics: isEmpty,
            color: isEmpty ? '94A3B8' : options?.color ?? '1E293B',
            size: options?.size ?? 21, // 10.5pt
            font: isRTL ? 'Arial' : 'Calibri',
            rightToLeft: isRTL,
          }),
        ],
      })
  );
}

function makeSectionHeading(title: string, isRTL: boolean, accentHex = '0284C7'): Paragraph {
  return new Paragraph({
    heading: HeadingLevel.HEADING_2,
    bidirectional: isRTL,
    alignment: isRTL ? AlignmentType.RIGHT : AlignmentType.LEFT,
    spacing: { before: 260, after: 120 },
    border: {
      bottom: {
        color: accentHex,
        space: 4,
        style: BorderStyle.SINGLE,
        size: 12,
      },
    },
    children: [
      new TextRun({
        text: title,
        bold: true,
        color: accentHex,
        size: 26, // 13pt
        font: isRTL ? 'Arial' : 'Calibri',
        rightToLeft: isRTL,
      }),
    ],
  });
}

interface FieldRowInput {
  label: string;
  value: string;
  highlight?: boolean;
}

function makeKeyValueTable(
  rows: FieldRowInput[],
  isRTL: boolean,
  emptyFallback: string,
  labelBgHex = 'F0F9FF'
): Table {
  const borderSpec = {
    style: BorderStyle.SINGLE,
    size: 4,
    color: 'CBD5E1',
  };

  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    visuallyRightToLeft: isRTL,
    borders: {
      top: borderSpec,
      bottom: borderSpec,
      left: borderSpec,
      right: borderSpec,
      insideHorizontal: borderSpec,
      insideVertical: borderSpec,
    },
    rows: rows.map(
      (row) =>
        new TableRow({
          cantSplit: true,
          children: [
            new TableCell({
              width: { size: 28, type: WidthType.PERCENTAGE },
              shading: {
                fill: row.highlight ? 'FFF1F2' : labelBgHex,
                type: ShadingType.CLEAR,
                color: 'auto',
              },
              margins: { top: 90, bottom: 90, left: 130, right: 130 },
              children: [
                new Paragraph({
                  bidirectional: isRTL,
                  alignment: isRTL ? AlignmentType.RIGHT : AlignmentType.LEFT,
                  children: [
                    new TextRun({
                      text: row.label,
                      bold: true,
                      color: row.highlight ? 'BE123C' : '0369A1',
                      size: 21,
                      font: isRTL ? 'Arial' : 'Calibri',
                      rightToLeft: isRTL,
                    }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 72, type: WidthType.PERCENTAGE },
              shading: row.highlight
                ? {
                    fill: 'FFFBFB',
                    type: ShadingType.CLEAR,
                    color: 'auto',
                  }
                : undefined,
              margins: { top: 90, bottom: 90, left: 130, right: 130 },
              children: makeTextParagraphs(row.value, isRTL, emptyFallback, {
                color: row.highlight && row.value.trim() ? '9F1239' : '1E293B',
                bold: Boolean(row.highlight && row.value.trim()),
              }),
            }),
          ],
        })
    ),
  });
}

async function buildImageBlocks(
  images: MedicalImage[] | undefined,
  isRTL: boolean
): Promise<Paragraph[]> {
  if (!images || images.length === 0) return [];

  const blocks: Paragraph[] = [];
  for (let i = 0; i < images.length; i++) {
    const img = images[i];
    const prepared = await prepareImageForWord(img);
    if (!prepared) continue;

    blocks.push(
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 140, after: 60 },
        children: [
          new ImageRun({
            type: prepared.type,
            data: prepared.data,
            transformation: {
              width: prepared.width,
              height: prepared.height,
            },
          }),
        ],
      })
    );

    blocks.push(
      new Paragraph({
        bidirectional: isRTL,
        alignment: AlignmentType.CENTER,
        spacing: { before: 0, after: 140 },
        children: [
          new TextRun({
            text: `${img.name || `Image ${i + 1}`} (${img.date || ''})`,
            italics: true,
            size: 18,
            color: '64748B',
            font: isRTL ? 'Arial' : 'Calibri',
            rightToLeft: isRTL,
          }),
        ],
      })
    );
  }
  return blocks;
}

function sanitizeFileName(name: string): string {
  const cleaned = name
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, '_')
    .trim();
  return cleaned || 'Patient_File';
}

export async function exportPatientToWord(
  patient: PatientRecord,
  language: Language
): Promise<string> {
  const isRTL = language === 'ar';
  const t = translations[language];
  const emptyFallback = isRTL ? 'غير مسجل' : 'Not recorded';

  const now = new Date();
  const exportTimestamp = `${now.toISOString().split('T')[0]} ${now.toLocaleTimeString(
    isRTL ? 'ar-EG' : 'en-US',
    { hour: '2-digit', minute: '2-digit' }
  )}`;

  const docChildren: (Paragraph | Table)[] = [];

  // 1. Clinic Banner Header Block
  docChildren.push(
    new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      visuallyRightToLeft: isRTL,
      borders: {
        top: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        bottom: { style: BorderStyle.SINGLE, size: 12, color: '0284C7' },
        left: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        right: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        insideHorizontal: { style: BorderStyle.NONE, size: 0, color: 'auto' },
        insideVertical: { style: BorderStyle.NONE, size: 0, color: 'auto' },
      },
      rows: [
        new TableRow({
          children: [
            new TableCell({
              shading: {
                fill: '0284C7',
                type: ShadingType.CLEAR,
                color: 'auto',
              },
              margins: { top: 160, bottom: 160, left: 200, right: 200 },
              children: [
                new Paragraph({
                  bidirectional: isRTL,
                  alignment: isRTL ? AlignmentType.RIGHT : AlignmentType.LEFT,
                  spacing: { after: 60 },
                  children: [
                    new TextRun({
                      text: `${t.appName} — ${isRTL ? 'الملف الطبي السريري للمريض' : 'Patient Clinical Record'}`,
                      bold: true,
                      color: 'FFFFFF',
                      size: 30, // 15pt
                      font: isRTL ? 'Arial' : 'Calibri',
                      rightToLeft: isRTL,
                    }),
                  ],
                }),
                new Paragraph({
                  bidirectional: isRTL,
                  alignment: isRTL ? AlignmentType.RIGHT : AlignmentType.LEFT,
                  children: [
                    new TextRun({
                      text: `${t.patientFullName}: ${patient.name || emptyFallback}   |   ${t.examDatePrefix} ${patient.examDate || emptyFallback}`,
                      color: 'E0F2FE',
                      size: 21,
                      bold: true,
                      font: isRTL ? 'Arial' : 'Calibri',
                      rightToLeft: isRTL,
                    }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
  );

  // Export timestamp note
  docChildren.push(
    new Paragraph({
      bidirectional: isRTL,
      alignment: isRTL ? AlignmentType.LEFT : AlignmentType.RIGHT,
      spacing: { before: 80, after: 140 },
      children: [
        new TextRun({
          text: `${isRTL ? 'تاريخ إنشاء نسخة Word:' : 'Word Export Date:'} ${exportTimestamp}`,
          size: 18,
          color: '64748B',
          font: isRTL ? 'Arial' : 'Calibri',
          rightToLeft: isRTL,
        }),
      ],
    })
  );

  // 2. Demographics Table
  docChildren.push(makeSectionHeading(t.demographicsSection, isRTL, '0284C7'));
  docChildren.push(
    makeKeyValueTable(
      [
        { label: t.patientFullName, value: patient.name },
        { label: t.age, value: patient.age },
        { label: t.examDateAuto, value: patient.examDate },
        { label: t.residence, value: patient.address },
        { label: t.phone, value: patient.phone || '' },
      ],
      isRTL,
      emptyFallback,
      'F0F9FF'
    )
  );

  // 3. Habits & Medical History Table
  docChildren.push(makeSectionHeading(t.historySection, isRTL, '0F766E'));
  docChildren.push(
    makeKeyValueTable(
      [
        { label: t.habits, value: patient.habits },
        { label: t.medicalHistory, value: patient.medicalHistory },
        { label: t.surgicalHistory, value: patient.surgicalHistory },
        { label: t.drugHistory, value: patient.drugHistory },
        { label: t.allergyHistory, value: patient.allergyHistory, highlight: Boolean(patient.allergyHistory?.trim()) },
        { label: t.familyHistory, value: patient.familyHistory },
      ],
      isRTL,
      emptyFallback,
      'F0FDFA'
    )
  );

  // 4. Symptoms, Clinical Exam & Investigations
  docChildren.push(makeSectionHeading(t.clinicalSection, isRTL, '0284C7'));
  docChildren.push(
    makeKeyValueTable(
      [
        { label: t.symptoms, value: patient.symptoms },
        { label: t.clinicalExam, value: patient.clinicalExam },
        { label: t.echo, value: patient.echo },
        { label: t.labs, value: patient.labs },
        { label: t.otherInvestigations, value: patient.otherInvestigations },
      ],
      isRTL,
      emptyFallback,
      'F0F9FF'
    )
  );

  // 5. Differential Diagnosis & Treatment Plan
  docChildren.push(makeSectionHeading(t.planSection, isRTL, '0369A1'));
  docChildren.push(
    makeKeyValueTable(
      [
        { label: t.differentialDiagnosis, value: patient.differentialDiagnosis },
        { label: t.waiting, value: patient.waiting },
        { label: t.treatment, value: patient.treatment },
      ],
      isRTL,
      emptyFallback,
      'EFF6FF'
    )
  );

  // 6. Main File Medical Images (if any)
  if (patient.images && patient.images.length > 0) {
    docChildren.push(makeSectionHeading(t.imagesAndScans, isRTL, '0F766E'));
    const imageBlocks = await buildImageBlocks(patient.images, isRTL);
    docChildren.push(...imageBlocks);
  }

  // 7. Follow-Ups Log (if any)
  if (patient.followUps && patient.followUps.length > 0) {
    docChildren.push(
      makeSectionHeading(
        `${t.followUpHistoryTitle} (${patient.followUps.length})`,
        isRTL,
        '0F766E'
      )
    );

    for (let idx = 0; idx < patient.followUps.length; idx++) {
      const fu = patient.followUps[idx];
      const followUpNumber = patient.followUps.length - idx;

      docChildren.push(
        new Paragraph({
          bidirectional: isRTL,
          alignment: isRTL ? AlignmentType.RIGHT : AlignmentType.LEFT,
          spacing: { before: 180, after: 80 },
          children: [
            new TextRun({
              text: `${t.followUpItemTitle} #${followUpNumber}  —  ${t.autoDatePrefix} ${fu.date}`,
              bold: true,
              color: '0F766E',
              size: 23,
              font: isRTL ? 'Arial' : 'Calibri',
              rightToLeft: isRTL,
            }),
          ],
        })
      );

      docChildren.push(
        makeKeyValueTable(
          [
            { label: t.clinicalEvolution, value: fu.clinicalEvolution },
            { label: t.newExam, value: fu.newExam },
            { label: t.labsFollowUp, value: fu.labs },
            { label: t.investigationsFollowUp, value: fu.investigations },
            { label: t.waitingFollowUp, value: fu.waiting },
            { label: t.treatmentFollowUp, value: fu.treatment },
          ],
          isRTL,
          emptyFallback,
          'F0FDFA'
        )
      );

      if (fu.images && fu.images.length > 0) {
        const fuImgBlocks = await buildImageBlocks(fu.images, isRTL);
        docChildren.push(...fuImgBlocks);
      }
    }
  }

  // Build Word Document
  const doc = new Document({
    creator: 'Easy clinic - Dr. Ahmad Ali Al-Mustafa',
    title: `${patient.name || 'Patient'} - ${t.appName}`,
    description: t.appSubtitle,
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: 720,
              right: 720,
              bottom: 720,
              left: 720,
            },
          },
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                bidirectional: isRTL,
                alignment: AlignmentType.CENTER,
                children: [
                  new TextRun({
                    text: `${t.appName} · ${t.designerName} — ${t.designerSpecialty}`,
                    size: 18,
                    color: '94A3B8',
                    font: isRTL ? 'Arial' : 'Calibri',
                    rightToLeft: isRTL,
                  }),
                ],
              }),
            ],
          }),
        },
        children: docChildren,
      },
    ],
  });

  // Generate Blob locally offline and trigger immediate download
  const blob = await Packer.toBlob(doc);
  const safeName = sanitizeFileName(patient.name);
  const datePart = patient.examDate || now.toISOString().split('T')[0];
  const fileName = `${safeName}_${datePart}.docx`;

  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  // Revoke object URL cleanly after download initiates
  setTimeout(() => URL.revokeObjectURL(url), 1500);

  return fileName;
}
