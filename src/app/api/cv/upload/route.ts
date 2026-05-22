import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { PDFParse } from 'pdf-parse'

const MAX_BYTES = 10 * 1024 * 1024 // 10 MB

export async function POST(req: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const formData = await req.formData()
  const file = formData.get('file') as File | null

  if (!file) {
    return NextResponse.json(
      { error: 'No file provided', code: 'missing_file' },
      { status: 422 }
    )
  }

  if (file.type !== 'application/pdf') {
    return NextResponse.json(
      { error: 'Only PDF files are supported', code: 'invalid_type' },
      { status: 422 }
    )
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: 'File is too large — maximum 10 MB', code: 'too_large' },
      { status: 422 }
    )
  }

  let extractedText: string
  try {
    const buffer = Buffer.from(await file.arrayBuffer())
    const parser = new PDFParse({ data: buffer })
    const result = await parser.getText()
    extractedText = result.text.trim()
  } catch (err) {
    console.error('[cv/upload] pdf-parse error:', err)
    return NextResponse.json(
      {
        error: 'Could not extract text from this PDF. Try copying and pasting your CV text instead.',
        code: 'extraction_failed',
      },
      { status: 422 }
    )
  }

  const { error } = await supabase
    .from('profiles')
    .upsert({ id: user.id, cv_text: extractedText }, { onConflict: 'id' })

  if (error) {
    return NextResponse.json({ error: error.message, code: 'db_error' }, { status: 500 })
  }

  return NextResponse.json({ extractedText })
}
