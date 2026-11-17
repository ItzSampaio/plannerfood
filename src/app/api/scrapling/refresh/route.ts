import { NextResponse } from 'next/server';

const disabledResponse = () => NextResponse.json({
  ok: false,
  error: 'A actualização Scrapling está desactivada. Introduza ou importe os preços localmente.',
  code: 'EXTERNAL_PRICING_DISABLED',
}, { status: 410 });

export function POST(): NextResponse {
  return disabledResponse();
}

export function GET(): NextResponse {
  return disabledResponse();
}
