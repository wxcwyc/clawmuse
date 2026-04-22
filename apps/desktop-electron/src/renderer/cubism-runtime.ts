export const CUBISM_RUNTIME_RELATIVE_PATH = 'live2d-core/live2dcubismcore.min.js'

export function resolveCubismRuntimeScriptSrc() {
  return `./${CUBISM_RUNTIME_RELATIVE_PATH}`
}

function matchesCubismRuntimeScript(script: HTMLScriptElement) {
  const expectedSrc = resolveCubismRuntimeScriptSrc()
  if (script.getAttribute('src') === expectedSrc) {
    return true
  }

  try {
    const expectedPathSuffix = `/${CUBISM_RUNTIME_RELATIVE_PATH}`
    return new URL(script.src).pathname.endsWith(expectedPathSuffix)
  }
  catch {
    return false
  }
}

function waitForScript(script: HTMLScriptElement) {
  return new Promise<boolean>((resolve) => {
    script.addEventListener('load', () => resolve(true), { once: true })
    script.addEventListener('error', () => resolve(false), { once: true })
  })
}

export async function ensureCubismRuntimeScript() {
  if (typeof document === 'undefined') {
    return false
  }

  const existing = Array
    .from(document.querySelectorAll('script'))
    .find((script): script is HTMLScriptElement => (
      script instanceof HTMLScriptElement
        && matchesCubismRuntimeScript(script)
    ))
  if (existing) {
    return true
  }

  const script = document.createElement('script')
  script.src = resolveCubismRuntimeScriptSrc()
  document.head.appendChild(script)

  return waitForScript(script)
}
