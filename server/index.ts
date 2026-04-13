import { serve } from '@hono/node-server'
import { createApp } from './app.js'
import { loadBrainFlowEnv } from './load-env.js'

loadBrainFlowEnv()

const port = Number(process.env.AI_SERVER_PORT ?? 8787)

serve(
  {
    fetch: createApp().fetch,
    port,
  },
  (info) => {
    console.log(`BrainFlow Codex bridge listening on http://127.0.0.1:${info.port}`)
  },
)
