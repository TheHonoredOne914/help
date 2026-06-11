import { Router, type IRouter } from "express";
import healthRouter from "./health.js";
import anthropicRouter from "./anthropic.js";
import providersRouter from "./providers.js";
import archivesRouter from "./archives.js";

const router: IRouter = Router();

router.use("/", healthRouter);
router.use("/", archivesRouter);
router.use("/", anthropicRouter);
router.use("/", providersRouter);

export default router;
