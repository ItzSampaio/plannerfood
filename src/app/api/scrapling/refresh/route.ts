import { NextResponse } from 'next/server';
import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { existsSync } from 'node:fs';
import { TESTED_HISTORICAL_OBSERVATIONS, type ScraplingScrapedItem } from '@/lib/pricing/scrapling';

function tryExecutePython(workerPath: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number | null }> {
  const pythonExecutables = process.platform === 'win32' ? ['py', 'python', 'python3'] : ['python3', 'python'];

  return new Promise((resolvePromise) => {
    let currentIdx = 0;

    function tryNext() {
      if (currentIdx >= pythonExecutables.length) {
        resolvePromise({ stdout: '', stderr: 'Nenhum executável Python utilizável foi encontrado no sistema.', code: -1 });
        return;
      }

      const exe = pythonExecutables[currentIdx]!;
      currentIdx += 1;

      try {
        const proc = spawn(exe, [workerPath, ...args], {
          cwd: process.cwd(),
          shell: false,
          windowsHide: true,
        });

        let stdout = '';
        let stderr = '';

        proc.stdout.on('data', (chunk) => { stdout += String(chunk); });
        proc.stderr.on('data', (chunk) => { stderr += String(chunk); });

        proc.on('error', () => {
          tryNext();
        });

        proc.on('close', (code) => {
          if (code === 0 && stdout.trim()) {
            resolvePromise({ stdout, stderr, code });
          } else if (code !== 0 && stdout.trim().startsWith('{')) {
            // Worker emitted structured error JSON
            resolvePromise({ stdout, stderr, code });
          } else {
            tryNext();
          }
        });
      } catch {
        tryNext();
      }
    }

    tryNext();
  });
}

export async function POST(request: Request) {
  let body: { useFallback?: boolean; simulateError?: boolean } = {};
  try {
    body = await request.json();
  } catch {
    // Body is optional
  }

  const url = new URL(request.url);
  const useFallback = body.useFallback || url.searchParams.get('fallback') === 'true';

  if (body.simulateError || url.searchParams.get('simulate_error') === 'true') {
    return NextResponse.json({
      ok: false,
      error: 'Falha simulada na comunicação com o retalhista. Nenhum dado foi alterado.',
      code: 'SIMULATED_RETAILER_FAILURE',
    }, { status: 502 });
  }

  if (useFallback) {
    return NextResponse.json({
      ok: true,
      source: 'historical_tested',
      timestamp: new Date().toISOString(),
      products: TESTED_HISTORICAL_OBSERVATIONS,
      notice: 'Observações públicas testadas de referência. Confirme os preços e a segurança antes de aprovar.',
    });
  }

  const workerPath = resolve(process.cwd(), 'scraper', 'worker.py');
  if (!existsSync(workerPath)) {
    return NextResponse.json({
      ok: false,
      error: 'O script do worker Scrapling (scraper/worker.py) não foi encontrado no projeto.',
      code: 'WORKER_SCRIPT_MISSING',
    }, { status: 500 });
  }

  const { stdout, stderr, code } = await tryExecutePython(workerPath, ['--json']);

  if (code === 0 && stdout) {
    try {
      const parsed = JSON.parse(stdout) as { ok: boolean; products?: ScraplingScrapedItem[]; error?: string };
      if (parsed.ok && Array.isArray(parsed.products)) {
        return NextResponse.json({
          ok: true,
          source: 'scrapling_worker',
          timestamp: new Date().toISOString(),
          products: parsed.products,
        });
      }
      return NextResponse.json({
        ok: false,
        error: parsed.error || 'A resposta do worker Scrapling foi inválida.',
        code: 'WORKER_OUTPUT_INVALID',
      }, { status: 502 });
    } catch {
      return NextResponse.json({
        ok: false,
        error: 'Não foi possível interpretar a saída JSON do worker Scrapling.',
        code: 'JSON_PARSE_ERROR',
      }, { status: 502 });
    }
  }

  // If worker failed or python was unavailable
  return NextResponse.json({
    ok: false,
    error: 'O interpretador Python não está disponível no sistema ou o retalhista não pôde ser contactado.',
    code: 'PYTHON_UNAVAILABLE',
    details: stderr.trim() || undefined,
    fallbackAvailable: true,
    historicalObservations: TESTED_HISTORICAL_OBSERVATIONS,
  }, { status: 503 });
}

export async function GET(request: Request) {
  return POST(request);
}
