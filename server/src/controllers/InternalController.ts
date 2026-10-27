import { Request, Response, NextFunction } from 'express'
import { taskService } from '../services/taskService'

// Manual trigger for the date-based sweep (DECISIONS.md §3) — lets curl/demo/
// tests exercise it without waiting on the setInterval in app.ts.
export const InternalController = {
  async sweep(_req: Request, res: Response, next: NextFunction) {
    try {
      await taskService.runScheduledSweep()
      res.json({ ok: true })
    } catch (e) { next(e) }
  },
}
