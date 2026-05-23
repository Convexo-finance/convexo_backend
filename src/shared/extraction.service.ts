import type { ZodSchema, ZodTypeAny } from 'zod'
import { getAnthropic, ANTHROPIC_MODEL } from './anthropic'
import { logger } from './logger'
import { BadRequestError } from './errors'

/**
 * Generic PDF → structured-JSON extraction via Claude.
 *
 * Caller supplies:
 *  - the PDF as a Buffer
 *  - a Zod schema describing the expected output
 *  - a system prompt tuned for the document type
 *
 * Behaviour:
 *  - one extraction call with the PDF as a base64 `document` content block
 *  - response parsed as JSON, validated against the schema
 *  - on validation failure, one retry with the failure appended to the prompt
 *  - returns parsed data + a parallel `confidence` map + raw response for audit
 *
 * The model is asked to return BOTH the data object and a confidence map; if
 * the model omits confidence, we default each field to 0.6 (it answered but
 * we don't have a self-assessment).
 */

export interface ExtractionResult<T> {
  data:             T
  confidence:       Record<string, number>
  rawResponse:      string
  modelName:        string
  promptVersion:    string
  promptTokens:     number
  completionTokens: number
}

export interface ExtractFromPdfInput<T> {
  pdfBuffer:     Buffer
  schema:        ZodSchema<T>
  systemPrompt:  string
  promptVersion: string
  maxRetries?:   number
}

const RETRY_DEFAULT = 1

export async function extractFromPdf<T>(input: ExtractFromPdfInput<T>): Promise<ExtractionResult<T>> {
  if (input.pdfBuffer.length === 0) throw new BadRequestError('PDF is empty.')

  const client      = getAnthropic()
  const base64Pdf   = input.pdfBuffer.toString('base64')
  const maxRetries  = input.maxRetries ?? RETRY_DEFAULT
  let lastError: string | null = null

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const systemPrompt = lastError
      ? `${input.systemPrompt}\n\nIMPORTANT: your previous response failed validation with this error:\n${lastError}\nReturn ONLY valid JSON that satisfies the schema this time.`
      : input.systemPrompt

    const response = await client.messages.create({
      model:      ANTHROPIC_MODEL,
      max_tokens: 4096,
      system:     systemPrompt,
      messages: [
        {
          role: 'user',
          content: [
            {
              type:   'document',
              source: { type: 'base64', media_type: 'application/pdf', data: base64Pdf },
            },
            {
              type: 'text',
              text: 'Extrae los campos requeridos por el esquema. Responde con un único objeto JSON con dos llaves de nivel superior: "data" (los campos extraídos) y "confidence" (un mapa de nombre-de-campo → valor entre 0 y 1). No incluyas texto adicional fuera del JSON. No inventes valores: si un campo no aparece en el documento, déjalo en null.',
            },
          ],
        },
      ],
    })

    const text = response.content
      .filter((b): b is Extract<typeof b, { type: 'text' }> => b.type === 'text')
      .map(b => b.text)
      .join('')

    const parsed = tryParseJson(text)
    if (!parsed) {
      lastError = 'Response was not valid JSON.'
      logger.warn({ promptVersion: input.promptVersion, attempt }, 'extraction.parse_failed')
      continue
    }

    const dataResult = input.schema.safeParse(parsed.data ?? parsed)
    if (!dataResult.success) {
      lastError = JSON.stringify(dataResult.error.flatten())
      logger.warn({ promptVersion: input.promptVersion, attempt, error: lastError }, 'extraction.schema_failed')
      continue
    }

    const confidence = normalizeConfidence(parsed.confidence, dataResult.data as Record<string, unknown>)

    return {
      data:             dataResult.data,
      confidence,
      rawResponse:      text,
      modelName:        ANTHROPIC_MODEL,
      promptVersion:    input.promptVersion,
      promptTokens:     response.usage.input_tokens,
      completionTokens: response.usage.output_tokens,
    }
  }

  throw new BadRequestError(
    `Document extraction failed after ${maxRetries + 1} attempts: ${lastError ?? 'unknown error'}`,
  )
}

function tryParseJson(text: string): { data?: unknown; confidence?: unknown } | null {
  // Be lenient: strip code fences if the model wraps the JSON in ```json ... ```
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    const obj = JSON.parse(cleaned) as unknown
    if (obj && typeof obj === 'object') return obj as { data?: unknown; confidence?: unknown }
    return null
  } catch {
    return null
  }
}

function normalizeConfidence(
  raw: unknown,
  data: Record<string, unknown>,
): Record<string, number> {
  const out: Record<string, number> = {}
  const rawMap = (raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {})
  for (const key of Object.keys(data)) {
    const v = rawMap[key]
    if (typeof v === 'number' && v >= 0 && v <= 1) {
      out[key] = v
    } else {
      out[key] = 0.6
    }
  }
  return out
}

// Re-export the Zod type so callers can pass schemas without importing zod twice.
export type { ZodTypeAny }
