import { Router, type IRouter } from "express";
import healthRouter from "./health";
import roomsRouter from "./rooms";
import voiceRouter from "./voice";

const router: IRouter = Router();

router.use(healthRouter);
router.use(roomsRouter);
router.use(voiceRouter);

export default router;
