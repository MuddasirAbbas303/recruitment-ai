import { readFile } from 'node:fs/promises'
import mammoth from 'mammoth'
import { PDFParse } from 'pdf-parse'

const PDF_MIME_TYPE = 'application/pdf'
const DOCX_MIME_TYPE =
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document'

export class ResumeParserError extends Error {}

async function extractPdfText(filePath) {
  const data = await readFile(filePath)
  const parser = new PDFParse({ data })

  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

async function extractDocxText(filePath) {
  const result = await mammoth.extractRawText({ path: filePath })
  return result.value
}

export async function extractResumeText(filePath, mimeType) {
  try {
    let text

    if (mimeType === PDF_MIME_TYPE) {
      text = await extractPdfText(filePath)
    } else if (mimeType === DOCX_MIME_TYPE) {
      text = await extractDocxText(filePath)
    } else {
      throw new ResumeParserError('Unsupported resume type')
    }

    const normalizedText = text
      .replace(/\u0000/g, '')
      .replace(/\s+/g, ' ')
      .trim()

    if (!normalizedText) {
      throw new ResumeParserError('No extractable text found')
    }

    return normalizedText
  } catch (error) {
    if (error instanceof ResumeParserError) {
      throw error
    }

    throw new ResumeParserError('Unable to extract text', { cause: error })
  }
}
