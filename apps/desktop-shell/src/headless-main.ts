import { runHeadlessDemoCli } from './headless-cli'

declare const process: {
  argv: string[]
  exitCode?: number
}

void runHeadlessDemoCli(process.argv.slice(2)).catch((error) => {
  const message = error instanceof Error ? error.message : String(error)
  console.error(message)
  process.exitCode = 1
})
